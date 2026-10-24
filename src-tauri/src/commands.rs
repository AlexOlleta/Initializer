use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use tauri::State;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::headless::RUN_FLAG;
use crate::model::{
    AppData, BrowserCatalog, InstalledApp, LaunchReport, Preset, ResolvedShortcut, Settings,
    ShortcutLocation,
};
use crate::shortcut::{self, ShortcutSpec};
use crate::store::Store;
use crate::{apps, browsers, icons, launcher, validate, win};

const MAX_ICON_BASE64_CHARS: usize = 8 * 1024 * 1024;

#[derive(Clone)]
pub struct AppState {
    store: Store,
    write_lock: Arc<Mutex<()>>,
    apps_cache: Arc<Mutex<Option<Vec<InstalledApp>>>>,
}

impl AppState {
    pub fn new(store: Store) -> Self {
        Self {
            store,
            write_lock: Arc::new(Mutex::new(())),
            apps_cache: Arc::new(Mutex::new(None)),
        }
    }

    fn lock(&self) -> MutexGuard<'_, ()> {
        self.write_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn update(&self, change: impl FnOnce(&mut AppData) -> AppResult<()>) -> AppResult<AppData> {
        let _guard = self.lock();
        let mut data = self.store.load()?;
        change(&mut data)?;
        self.store.save(&data)?;
        Ok(data)
    }
}

async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let _com = win::ComGuard::new()?;
        task()
    })
    .await
    .map_err(|error| AppError::invalid(error.to_string()))?
}

#[tauri::command]
pub fn load_data(state: State<'_, AppState>) -> AppResult<AppData> {
    let _guard = state.lock();
    let data = state.store.load_or_recover()?;
    state.store.prune_orphan_icons(&data);
    Ok(data)
}

#[tauri::command]
pub fn save_preset(state: State<'_, AppState>, preset: Preset) -> AppResult<AppData> {
    validate::preset(&preset)?;
    state.update(|data| {
        match data.presets.iter_mut().find(|p| p.id == preset.id) {
            Some(existing) => {
                let shortcuts = std::mem::take(&mut existing.shortcuts);
                *existing = Preset {
                    shortcuts,
                    ..preset
                };
            }
            None => data.presets.push(Preset {
                shortcuts: Vec::new(),
                ..preset
            }),
        }
        Ok(())
    })
}

#[tauri::command]
pub async fn delete_preset(state: State<'_, AppState>, preset_id: Uuid) -> AppResult<AppData> {
    let state = state.inner().clone();
    blocking(move || {
        let exe = std::env::current_exe()?;
        let data = state.update(|data| {
            if let Some(preset) = data.presets.iter().find(|p| p.id == preset_id) {
                for link in &preset.shortcuts {
                    let path = Path::new(link);
                    if path.exists() && shortcut::is_owned(path, &exe, &preset_id.to_string()) {
                        fs::remove_file(path)?;
                    }
                }
            }
            data.presets.retain(|p| p.id != preset_id);
            Ok(())
        })?;
        state.store.remove_icons(preset_id);
        Ok(data)
    })
    .await
}

#[tauri::command]
pub fn reorder_presets(state: State<'_, AppState>, preset_ids: Vec<Uuid>) -> AppResult<AppData> {
    state.update(|data| {
        data.presets.sort_by_key(|preset| {
            preset_ids
                .iter()
                .position(|id| *id == preset.id)
                .unwrap_or(usize::MAX)
        });
        Ok(())
    })
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> AppResult<AppData> {
    state.update(|data| {
        data.settings = settings;
        Ok(())
    })
}

#[tauri::command]
pub async fn detect_browsers() -> AppResult<BrowserCatalog> {
    blocking(|| Ok(browsers::detect())).await
}

#[tauri::command]
pub async fn list_installed_apps(
    state: State<'_, AppState>,
    refresh: bool,
) -> AppResult<Vec<InstalledApp>> {
    let cache = state.apps_cache.clone();
    blocking(move || {
        let mut cached = cache.lock().unwrap_or_else(|p| p.into_inner());
        if refresh || cached.is_none() {
            *cached = Some(apps::list()?);
        }
        Ok(cached.clone().unwrap_or_default())
    })
    .await
}

#[tauri::command]
pub async fn path_icon(path: String) -> AppResult<Option<String>> {
    validate::absolute_path(&path)?;
    blocking(move || Ok(apps::icon_for_path(&path))).await
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    validate::absolute_path(&path).is_ok() && Path::new(&path).exists()
}

#[tauri::command]
pub async fn resolve_shortcut(path: String) -> AppResult<ResolvedShortcut> {
    validate::shortcut_path(&path)?;
    blocking(move || {
        let resolved = shortcut::resolve(Path::new(&path))?;
        validate::exe_path(&resolved.path)?;
        Ok(resolved)
    })
    .await
}

#[tauri::command]
pub fn save_icon_png(
    state: State<'_, AppState>,
    preset_id: Uuid,
    png_base64: String,
) -> AppResult<()> {
    if png_base64.len() > MAX_ICON_BASE64_CHARS {
        return Err(AppError::invalid("icon is too large"));
    }
    let bytes = BASE64
        .decode(png_base64.trim_start_matches("data:image/png;base64,"))
        .map_err(|_| AppError::invalid("invalid icon data"))?;
    icons::save_png(&state.store, preset_id, &bytes)?;
    refresh_ico(&state.store, preset_id)
}

#[tauri::command]
pub fn import_icon_image(
    state: State<'_, AppState>,
    preset_id: Uuid,
    path: String,
) -> AppResult<String> {
    validate::absolute_path(&path)?;
    icons::import_file(&state.store, preset_id, Path::new(&path))?;
    refresh_ico(&state.store, preset_id)?;
    icons::data_url(&state.store, preset_id).ok_or_else(|| AppError::NotFound("icon".into()))
}

#[tauri::command]
pub fn read_icon(state: State<'_, AppState>, preset_id: Uuid) -> Option<String> {
    icons::data_url(&state.store, preset_id)
}

#[tauri::command]
pub async fn run_preset(preset: Preset) -> AppResult<LaunchReport> {
    validate::preset(&preset)?;
    blocking(move || Ok(launcher::run(&preset, &browsers::detect()))).await
}

#[tauri::command]
pub async fn create_shortcut(
    state: State<'_, AppState>,
    preset_id: Uuid,
    location: ShortcutLocation,
    path: Option<String>,
) -> AppResult<String> {
    let state = state.inner().clone();
    blocking(move || {
        let exe = std::env::current_exe()?;
        let id_text = preset_id.to_string();
        let mut created = PathBuf::new();
        state.update(|data| {
            let preset = data
                .presets
                .iter_mut()
                .find(|p| p.id == preset_id)
                .ok_or_else(|| AppError::NotFound("preset".into()))?;
            let link_path = match (location, &path) {
                (ShortcutLocation::Custom, Some(custom)) => {
                    validate::shortcut_path(custom)?;
                    PathBuf::from(custom)
                }
                (ShortcutLocation::Custom, None) => {
                    return Err(AppError::invalid("path is required"));
                }
                (ShortcutLocation::Desktop, _) => {
                    let desktop =
                        dirs::desktop_dir().ok_or_else(|| AppError::NotFound("Desktop".into()))?;
                    shortcut::available_path(
                        &desktop,
                        &shortcut::file_name_for(&preset.name),
                        |candidate| shortcut::is_owned(candidate, &exe, &id_text),
                    )
                }
            };
            if !link_path.parent().is_some_and(Path::is_dir) {
                return Err(AppError::NotFound("folder".into()));
            }
            let icon = icons::write_ico(&state.store, preset_id)?;
            shortcut::create(&ShortcutSpec {
                link_path: &link_path,
                target: &exe,
                arguments: &format!("{RUN_FLAG} {id_text}"),
                icon: Some(&icon),
                description: &preset.name,
            })?;
            let link_text = link_path.to_string_lossy().to_string();
            if !preset
                .shortcuts
                .iter()
                .any(|s| s.eq_ignore_ascii_case(&link_text))
            {
                preset.shortcuts.push(link_text);
            }
            created = link_path;
            Ok(())
        })?;
        Ok(created.to_string_lossy().to_string())
    })
    .await
}

#[tauri::command]
pub fn export_presets(
    state: State<'_, AppState>,
    path: String,
    preset_ids: Vec<Uuid>,
) -> AppResult<()> {
    validate::absolute_path(&path)?;
    if !path.to_ascii_lowercase().ends_with(".json") {
        return Err(AppError::invalid("export file must be .json"));
    }
    let _guard = state.lock();
    let data = state.store.load()?;
    state.store.export(&data, &preset_ids, Path::new(&path))
}

#[tauri::command]
pub fn import_presets(state: State<'_, AppState>, path: String) -> AppResult<AppData> {
    validate::absolute_path(&path)?;
    let _guard = state.lock();
    let data = state.store.load()?;
    let store = state.store.clone();
    state.store.import(&data, Path::new(&path), |id, png| {
        icons::save_png(&store, id, png)
    })
}

fn refresh_ico(store: &Store, preset_id: Uuid) -> AppResult<()> {
    if store.icon_ico_path(preset_id).exists() {
        icons::write_ico(store, preset_id)?;
    }
    Ok(())
}
