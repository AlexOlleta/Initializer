use tauri_winrt_notification::Toast;
use windows::Win32::Globalization::GetUserDefaultUILanguage;

use crate::model::{Language, LaunchReport};

pub const APP_ID: &str = "app.initializer.desktop";
const LANG_SPANISH: u16 = 0x0a;

pub fn spanish(language: Language) -> bool {
    match language {
        Language::Es => true,
        Language::En => false,
        Language::System => (unsafe { GetUserDefaultUILanguage() } & 0x3ff) == LANG_SPANISH,
    }
}

pub fn launch_failures(preset_name: &str, report: &LaunchReport, language: Language) {
    let failed = report.failures();
    let total = report.results.len();
    let text = if spanish(language) {
        format!("{failed} de {total} elementos no se pudieron abrir.")
    } else {
        format!("{failed} of {total} items could not be opened.")
    };
    show(preset_name, &text);
}

pub fn error(title: &str, message: &str) {
    show(title, message);
}

fn show(title: &str, text: &str) {
    let app_id = if installed() {
        APP_ID
    } else {
        Toast::POWERSHELL_APP_ID
    };
    let result = Toast::new(app_id).title(title).text1(text).show();
    if let Err(error) = result {
        tracing::warn!(?error, "failed to show notification");
    }
}

fn installed() -> bool {
    std::env::current_exe()
        .map(|exe| !exe.components().any(|c| c.as_os_str() == "target"))
        .unwrap_or(false)
}
