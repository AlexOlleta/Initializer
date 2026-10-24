# Architecture

## Data

- `%APPDATA%\Initializer\data.json` — `AppData { schemaVersion, settings, presets }`, atomic writes (temp + rename), max 5 MB, validated on load and save. Unreadable files are renamed to `data.corrupt-<unix>.json` by the GUI.
- `%APPDATA%\Initializer\icons\<presetId>.png|.ico` — canonical 256 px PNG; ICO (16–256) generated for shortcuts.
- `%LOCALAPPDATA%\Initializer\logs` — daily rotated logs, 7 files. Log item ids, never URLs.

## Model

```
Preset { id, name, icon: glyph{glyph,color} | image, tabMode: newWindow|existingWindow, defaultDelayMs, items[], shortcuts[] }
Item   { id, enabled, skipIfRunning, windowState: normal|minimized|maximized, delayAfterMs?, target }
target = exe{path,args[],workingDir?} | app{aumid,displayName,processName?} | url{url,browser,profile?} | path{path}
browser = default | installed{id} | custom{exePath,family: chromium|firefox}
```

`shortcuts` is managed by the backend only (`save_preset` keeps stored value).

## Launch flow (`--run <uuid>` or "Test"/"Run")

1. `launcher::plan` keeps enabled items in order; URLs are grouped per (browser, profile) at the position of the first one.
2. Processes are snapshotted once (`sysinfo`); `skipIfRunning` matches exe path (or name when the path is unreadable) or `processName` for apps.
3. Exe → `ShellExecuteExW` with Windows-quoted args and `nShow`; app → `shell:AppsFolder\<aumid>`; path → `open` verb; URLs → browser exe with family flags (Chromium `--profile-directory= --new-window`, Firefox `-P -new-window/-new-tab`), falling back to the default handler.
4. Delay after each step (item override or preset default). Failures → toast (headless) or in-app report; exit code 1 on item failures, 2 on fatal errors.

## Detection

- Browsers: `HKCU/HKLM\SOFTWARE\Clients\StartMenuInternet`; default from `UrlAssociations\https\UserChoice`. Profiles from Chromium `Local State` (`profile.info_cache`) and Firefox `profiles.ini`.
- Installed apps: `FOLDERID_AppsFolder` enumeration, AUMID via `PKEY_AppUserModel_ID`, process name via `PKEY_Link_TargetParsingPath`, icons via `IShellItemImageFactory`. Cached in memory; prefetched at startup.

## Shortcuts

`IShellLinkW` → target `current_exe()`, args `--run <uuid>`, icon `<uuid>.ico`. Desktop name sanitized and de-duplicated; deleting a preset removes only `.lnk` files that still point to this exe with its id.

## Security

See `CLAUDE.md` rules. Import files: max 25 MB, format + schema version checked, every preset validated, ids re-generated on collision, embedded icons decoded and re-encoded.
