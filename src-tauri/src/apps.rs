use std::path::Path;

use windows::Win32::Storage::EnhancedStorage::{PKEY_AppUserModel_ID, PKEY_Link_TargetParsingPath};
use windows::Win32::UI::Shell::{
    BHID_EnumItems, FOLDERID_AppsFolder, IEnumShellItems, IShellItem, IShellItem2,
    IShellItemImageFactory, KF_FLAG_DEFAULT, SHGetKnownFolderItem, SIGDN_DESKTOPABSOLUTEPARSING,
    SIGDN_NORMALDISPLAY,
};
use windows::core::Interface;

use crate::error::AppResult;
use crate::icons::png_data_url;
use crate::model::InstalledApp;
use crate::validate;
use crate::win;

const ICON_SIZE: i32 = 32;
const SKIPPED_SUFFIXES: &[&str] = &[".url", ".chm", ".txt", ".pdf", ".html", ".htm", ".rtf"];

pub fn list() -> AppResult<Vec<InstalledApp>> {
    let folder: IShellItem =
        unsafe { SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)? };
    let items: IEnumShellItems = unsafe { folder.BindToHandler(None, &BHID_EnumItems)? };
    let mut apps = Vec::new();
    loop {
        let mut batch: [Option<IShellItem>; 1] = [None];
        let mut fetched = 0u32;
        let result = unsafe { items.Next(&mut batch, Some(&mut fetched)) };
        if result.is_err() || fetched == 0 {
            break;
        }
        if let Some(item) = batch[0].take()
            && let Some(app) = describe(&item)
        {
            apps.push(app);
        }
    }
    apps.sort_by_key(|app| app.name.to_lowercase());
    apps.dedup_by(|a, b| a.id == b.id);
    Ok(apps)
}

fn describe(item: &IShellItem) -> Option<InstalledApp> {
    let name = win::display_name(item, SIGDN_NORMALDISPLAY).ok()?;
    let item2: Option<IShellItem2> = item.cast().ok();
    let id = item2
        .as_ref()
        .and_then(|i| unsafe { i.GetString(&PKEY_AppUserModel_ID) }.ok())
        .map(win::take_co_string)
        .filter(|id| !id.is_empty())
        .or_else(|| win::display_name(item, SIGDN_DESKTOPABSOLUTEPARSING).ok())?;
    let lower = id.to_ascii_lowercase();
    if name.trim().is_empty()
        || lower.starts_with("http")
        || SKIPPED_SUFFIXES.iter().any(|s| lower.ends_with(s))
        || validate::app_id(&id).is_err()
    {
        return None;
    }
    let process_name = item2
        .as_ref()
        .and_then(|i| unsafe { i.GetString(&PKEY_Link_TargetParsingPath) }.ok())
        .map(win::take_co_string)
        .or_else(|| Some(id.clone()))
        .and_then(|target| exe_name(&target));
    let icon = item
        .cast::<IShellItemImageFactory>()
        .ok()
        .and_then(|factory| win::icon_png_from_factory(&factory, ICON_SIZE).ok())
        .map(|png| png_data_url(&png));
    Some(InstalledApp {
        id,
        name,
        process_name,
        icon,
    })
}

fn exe_name(target: &str) -> Option<String> {
    let file = Path::new(target).file_name()?.to_string_lossy().to_string();
    file.to_ascii_lowercase().ends_with(".exe").then_some(file)
}

pub fn icon_for_path(path: &str) -> Option<String> {
    win::icon_png_for_parsing_name(path, ICON_SIZE)
        .ok()
        .map(|png| png_data_url(&png))
}
