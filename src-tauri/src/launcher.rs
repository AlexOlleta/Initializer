use std::path::Path;
use std::thread;
use std::time::Duration;

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use crate::browsers;
use crate::error::{AppError, AppResult};
use crate::model::{
    BrowserCatalog, BrowserFamily, BrowserRef, Item, ItemResult, ItemTarget, LaunchReport,
    LaunchStatus, Preset, TabMode, WindowState,
};
use crate::validate;
use crate::win;

const APPS_FOLDER_PREFIX: &str = r"shell:AppsFolder\";

#[derive(Debug, Clone, PartialEq)]
pub struct UrlGroup<'a> {
    pub browser: &'a BrowserRef,
    pub profile: Option<&'a str>,
    pub private: bool,
    pub args: &'a [String],
}

#[derive(Debug, Clone, PartialEq)]
pub enum Step<'a> {
    Single(&'a Item),
    Urls {
        group: UrlGroup<'a>,
        items: Vec<&'a Item>,
    },
}

impl Step<'_> {
    fn delay_ms(&self, default_ms: u32) -> u32 {
        let last = match self {
            Step::Single(item) => Some(*item),
            Step::Urls { items, .. } => items.last().copied(),
        };
        last.and_then(|item| item.delay_after_ms)
            .unwrap_or(default_ms)
    }
}

pub struct RunningProcesses {
    entries: Vec<(String, Option<String>)>,
}

impl RunningProcesses {
    pub fn snapshot() -> Self {
        let mut system = System::new();
        system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_exe(UpdateKind::Always),
        );
        let entries = system
            .processes()
            .values()
            .map(|process| {
                (
                    process.name().to_string_lossy().to_ascii_lowercase(),
                    process
                        .exe()
                        .map(|exe| exe.to_string_lossy().to_ascii_lowercase()),
                )
            })
            .collect();
        Self { entries }
    }

    pub fn from_entries(entries: Vec<(String, Option<String>)>) -> Self {
        Self { entries }
    }

    pub fn has_exe(&self, exe_path: &str) -> bool {
        let wanted_path = exe_path.to_ascii_lowercase();
        let wanted_name = file_name_lower(exe_path);
        self.entries.iter().any(|(name, exe)| match exe {
            Some(exe) => *exe == wanted_path,
            None => *name == wanted_name,
        })
    }

    pub fn has_name(&self, process_name: &str) -> bool {
        let wanted = process_name.to_ascii_lowercase();
        self.entries.iter().any(|(name, _)| *name == wanted)
    }
}

pub fn plan(preset: &Preset) -> Vec<Step<'_>> {
    let mut steps: Vec<Step> = Vec::new();
    for item in preset.items.iter().filter(|item| item.enabled) {
        if let ItemTarget::Url {
            browser,
            profile,
            private,
            args,
            ..
        } = &item.target
        {
            let group = UrlGroup {
                browser,
                profile: profile.as_deref().filter(|p| !p.is_empty()),
                private: *private,
                args,
            };
            let existing = steps.iter_mut().find_map(|step| match step {
                Step::Urls { group: g, items } if *g == group => Some(items),
                _ => None,
            });
            match existing {
                Some(items) => items.push(item),
                None => steps.push(Step::Urls {
                    group,
                    items: vec![item],
                }),
            }
        } else {
            steps.push(Step::Single(item));
        }
    }
    steps
}

pub fn run(preset: &Preset, catalog: &BrowserCatalog) -> LaunchReport {
    let running = RunningProcesses::snapshot();
    let steps = plan(preset);
    let mut results = Vec::new();
    let total = steps.len();
    for (index, step) in steps.iter().enumerate() {
        let launched_any = match step {
            Step::Single(item) => {
                let result = run_single(item, &running);
                let launched = result.status == LaunchStatus::Launched;
                results.push(result);
                launched
            }
            Step::Urls { group, items } => {
                let outcome = open_urls(group, items, preset.tab_mode, catalog);
                let launched = outcome.is_ok();
                results.extend(items.iter().map(|item| match &outcome {
                    Ok(()) => success(item),
                    Err(error) => failure(item, error),
                }));
                launched
            }
        };
        let delay = step.delay_ms(preset.default_delay_ms);
        if launched_any && index + 1 < total && delay > 0 {
            thread::sleep(Duration::from_millis(delay as u64));
        }
    }
    LaunchReport { results }
}

fn run_single(item: &Item, running: &RunningProcesses) -> ItemResult {
    if let Err(error) = validate::item(item) {
        return failure(item, &error);
    }
    if item.skip_if_running && is_running(item, running) {
        return ItemResult {
            item_id: item.id,
            status: LaunchStatus::Skipped,
            message: None,
        };
    }
    let outcome = match &item.target {
        ItemTarget::Exe {
            path,
            args,
            working_dir,
        } => spawn_exe(path, args, working_dir.as_deref(), item.window_state),
        ItemTarget::App { aumid, .. } => {
            win::shell_open(&format!("{APPS_FOLDER_PREFIX}{aumid}"), item.window_state)
        }
        ItemTarget::Path { path } => open_path(path, item.window_state),
        ItemTarget::Url { .. } => Err(AppError::invalid("unexpected url step")),
    };
    match outcome {
        Ok(()) => success(item),
        Err(error) => failure(item, &error),
    }
}

fn is_running(item: &Item, running: &RunningProcesses) -> bool {
    match &item.target {
        ItemTarget::Exe { path, .. } => running.has_exe(path),
        ItemTarget::App {
            process_name: Some(name),
            ..
        } => running.has_name(name),
        _ => false,
    }
}

fn spawn_exe(
    path: &str,
    args: &[String],
    working_dir: Option<&str>,
    state: WindowState,
) -> AppResult<()> {
    let exe = Path::new(path);
    if !exe.is_file() {
        return Err(AppError::NotFound(path.to_string()));
    }
    let dir = working_dir
        .map(Path::new)
        .or_else(|| exe.parent())
        .filter(|dir| dir.is_dir())
        .map(|dir| dir.to_string_lossy().to_string());
    win::shell_execute(path, args, dir.as_deref(), state)
}

fn open_path(path: &str, state: WindowState) -> AppResult<()> {
    if !Path::new(path).exists() {
        return Err(AppError::NotFound(path.to_string()));
    }
    win::shell_open(path, state)
}

fn open_urls(
    group: &UrlGroup,
    items: &[&Item],
    tab_mode: TabMode,
    catalog: &BrowserCatalog,
) -> AppResult<()> {
    let urls = items
        .iter()
        .map(|item| match &item.target {
            ItemTarget::Url { url, .. } => validate::web_url(url).map(|u| u.to_string()),
            _ => Err(AppError::invalid("unexpected item")),
        })
        .collect::<AppResult<Vec<_>>>()?;
    let needs_browser_exe = group.private || !group.args.is_empty();
    match resolve_browser(group.browser, catalog) {
        Some((exe, family)) => {
            let args = browser_args(family, &exe, group, tab_mode, &urls)?;
            spawn_exe(&exe, &args, None, WindowState::Normal)
        }
        None if matches!(group.browser, BrowserRef::Default) && !needs_browser_exe => urls
            .iter()
            .try_for_each(|url| win::shell_open(url, WindowState::Normal)),
        None => Err(AppError::NotFound("browser".into())),
    }
}

fn resolve_browser(
    browser: &BrowserRef,
    catalog: &BrowserCatalog,
) -> Option<(String, BrowserFamily)> {
    match browser {
        BrowserRef::Default => {
            let exe = catalog
                .default_id
                .as_ref()
                .and_then(|id| catalog.browsers.iter().find(|b| &b.id == id))
                .map(|b| b.exe_path.clone())
                .or_else(browsers::default_browser_exe)?;
            let family = browsers::family_for_exe(&exe);
            Some((exe, family))
        }
        BrowserRef::Installed { id } => catalog
            .browsers
            .iter()
            .find(|b| &b.id == id)
            .map(|b| (b.exe_path.clone(), b.family)),
        BrowserRef::Custom { exe_path, family } => Some((exe_path.clone(), *family)),
    }
}

pub fn browser_args(
    family: BrowserFamily,
    exe_path: &str,
    group: &UrlGroup,
    tab_mode: TabMode,
    urls: &[String],
) -> AppResult<Vec<String>> {
    let mut args = Vec::new();
    match family {
        BrowserFamily::Chromium => {
            if let Some(profile) = group.profile {
                validate::chromium_profile(profile)?;
                args.push(format!("--profile-directory={profile}"));
            }
            if group.private {
                args.push(chromium_private_flag(exe_path).into());
            }
            if tab_mode == TabMode::NewWindow {
                args.push("--new-window".into());
            }
            args.extend(group.args.iter().cloned());
            args.extend(urls.iter().cloned());
        }
        BrowserFamily::Firefox => {
            if let Some(profile) = group.profile {
                args.push("-P".into());
                args.push(profile.to_string());
            }
            args.extend(group.args.iter().cloned());
            for (index, url) in urls.iter().enumerate() {
                let flag = if group.private {
                    "-private-window"
                } else if index == 0 && tab_mode == TabMode::NewWindow {
                    "-new-window"
                } else {
                    "-new-tab"
                };
                args.push(flag.into());
                args.push(url.clone());
            }
        }
    }
    Ok(args)
}

fn chromium_private_flag(exe_path: &str) -> &'static str {
    let lower = exe_path.to_ascii_lowercase();
    if lower.ends_with("msedge.exe") {
        "--inprivate"
    } else if lower.contains("opera") {
        "--private"
    } else {
        "--incognito"
    }
}

fn success(item: &Item) -> ItemResult {
    ItemResult {
        item_id: item.id,
        status: LaunchStatus::Launched,
        message: None,
    }
}

fn failure(item: &Item, error: &AppError) -> ItemResult {
    tracing::warn!(item = %item.id, %error, "item failed to launch");
    ItemResult {
        item_id: item.id,
        status: LaunchStatus::Failed,
        message: Some(error.to_string()),
    }
}

fn file_name_lower(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::PresetIcon;
    use uuid::Uuid;

    fn url_item(url: &str, browser: BrowserRef, profile: Option<&str>) -> Item {
        Item {
            id: Uuid::new_v4(),
            enabled: true,
            skip_if_running: false,
            window_state: WindowState::Normal,
            delay_after_ms: None,
            target: ItemTarget::Url {
                url: url.into(),
                browser,
                profile: profile.map(Into::into),
                private: false,
                args: Vec::new(),
            },
        }
    }

    fn group<'a>(
        browser: &'a BrowserRef,
        profile: Option<&'a str>,
        private: bool,
        args: &'a [String],
    ) -> UrlGroup<'a> {
        UrlGroup {
            browser,
            profile,
            private,
            args,
        }
    }

    fn exe_item(path: &str) -> Item {
        Item {
            id: Uuid::new_v4(),
            enabled: true,
            skip_if_running: true,
            window_state: WindowState::Normal,
            delay_after_ms: Some(1000),
            target: ItemTarget::Exe {
                path: path.into(),
                args: Vec::new(),
                working_dir: None,
            },
        }
    }

    fn preset(items: Vec<Item>) -> Preset {
        Preset {
            id: Uuid::new_v4(),
            name: "Test".into(),
            icon: PresetIcon::Image,
            tab_mode: TabMode::NewWindow,
            default_delay_ms: 0,
            items,
            shortcuts: Vec::new(),
        }
    }

    #[test]
    fn groups_urls_by_browser_profile_and_mode_at_first_position() {
        let chrome = BrowserRef::Installed {
            id: "Google Chrome".into(),
        };
        let mut disabled = url_item("https://d.com", BrowserRef::Default, None);
        disabled.enabled = false;
        let mut private = url_item("https://f.com", chrome.clone(), Some("Default"));
        if let ItemTarget::Url { private: flag, .. } = &mut private.target {
            *flag = true;
        }
        let preset = preset(vec![
            url_item("https://a.com", chrome.clone(), Some("Default")),
            exe_item(r"C:\x\discord.exe"),
            url_item("https://b.com", BrowserRef::Default, None),
            url_item("https://c.com", chrome.clone(), Some("Default")),
            url_item("https://e.com", chrome.clone(), Some("Profile 1")),
            private,
            disabled,
        ]);
        let steps = plan(&preset);
        assert_eq!(steps.len(), 5);
        match &steps[0] {
            Step::Urls { items, group } => {
                assert_eq!(items.len(), 2);
                assert_eq!(group.profile, Some("Default"));
            }
            other => panic!("unexpected {other:?}"),
        }
        assert!(matches!(steps[1], Step::Single(_)));
        assert!(matches!(&steps[2], Step::Urls { items, .. } if items.len() == 1));
        assert!(
            matches!(&steps[3], Step::Urls { group, .. } if group.profile == Some("Profile 1"))
        );
        assert!(matches!(&steps[4], Step::Urls { group, .. } if group.private));
    }

    #[test]
    fn step_delay_prefers_item_override() {
        let preset = preset(vec![exe_item(r"C:\x\a.exe")]);
        let steps = plan(&preset);
        assert_eq!(steps[0].delay_ms(250), 1000);
    }

    #[test]
    fn builds_chromium_args() {
        let urls = vec!["https://a.com/".to_string(), "https://b.com/".to_string()];
        let browser = BrowserRef::Default;
        let chrome = r"C:\Chrome\chrome.exe";
        let args = browser_args(
            BrowserFamily::Chromium,
            chrome,
            &group(&browser, Some("Profile 1"), false, &[]),
            TabMode::NewWindow,
            &urls,
        )
        .unwrap();
        assert_eq!(
            args,
            [
                "--profile-directory=Profile 1",
                "--new-window",
                "https://a.com/",
                "https://b.com/"
            ]
        );
        let existing = browser_args(
            BrowserFamily::Chromium,
            chrome,
            &group(&browser, None, false, &[]),
            TabMode::ExistingWindow,
            &urls,
        )
        .unwrap();
        assert_eq!(existing, ["https://a.com/", "https://b.com/"]);
        assert!(
            browser_args(
                BrowserFamily::Chromium,
                chrome,
                &group(&browser, Some("../x"), false, &[]),
                TabMode::NewWindow,
                &urls
            )
            .is_err()
        );
    }

    #[test]
    fn chromium_private_mode_uses_vendor_flag_and_extra_args() {
        let urls = vec!["https://a.com/".to_string()];
        let browser = BrowserRef::Default;
        let extra = vec!["--start-maximized".to_string()];
        let private = group(&browser, None, true, &extra);
        let flag = |exe: &str| {
            browser_args(
                BrowserFamily::Chromium,
                exe,
                &private,
                TabMode::ExistingWindow,
                &urls,
            )
            .unwrap()
        };
        assert_eq!(
            flag(r"C:\Chrome\chrome.exe"),
            ["--incognito", "--start-maximized", "https://a.com/"]
        );
        assert_eq!(flag(r"C:\Edge\msedge.exe")[0], "--inprivate");
        assert_eq!(flag(r"C:\Programs\Opera GX\opera.exe")[0], "--private");
        assert_eq!(flag(r"C:\Brave\brave.exe")[0], "--incognito");
    }

    #[test]
    fn builds_firefox_args() {
        let urls = vec!["https://a.com/".to_string(), "https://b.com/".to_string()];
        let browser = BrowserRef::Default;
        let firefox = r"C:\Firefox\firefox.exe";
        let args = browser_args(
            BrowserFamily::Firefox,
            firefox,
            &group(&browser, Some("work"), false, &[]),
            TabMode::NewWindow,
            &urls,
        )
        .unwrap();
        assert_eq!(
            args,
            [
                "-P",
                "work",
                "-new-window",
                "https://a.com/",
                "-new-tab",
                "https://b.com/"
            ]
        );
        let existing = browser_args(
            BrowserFamily::Firefox,
            firefox,
            &group(&browser, None, false, &[]),
            TabMode::ExistingWindow,
            &urls,
        )
        .unwrap();
        assert_eq!(
            existing,
            ["-new-tab", "https://a.com/", "-new-tab", "https://b.com/"]
        );
        let private = browser_args(
            BrowserFamily::Firefox,
            firefox,
            &group(&browser, None, true, &[]),
            TabMode::NewWindow,
            &urls,
        )
        .unwrap();
        assert_eq!(
            private,
            [
                "-private-window",
                "https://a.com/",
                "-private-window",
                "https://b.com/"
            ]
        );
    }

    #[test]
    fn detects_running_processes_by_path_or_name() {
        let running = RunningProcesses::from_entries(vec![
            (
                "discord.exe".into(),
                Some(r"c:\apps\discord\discord.exe".into()),
            ),
            ("protected.exe".into(), None),
        ]);
        assert!(running.has_exe(r"C:\Apps\Discord\Discord.exe"));
        assert!(!running.has_exe(r"C:\Other\Discord.exe"));
        assert!(running.has_exe(r"C:\Any\Protected.exe"));
        assert!(running.has_name("Discord.exe"));
        assert!(!running.has_name("steam.exe"));
    }

    #[test]
    fn invalid_items_fail_without_launching() {
        let item = exe_item(r"C:\x\script.bat");
        let result = run_single(&item, &RunningProcesses::from_entries(Vec::new()));
        assert_eq!(result.status, LaunchStatus::Failed);
    }
}
