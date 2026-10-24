import { invoke } from "@tauri-apps/api/core";
import type { AppData } from "./bindings/AppData";
import type { BrowserCatalog } from "./bindings/BrowserCatalog";
import type { InstalledApp } from "./bindings/InstalledApp";
import type { LaunchReport } from "./bindings/LaunchReport";
import type { Preset } from "./bindings/Preset";
import type { ResolvedShortcut } from "./bindings/ResolvedShortcut";
import type { Settings } from "./bindings/Settings";
import type { ShortcutLocation } from "./bindings/ShortcutLocation";

export const ipc = {
  loadData: () => invoke<AppData>("load_data"),
  savePreset: (preset: Preset) => invoke<AppData>("save_preset", { preset }),
  deletePreset: (presetId: string) => invoke<AppData>("delete_preset", { presetId }),
  reorderPresets: (presetIds: string[]) => invoke<AppData>("reorder_presets", { presetIds }),
  saveSettings: (settings: Settings) => invoke<AppData>("save_settings", { settings }),
  detectBrowsers: () => invoke<BrowserCatalog>("detect_browsers"),
  listInstalledApps: (refresh: boolean) =>
    invoke<InstalledApp[]>("list_installed_apps", { refresh }),
  pathIcon: (path: string) => invoke<string | null>("path_icon", { path }),
  pathExists: (path: string) => invoke<boolean>("path_exists", { path }),
  resolveShortcut: (path: string) => invoke<ResolvedShortcut>("resolve_shortcut", { path }),
  saveIconPng: (presetId: string, pngBase64: string) =>
    invoke<void>("save_icon_png", { presetId, pngBase64 }),
  importIconImage: (presetId: string, path: string) =>
    invoke<string>("import_icon_image", { presetId, path }),
  readIcon: (presetId: string) => invoke<string | null>("read_icon", { presetId }),
  runPreset: (preset: Preset) => invoke<LaunchReport>("run_preset", { preset }),
  createShortcut: (presetId: string, location: ShortcutLocation, path: string | null) =>
    invoke<string>("create_shortcut", { presetId, location, path }),
  exportPresets: (path: string, presetIds: string[]) =>
    invoke<void>("export_presets", { path, presetIds }),
  importPresets: (path: string) => invoke<AppData>("import_presets", { path }),
};

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
