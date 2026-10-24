use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::model::{AppData, Preset, PresetIcon, SCHEMA_VERSION};
use crate::validate;

pub const APP_DIR_NAME: &str = "Initializer";
const DATA_FILE: &str = "data.json";
const MAX_DATA_BYTES: u64 = 5 * 1024 * 1024;
const MAX_IMPORT_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Store {
    root: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportBundle {
    format: String,
    schema_version: u32,
    presets: Vec<ExportedPreset>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportedPreset {
    preset: Preset,
    icon_png: Option<String>,
}

const EXPORT_FORMAT: &str = "initializer-presets";

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn default_location() -> AppResult<Self> {
        let base = dirs::config_dir().ok_or_else(|| AppError::NotFound("AppData".into()))?;
        Ok(Self::new(base.join(APP_DIR_NAME)))
    }

    pub fn data_path(&self) -> PathBuf {
        self.root.join(DATA_FILE)
    }

    pub fn icons_dir(&self) -> PathBuf {
        self.root.join("icons")
    }

    pub fn icon_png_path(&self, preset_id: Uuid) -> PathBuf {
        self.icons_dir().join(format!("{preset_id}.png"))
    }

    pub fn icon_ico_path(&self, preset_id: Uuid) -> PathBuf {
        self.icons_dir().join(format!("{preset_id}.ico"))
    }

    pub fn load(&self) -> AppResult<AppData> {
        let path = self.data_path();
        if !path.exists() {
            return Ok(AppData::default());
        }
        let bytes = read_limited(&path, MAX_DATA_BYTES)?;
        let data: AppData = serde_json::from_slice(&bytes)?;
        validate::data(&data)?;
        Ok(data)
    }

    pub fn load_or_recover(&self) -> AppResult<AppData> {
        match self.load() {
            Ok(data) => Ok(data),
            Err(AppError::Io(error)) => Err(AppError::Io(error)),
            Err(error) => {
                let backup = self
                    .root
                    .join(format!("data.corrupt-{}.json", unix_seconds()));
                tracing::warn!(%error, backup = %backup.display(), "data file unreadable, backing up");
                fs::rename(self.data_path(), &backup)?;
                Ok(AppData::default())
            }
        }
    }

    pub fn save(&self, data: &AppData) -> AppResult<()> {
        validate::data(data)?;
        fs::create_dir_all(&self.root)?;
        let json = serde_json::to_vec_pretty(data)?;
        write_atomic(&self.data_path(), &json)
    }

    pub fn remove_icons(&self, preset_id: Uuid) {
        for path in [self.icon_png_path(preset_id), self.icon_ico_path(preset_id)] {
            if path.exists()
                && let Err(error) = fs::remove_file(&path)
            {
                tracing::warn!(%error, "failed to remove icon");
            }
        }
    }

    pub fn prune_orphan_icons(&self, data: &AppData) {
        let known: HashSet<String> = data.presets.iter().map(|p| p.id.to_string()).collect();
        let Ok(entries) = fs::read_dir(self.icons_dir()) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let stem = path.file_stem().map(|s| s.to_string_lossy().to_string());
            if stem.is_some_and(|stem| !known.contains(&stem)) {
                let _ = fs::remove_file(path);
            }
        }
    }

    pub fn export(&self, data: &AppData, ids: &[Uuid], destination: &Path) -> AppResult<()> {
        let presets = data
            .presets
            .iter()
            .filter(|preset| ids.is_empty() || ids.contains(&preset.id))
            .map(|preset| ExportedPreset {
                preset: Preset {
                    shortcuts: Vec::new(),
                    ..preset.clone()
                },
                icon_png: fs::read(self.icon_png_path(preset.id))
                    .ok()
                    .map(|bytes| BASE64.encode(bytes)),
            })
            .collect();
        let bundle = ExportBundle {
            format: EXPORT_FORMAT.into(),
            schema_version: SCHEMA_VERSION,
            presets,
        };
        write_atomic(destination, &serde_json::to_vec_pretty(&bundle)?)
    }

    pub fn import(
        &self,
        data: &AppData,
        source: &Path,
        save_icon: impl Fn(Uuid, &[u8]) -> AppResult<()>,
    ) -> AppResult<AppData> {
        let bytes = read_limited(source, MAX_IMPORT_BYTES)?;
        let bundle: ExportBundle = serde_json::from_slice(&bytes)?;
        if bundle.format != EXPORT_FORMAT || bundle.schema_version != SCHEMA_VERSION {
            return Err(AppError::invalid("unsupported import file"));
        }
        let mut next = data.clone();
        let mut taken: HashSet<Uuid> = next.presets.iter().map(|p| p.id).collect();
        let mut icons = Vec::new();
        for exported in bundle.presets {
            let mut preset = exported.preset;
            preset.shortcuts.clear();
            if !taken.insert(preset.id) {
                preset.id = Uuid::new_v4();
                taken.insert(preset.id);
            }
            validate::preset(&preset)?;
            match exported.icon_png {
                Some(encoded) => {
                    let png = BASE64
                        .decode(encoded)
                        .map_err(|_| AppError::invalid("invalid icon data"))?;
                    icons.push((preset.id, png));
                }
                None if matches!(preset.icon, PresetIcon::Image) => {
                    return Err(AppError::invalid("image icon is missing"));
                }
                None => {}
            }
            next.presets.push(preset);
        }
        validate::data(&next)?;
        for (id, png) in &icons {
            save_icon(*id, png)?;
        }
        self.save(&next)?;
        Ok(next)
    }
}

pub fn read_limited(path: &Path, max_bytes: u64) -> AppResult<Vec<u8>> {
    let file = File::open(path)?;
    if file.metadata()?.len() > max_bytes {
        return Err(AppError::invalid("file is too large"));
    }
    let mut bytes = Vec::new();
    file.take(max_bytes + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max_bytes {
        return Err(AppError::invalid("file is too large"));
    }
    Ok(bytes)
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension(format!("tmp-{}", Uuid::new_v4().simple()));
    let result = (|| {
        let mut file = File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    Ok(result?)
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BrowserRef, Item, ItemTarget, TabMode, WindowState};

    fn sample_preset() -> Preset {
        Preset {
            id: Uuid::new_v4(),
            name: "Work".into(),
            icon: PresetIcon::Glyph {
                glyph: "briefcase".into(),
                color: "#0ea5e9".into(),
            },
            tab_mode: TabMode::NewWindow,
            default_delay_ms: 0,
            items: vec![Item {
                id: Uuid::new_v4(),
                enabled: true,
                skip_if_running: false,
                window_state: WindowState::Normal,
                delay_after_ms: None,
                target: ItemTarget::Url {
                    url: "https://mail.google.com".into(),
                    browser: BrowserRef::Default,
                    profile: None,
                    private: false,
                    args: Vec::new(),
                },
            }],
            shortcuts: vec![r"C:\Users\me\Desktop\Work.lnk".into()],
        }
    }

    #[test]
    fn missing_file_loads_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("app"));
        assert_eq!(store.load().unwrap(), AppData::default());
    }

    #[test]
    fn save_then_load_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let data = AppData {
            presets: vec![sample_preset()],
            ..AppData::default()
        };
        store.save(&data).unwrap();
        assert_eq!(store.load().unwrap(), data);
    }

    #[test]
    fn corrupt_file_is_backed_up_and_reset() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        fs::write(store.data_path(), b"{ not json").unwrap();
        assert_eq!(store.load_or_recover().unwrap(), AppData::default());
        assert!(!store.data_path().exists());
        let backups = fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(backups, 1);
    }

    #[test]
    fn oversized_file_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.json");
        fs::write(&path, vec![b' '; 2048]).unwrap();
        assert!(read_limited(&path, 1024).is_err());
    }

    #[test]
    fn export_then_import_assigns_new_ids_and_drops_shortcuts() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let data = AppData {
            presets: vec![sample_preset()],
            ..AppData::default()
        };
        store.save(&data).unwrap();
        let export = dir.path().join("export.json");
        store.export(&data, &[], &export).unwrap();
        let imported = store.import(&data, &export, |_, _| Ok(())).unwrap();
        assert_eq!(imported.presets.len(), 2);
        assert_ne!(imported.presets[0].id, imported.presets[1].id);
        assert!(imported.presets[1].shortcuts.is_empty());
    }

    #[test]
    fn import_rejects_invalid_content() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        let mut preset = sample_preset();
        preset.items[0].target = ItemTarget::Url {
            url: "javascript:alert(1)".into(),
            browser: BrowserRef::Default,
            profile: None,
            private: false,
            args: Vec::new(),
        };
        let bundle = ExportBundle {
            format: EXPORT_FORMAT.into(),
            schema_version: SCHEMA_VERSION,
            presets: vec![ExportedPreset {
                preset,
                icon_png: None,
            }],
        };
        let path = dir.path().join("evil.json");
        fs::write(&path, serde_json::to_vec(&bundle).unwrap()).unwrap();
        assert!(
            store
                .import(&AppData::default(), &path, |_, _| Ok(()))
                .is_err()
        );
        assert!(!store.data_path().exists());

        fs::write(&path, b"[1,2,3]").unwrap();
        assert!(
            store
                .import(&AppData::default(), &path, |_, _| Ok(()))
                .is_err()
        );
    }
}
