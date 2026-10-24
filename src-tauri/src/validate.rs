use std::path::Path;

use url::Url;

use crate::error::{AppError, AppResult};
use crate::model::{AppData, BrowserRef, Item, ItemTarget, Preset, PresetIcon, SCHEMA_VERSION};

pub const MAX_PRESETS: usize = 200;
pub const MAX_ITEMS: usize = 200;
pub const MAX_ARGS: usize = 32;
pub const MAX_DELAY_MS: u32 = 120_000;
const MAX_NAME_CHARS: usize = 80;
const MAX_PATH_CHARS: usize = 1024;
const MAX_ARG_CHARS: usize = 1024;
const MAX_URL_CHARS: usize = 2048;
const MAX_ID_CHARS: usize = 512;

const BLOCKED_OPEN_EXTENSIONS: &[&str] = &[
    "exe",
    "com",
    "bat",
    "cmd",
    "ps1",
    "psm1",
    "vbs",
    "vbe",
    "js",
    "jse",
    "wsf",
    "wsh",
    "msi",
    "msp",
    "scr",
    "pif",
    "hta",
    "cpl",
    "reg",
    "lnk",
    "url",
    "jar",
    "appref-ms",
    "application",
    "gadget",
    "inf",
    "msc",
    "scf",
    "ws",
];

pub fn data(data: &AppData) -> AppResult<()> {
    if data.schema_version != SCHEMA_VERSION {
        return Err(AppError::invalid(format!(
            "unsupported schema version {}",
            data.schema_version
        )));
    }
    if data.presets.len() > MAX_PRESETS {
        return Err(AppError::invalid("too many presets"));
    }
    data.presets.iter().try_for_each(preset)?;
    let mut ids: Vec<_> = data.presets.iter().map(|p| p.id).collect();
    ids.sort();
    ids.dedup();
    if ids.len() != data.presets.len() {
        return Err(AppError::invalid("duplicated preset id"));
    }
    Ok(())
}

pub fn preset(preset: &Preset) -> AppResult<()> {
    display_name(&preset.name)?;
    icon(&preset.icon)?;
    delay(preset.default_delay_ms)?;
    if preset.items.len() > MAX_ITEMS {
        return Err(AppError::invalid("too many items"));
    }
    preset.items.iter().try_for_each(item)?;
    preset
        .shortcuts
        .iter()
        .try_for_each(|path| shortcut_path(path))?;
    Ok(())
}

pub fn item(item: &Item) -> AppResult<()> {
    if let Some(ms) = item.delay_after_ms {
        delay(ms)?;
    }
    match &item.target {
        ItemTarget::Exe {
            path,
            args,
            working_dir,
        } => {
            exe_path(path)?;
            arguments(args)?;
            if let Some(dir) = working_dir {
                absolute_path(dir)?;
            }
        }
        ItemTarget::App {
            aumid,
            display_name: name,
            process_name,
        } => {
            app_id(aumid)?;
            free_text(name, MAX_PATH_CHARS)?;
            if let Some(process) = process_name {
                process_name_value(process)?;
            }
        }
        ItemTarget::Url {
            url,
            browser,
            profile,
            args,
            ..
        } => {
            web_url(url)?;
            browser_ref(browser)?;
            arguments(args)?;
            if let Some(profile) = profile {
                free_text(profile, MAX_ID_CHARS)?;
            }
        }
        ItemTarget::Path { path } => open_path(path)?,
    }
    Ok(())
}

pub fn display_name(name: &str) -> AppResult<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid("name is required"));
    }
    free_text(trimmed, MAX_NAME_CHARS)
}

pub fn web_url(value: &str) -> AppResult<Url> {
    if value.chars().count() > MAX_URL_CHARS {
        return Err(AppError::invalid("url is too long"));
    }
    let parsed = Url::parse(value.trim()).map_err(|_| AppError::invalid("invalid url"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::invalid("only http and https urls are allowed"));
    }
    if parsed.host_str().is_none_or(str::is_empty) {
        return Err(AppError::invalid("url host is required"));
    }
    Ok(parsed)
}

pub fn exe_path(value: &str) -> AppResult<()> {
    absolute_path(value)?;
    if extension_of(value).as_deref() != Some("exe") {
        return Err(AppError::invalid("only .exe programs are allowed"));
    }
    Ok(())
}

pub fn open_path(value: &str) -> AppResult<()> {
    absolute_path(value)?;
    if let Some(extension) = extension_of(value)
        && BLOCKED_OPEN_EXTENSIONS.contains(&extension.as_str())
    {
        return Err(AppError::invalid(
            "executable or script files cannot be opened as files",
        ));
    }
    Ok(())
}

pub fn shortcut_path(value: &str) -> AppResult<()> {
    absolute_path(value)?;
    if extension_of(value).as_deref() != Some("lnk") {
        return Err(AppError::invalid("shortcut must be a .lnk file"));
    }
    Ok(())
}

pub fn absolute_path(value: &str) -> AppResult<()> {
    free_text(value, MAX_PATH_CHARS)?;
    if value.trim().is_empty() {
        return Err(AppError::invalid("path is required"));
    }
    if !Path::new(value).is_absolute() {
        return Err(AppError::invalid("path must be absolute"));
    }
    if value.contains(['<', '>', '"', '|', '?', '*']) {
        return Err(AppError::invalid("path contains invalid characters"));
    }
    Ok(())
}

pub fn app_id(value: &str) -> AppResult<()> {
    free_text(value, MAX_ID_CHARS)?;
    if value.trim().is_empty() {
        return Err(AppError::invalid("app id is required"));
    }
    if value.contains("..") || value.contains(['"', '<', '>', '|', '*', '?']) {
        return Err(AppError::invalid("app id contains invalid characters"));
    }
    Ok(())
}

pub fn chromium_profile(value: &str) -> AppResult<()> {
    let valid = !value.is_empty()
        && value.len() <= 128
        && !value.contains("..")
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '_' | '-' | '.'));
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid("invalid browser profile"))
    }
}

fn process_name_value(value: &str) -> AppResult<()> {
    let valid = value.len() <= 260
        && extension_of(value).as_deref() == Some("exe")
        && !value.contains(['\\', '/', ':'])
        && !value.chars().any(char::is_control);
    if valid {
        Ok(())
    } else {
        Err(AppError::invalid("invalid process name"))
    }
}

fn browser_ref(browser: &BrowserRef) -> AppResult<()> {
    match browser {
        BrowserRef::Default => Ok(()),
        BrowserRef::Installed { id } => {
            if id.trim().is_empty() {
                return Err(AppError::invalid("browser id is required"));
            }
            free_text(id, MAX_ID_CHARS)
        }
        BrowserRef::Custom { exe_path: path, .. } => exe_path(path),
    }
}

fn icon(icon: &PresetIcon) -> AppResult<()> {
    match icon {
        PresetIcon::Image => Ok(()),
        PresetIcon::Glyph { glyph, color } => {
            let glyph_ok = !glyph.is_empty()
                && glyph.len() <= 48
                && glyph
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
            let color_ok = color.len() == 7
                && color.starts_with('#')
                && color[1..].chars().all(|c| c.is_ascii_hexdigit());
            if glyph_ok && color_ok {
                Ok(())
            } else {
                Err(AppError::invalid("invalid icon"))
            }
        }
    }
}

fn arguments(args: &[String]) -> AppResult<()> {
    if args.len() > MAX_ARGS {
        return Err(AppError::invalid("too many arguments"));
    }
    args.iter()
        .try_for_each(|arg| free_text(arg, MAX_ARG_CHARS))
}

fn delay(ms: u32) -> AppResult<()> {
    if ms > MAX_DELAY_MS {
        return Err(AppError::invalid("delay is too long"));
    }
    Ok(())
}

fn free_text(value: &str, max_chars: usize) -> AppResult<()> {
    if value.chars().count() > max_chars {
        return Err(AppError::invalid("value is too long"));
    }
    if value.chars().any(char::is_control) {
        return Err(AppError::invalid("value contains control characters"));
    }
    Ok(())
}

fn extension_of(value: &str) -> Option<String> {
    Path::new(value.trim_end_matches(['.', ' ']))
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{TabMode, WindowState};
    use uuid::Uuid;

    fn item_with(target: ItemTarget) -> Item {
        Item {
            id: Uuid::new_v4(),
            enabled: true,
            skip_if_running: false,
            window_state: WindowState::Normal,
            delay_after_ms: None,
            target,
        }
    }

    fn preset_with(items: Vec<Item>) -> Preset {
        Preset {
            id: Uuid::new_v4(),
            name: "Morning".into(),
            icon: PresetIcon::Glyph {
                glyph: "sun".into(),
                color: "#6366f1".into(),
            },
            tab_mode: TabMode::NewWindow,
            default_delay_ms: 500,
            items,
            shortcuts: Vec::new(),
        }
    }

    #[test]
    fn accepts_http_and_https_urls() {
        assert!(web_url("https://www.youtube.com/watch?v=abc").is_ok());
        assert!(web_url("http://localhost:3000").is_ok());
    }

    #[test]
    fn rejects_dangerous_url_schemes() {
        for url in [
            "javascript:alert(1)",
            "file:///C:/Windows/System32/calc.exe",
            "ms-settings:privacy",
            "data:text/html,hi",
            "vbscript:msgbox",
            "https://",
            "not a url",
        ] {
            assert!(web_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn exe_paths_must_be_absolute_executables() {
        assert!(exe_path(r"C:\Program Files\App\app.exe").is_ok());
        assert!(exe_path(r"C:\Tools\APP.EXE").is_ok());
        assert!(exe_path(r"app.exe").is_err());
        assert!(exe_path(r"C:\x.exe & calc").is_err());
        assert!(exe_path(r"C:\scripts\run.bat").is_err());
        assert!(exe_path(r"C:\scripts\run.cmd").is_err());
        assert!(exe_path(r"C:\scripts\run.ps1").is_err());
        assert!(exe_path("C:\\a\nb.exe").is_err());
        assert!(exe_path(r#"C:\a"b.exe"#).is_err());
    }

    #[test]
    fn open_paths_reject_executables_and_scripts() {
        assert!(open_path(r"C:\Users\me\Documents").is_ok());
        assert!(open_path(r"C:\Users\me\notes.txt").is_ok());
        for path in [
            r"C:\x\a.exe",
            r"C:\x\a.bat",
            r"C:\x\a.CMD",
            r"C:\x\a.vbs",
            r"C:\x\a.js",
            r"C:\x\a.lnk",
            r"C:\x\a.bat.",
            r"C:\x\a.bat ",
            r"relative\folder",
        ] {
            assert!(open_path(path).is_err(), "{path}");
        }
    }

    #[test]
    fn app_ids_reject_traversal_and_quotes() {
        assert!(app_id("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App").is_ok());
        assert!(app_id(r"{6D809377-6AF0-444B-8957-A3773F02200E}\Steam\steam.exe").is_ok());
        assert!(app_id(r"..\..\Windows\System32\cmd.exe").is_err());
        assert!(app_id("a\"b").is_err());
        assert!(app_id("").is_err());
    }

    #[test]
    fn chromium_profiles_are_restricted() {
        assert!(chromium_profile("Default").is_ok());
        assert!(chromium_profile("Profile 3").is_ok());
        assert!(chromium_profile("../x").is_err());
        assert!(chromium_profile("a\"b").is_err());
    }

    #[test]
    fn preset_validation_covers_items_and_icon() {
        let valid = preset_with(vec![
            item_with(ItemTarget::Url {
                url: "https://youtube.com".into(),
                browser: BrowserRef::Default,
                profile: None,
                private: false,
                args: Vec::new(),
            }),
            item_with(ItemTarget::Exe {
                path: r"C:\Apps\discord.exe".into(),
                args: vec!["--start-minimized".into()],
                working_dir: None,
            }),
        ]);
        assert!(preset(&valid).is_ok());

        let mut bad_icon = valid.clone();
        bad_icon.icon = PresetIcon::Glyph {
            glyph: "sun".into(),
            color: "red;".into(),
        };
        assert!(preset(&bad_icon).is_err());

        let mut bad_name = valid.clone();
        bad_name.name = "   ".into();
        assert!(preset(&bad_name).is_err());

        let bad_item = preset_with(vec![item_with(ItemTarget::Url {
            url: "javascript:alert(1)".into(),
            browser: BrowserRef::Default,
            profile: None,
            private: false,
            args: Vec::new(),
        })]);
        assert!(preset(&bad_item).is_err());

        let mut bad_delay = valid;
        bad_delay.default_delay_ms = MAX_DELAY_MS + 1;
        assert!(preset(&bad_delay).is_err());
    }

    #[test]
    fn data_rejects_duplicated_ids_and_unknown_schema() {
        let first = preset_with(Vec::new());
        let mut app = AppData {
            presets: vec![first.clone(), first],
            ..AppData::default()
        };
        assert!(data(&app).is_err());
        app.presets.pop();
        assert!(data(&app).is_ok());
        app.schema_version = 99;
        assert!(data(&app).is_err());
    }
}
