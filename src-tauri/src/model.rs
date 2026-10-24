use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppData {
    pub schema_version: u32,
    pub settings: Settings,
    pub presets: Vec<Preset>,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            settings: Settings::default(),
            presets: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Settings {
    pub language: Language,
    pub theme: Theme,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Language {
    #[default]
    System,
    Es,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Preset {
    pub id: Uuid,
    pub name: String,
    pub icon: PresetIcon,
    pub tab_mode: TabMode,
    pub default_delay_ms: u32,
    pub items: Vec<Item>,
    #[serde(default)]
    pub shortcuts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum PresetIcon {
    Glyph { glyph: String, color: String },
    Image,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum TabMode {
    NewWindow,
    ExistingWindow,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Item {
    pub id: Uuid,
    pub enabled: bool,
    pub skip_if_running: bool,
    pub window_state: WindowState,
    pub delay_after_ms: Option<u32>,
    pub target: ItemTarget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum WindowState {
    Normal,
    Minimized,
    Maximized,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum ItemTarget {
    Exe {
        path: String,
        args: Vec<String>,
        working_dir: Option<String>,
    },
    App {
        aumid: String,
        display_name: String,
        process_name: Option<String>,
    },
    Url {
        url: String,
        browser: BrowserRef,
        profile: Option<String>,
        #[serde(default)]
        private: bool,
        #[serde(default)]
        args: Vec<String>,
    },
    Path {
        path: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum BrowserRef {
    Default,
    Installed {
        id: String,
    },
    Custom {
        exe_path: String,
        family: BrowserFamily,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum BrowserFamily {
    Chromium,
    Firefox,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BrowserCatalog {
    pub browsers: Vec<BrowserInfo>,
    pub default_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BrowserInfo {
    pub id: String,
    pub name: String,
    pub exe_path: String,
    pub family: BrowserFamily,
    pub profiles: Vec<BrowserProfile>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BrowserProfile {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub process_name: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResolvedShortcut {
    pub path: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LaunchReport {
    pub results: Vec<ItemResult>,
}

impl LaunchReport {
    pub fn failures(&self) -> usize {
        self.results
            .iter()
            .filter(|result| result.status == LaunchStatus::Failed)
            .count()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ItemResult {
    pub item_id: Uuid,
    pub status: LaunchStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum LaunchStatus {
    Launched,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ShortcutLocation {
    Desktop,
    Custom,
}
