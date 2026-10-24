use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use winreg::RegKey;
use winreg::enums::{
    HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY,
};

use crate::model::{BrowserCatalog, BrowserFamily, BrowserInfo, BrowserProfile};
use crate::store::read_limited;

const START_MENU_INTERNET: &str = r"SOFTWARE\Clients\StartMenuInternet";
const HTTPS_USER_CHOICE: &str =
    r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice";
const FIREFOX_FAMILY_EXES: &[&str] = &[
    "firefox.exe",
    "librewolf.exe",
    "waterfox.exe",
    "floorp.exe",
    "zen.exe",
];
const IGNORED_EXES: &[&str] = &["iexplore.exe"];
const MAX_PROFILE_FILE_BYTES: u64 = 8 * 1024 * 1024;

pub fn detect() -> BrowserCatalog {
    let mut browsers = Vec::new();
    let mut seen = HashSet::new();
    let roots = [
        (RegKey::predef(HKEY_CURRENT_USER), KEY_READ),
        (RegKey::predef(HKEY_LOCAL_MACHINE), KEY_READ),
        (
            RegKey::predef(HKEY_LOCAL_MACHINE),
            KEY_READ | KEY_WOW64_32KEY,
        ),
    ];
    for (root, access) in roots {
        let Ok(clients) = root.open_subkey_with_flags(START_MENU_INTERNET, access) else {
            continue;
        };
        for key_name in clients.enum_keys().flatten() {
            if !seen.insert(key_name.to_ascii_lowercase()) {
                continue;
            }
            if let Some(browser) = read_client(&clients, &key_name, access) {
                browsers.push(browser);
            }
        }
    }
    browsers.sort_by_key(|b| b.name.to_lowercase());
    let default_id = default_browser_exe().and_then(|exe| {
        browsers
            .iter()
            .find(|b| same_path(&b.exe_path, &exe))
            .map(|b| b.id.clone())
    });
    BrowserCatalog {
        browsers,
        default_id,
    }
}

pub fn default_browser_exe() -> Option<String> {
    let prog_id: String = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(HTTPS_USER_CHOICE)
        .ok()?
        .get_value("ProgId")
        .ok()?;
    let command: String = RegKey::predef(HKEY_CLASSES_ROOT)
        .open_subkey(format!(r"{prog_id}\shell\open\command"))
        .ok()?
        .get_value("")
        .ok()?;
    exe_from_command(&command)
}

pub fn family_for_exe(exe_path: &str) -> BrowserFamily {
    let file = exe_file_name(exe_path);
    if FIREFOX_FAMILY_EXES.contains(&file.as_str()) {
        BrowserFamily::Firefox
    } else {
        BrowserFamily::Chromium
    }
}

pub fn same_path(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

fn read_client(clients: &RegKey, key_name: &str, access: u32) -> Option<BrowserInfo> {
    let client = clients.open_subkey_with_flags(key_name, access).ok()?;
    let command: String = client
        .open_subkey_with_flags(r"shell\open\command", access)
        .ok()?
        .get_value("")
        .ok()?;
    let exe_path = exe_from_command(&command)?;
    if IGNORED_EXES.contains(&exe_file_name(&exe_path).as_str()) || !Path::new(&exe_path).exists() {
        return None;
    }
    let name = client
        .get_value::<String, _>("")
        .ok()
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| key_name.to_string());
    let family = family_for_exe(&exe_path);
    let profiles = profiles_for(&exe_path, family);
    Some(BrowserInfo {
        id: key_name.to_string(),
        name,
        exe_path,
        family,
        profiles,
    })
}

pub fn exe_from_command(command: &str) -> Option<String> {
    let command = command.trim();
    let path = if let Some(rest) = command.strip_prefix('"') {
        rest.split('"').next()?.to_string()
    } else {
        let lower = command.to_ascii_lowercase();
        let end = lower.find(".exe")? + 4;
        command[..end].to_string()
    };
    path.to_ascii_lowercase().ends_with(".exe").then_some(path)
}

fn exe_file_name(exe_path: &str) -> String {
    Path::new(exe_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

fn profiles_for(exe_path: &str, family: BrowserFamily) -> Vec<BrowserProfile> {
    match family {
        BrowserFamily::Chromium => chromium_user_data(exe_path)
            .and_then(|dir| read_limited(&dir.join("Local State"), MAX_PROFILE_FILE_BYTES).ok())
            .map(|bytes| parse_chromium_local_state(&bytes))
            .unwrap_or_default(),
        BrowserFamily::Firefox => firefox_profiles_ini(exe_path)
            .and_then(|path| fs::read_to_string(path).ok())
            .map(|text| parse_firefox_profiles_ini(&text))
            .unwrap_or_default(),
    }
}

fn chromium_user_data(exe_path: &str) -> Option<PathBuf> {
    let local = dirs::data_local_dir()?;
    let relative = match exe_file_name(exe_path).as_str() {
        "chrome.exe" => r"Google\Chrome\User Data",
        "msedge.exe" => r"Microsoft\Edge\User Data",
        "brave.exe" => r"BraveSoftware\Brave-Browser\User Data",
        "vivaldi.exe" => r"Vivaldi\User Data",
        "chromium.exe" => r"Chromium\User Data",
        _ => return None,
    };
    Some(local.join(relative))
}

fn firefox_profiles_ini(exe_path: &str) -> Option<PathBuf> {
    let roaming = dirs::config_dir()?;
    let relative = match exe_file_name(exe_path).as_str() {
        "firefox.exe" => r"Mozilla\Firefox",
        "librewolf.exe" => "librewolf",
        "waterfox.exe" => r"Waterfox",
        "floorp.exe" => r"Floorp",
        "zen.exe" => "zen",
        _ => return None,
    };
    Some(roaming.join(relative).join("profiles.ini"))
}

pub fn parse_chromium_local_state(bytes: &[u8]) -> Vec<BrowserProfile> {
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return Vec::new();
    };
    let Some(cache) = json
        .pointer("/profile/info_cache")
        .and_then(|v| v.as_object())
    else {
        return Vec::new();
    };
    let mut profiles: Vec<BrowserProfile> = cache
        .iter()
        .filter(|(dir, _)| crate::validate::chromium_profile(dir).is_ok())
        .map(|(dir, info)| BrowserProfile {
            id: dir.clone(),
            name: info
                .get("name")
                .and_then(|n| n.as_str())
                .filter(|n| !n.is_empty())
                .unwrap_or(dir)
                .to_string(),
        })
        .collect();
    profiles.sort_by_key(|profile| profile_order(&profile.id));
    profiles
}

fn profile_order(dir: &str) -> (u8, u32, String) {
    if dir == "Default" {
        return (0, 0, String::new());
    }
    let number = dir
        .strip_prefix("Profile ")
        .and_then(|n| n.parse().ok())
        .unwrap_or(u32::MAX);
    (1, number, dir.to_string())
}

pub fn parse_firefox_profiles_ini(text: &str) -> Vec<BrowserProfile> {
    let mut profiles = Vec::new();
    let mut in_profile = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_profile = line.starts_with("[Profile");
            continue;
        }
        if in_profile
            && let Some(name) = line.strip_prefix("Name=")
            && !name.is_empty()
            && !name.chars().any(char::is_control)
        {
            profiles.push(BrowserProfile {
                id: name.to_string(),
                name: name.to_string(),
            });
        }
    }
    profiles
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_exe_from_registry_commands() {
        assert_eq!(
            exe_from_command(r#""C:\Program Files\Google\Chrome\Application\chrome.exe" -- "%1""#),
            Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe".into())
        );
        assert_eq!(
            exe_from_command(r"C:\Apps\Browser\browser.exe --flag"),
            Some(r"C:\Apps\Browser\browser.exe".into())
        );
        assert_eq!(exe_from_command("rundll32 something"), None);
    }

    #[test]
    fn detects_family_from_exe_name() {
        assert_eq!(family_for_exe(r"C:\x\Firefox.exe"), BrowserFamily::Firefox);
        assert_eq!(family_for_exe(r"C:\x\msedge.exe"), BrowserFamily::Chromium);
    }

    #[test]
    fn parses_chromium_local_state() {
        let json = br#"{"profile":{"info_cache":{
            "Profile 2":{"name":"Work"},
            "Default":{"name":"Personal"},
            "Profile 10":{"name":"Ten"},
            "../evil":{"name":"x"}
        }}}"#;
        let profiles = parse_chromium_local_state(json);
        let ids: Vec<_> = profiles.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["Default", "Profile 2", "Profile 10"]);
        assert_eq!(profiles[0].name, "Personal");
        assert!(parse_chromium_local_state(b"garbage").is_empty());
    }

    #[test]
    fn parses_firefox_profiles_ini() {
        let ini = "[General]\nStartWithLastProfile=1\n\n[Profile1]\nName=work\nPath=x\n\n[Profile0]\nName=default-release\n\n[Install123]\nName=ignored\n";
        let names: Vec<_> = parse_firefox_profiles_ini(ini)
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(names, ["work", "default-release"]);
    }
}
