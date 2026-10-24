pub mod apps;
pub mod browsers;
pub mod commands;
pub mod error;
pub mod headless;
pub mod icons;
pub mod launcher;
pub mod logging;
pub mod model;
pub mod notify;
pub mod shortcut;
pub mod store;
pub mod validate;
pub mod win;

use tauri::Manager;

use crate::commands::AppState;
use crate::store::Store;

pub fn run_gui() {
    let store = match Store::default_location() {
        Ok(store) => store,
        Err(error) => {
            tracing::error!(%error, "cannot resolve data directory");
            notify::error("Initializer", &error.to_string());
            return;
        }
    };
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new(store))
        .invoke_handler(tauri::generate_handler![
            commands::load_data,
            commands::save_preset,
            commands::delete_preset,
            commands::reorder_presets,
            commands::save_settings,
            commands::detect_browsers,
            commands::list_installed_apps,
            commands::path_icon,
            commands::path_exists,
            commands::resolve_shortcut,
            commands::save_icon_png,
            commands::import_icon_image,
            commands::read_icon,
            commands::run_preset,
            commands::create_shortcut,
            commands::export_presets,
            commands::import_presets,
        ])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        tracing::error!(%error, "application error");
    }
}
