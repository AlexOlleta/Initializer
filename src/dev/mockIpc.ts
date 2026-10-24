import { mockIPC } from "@tauri-apps/api/mocks";
import type { AppData } from "@/lib/bindings/AppData";
import type { BrowserCatalog } from "@/lib/bindings/BrowserCatalog";
import type { InstalledApp } from "@/lib/bindings/InstalledApp";
import type { Preset } from "@/lib/bindings/Preset";

const catalog: BrowserCatalog = {
  defaultId: "Google Chrome",
  browsers: [
    {
      id: "Google Chrome",
      name: "Google Chrome",
      exePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      family: "chromium",
      profiles: [
        { id: "Default", name: "Personal" },
        { id: "Profile 1", name: "Work" },
      ],
    },
    {
      id: "Firefox",
      name: "Mozilla Firefox",
      exePath: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      family: "firefox",
      profiles: [{ id: "default-release", name: "default-release" }],
    },
  ],
};

const apps: InstalledApp[] = ["Discord", "Spotify", "Steam", "Visual Studio Code", "WhatsApp"].map(
  (name) => ({
    id: `Mock.${name.replace(/\s/g, "")}`,
    name,
    processName: `${name}.exe`,
    icon: null,
  }),
);

let data: AppData = {
  schemaVersion: 1,
  settings: { language: "system", theme: "system" },
  presets: [
    {
      id: "9b2f2c1e-8d4b-4c55-9a51-1f7c1c5e0a01",
      name: "Morning",
      icon: { kind: "glyph", glyph: "sunrise", color: "#f76b15" },
      tabMode: "newWindow",
      defaultDelayMs: 500,
      shortcuts: ["C:\\Users\\me\\Desktop\\Morning.lnk"],
      items: [
        {
          id: "1a1f0d7e-5b0a-4d1e-8f34-2f8c7d1e9b01",
          enabled: true,
          skipIfRunning: true,
          windowState: "minimized",
          delayAfterMs: null,
          target: {
            type: "app",
            aumid: "Mock.Discord",
            displayName: "Discord",
            processName: "Discord.exe",
          },
        },
        {
          id: "1a1f0d7e-5b0a-4d1e-8f34-2f8c7d1e9b02",
          enabled: true,
          skipIfRunning: false,
          windowState: "normal",
          delayAfterMs: null,
          target: {
            type: "url",
            url: "https://www.youtube.com/feed/subscriptions",
            browser: { kind: "installed", id: "Google Chrome" },
            profile: "Default",
            private: false,
            args: [],
          },
        },
      ],
    },
  ],
};

function upsert(preset: Preset) {
  const existing = data.presets.find((candidate) => candidate.id === preset.id);
  data = {
    ...data,
    presets: existing
      ? data.presets.map((candidate) =>
          candidate.id === preset.id ? { ...preset, shortcuts: candidate.shortcuts } : candidate,
        )
      : [...data.presets, { ...preset, shortcuts: [] }],
  };
  return data;
}

export function installMockIpc() {
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    switch (command) {
      case "load_data":
        return data;
      case "save_preset":
        return upsert(args.preset as Preset);
      case "delete_preset":
        data = { ...data, presets: data.presets.filter((p) => p.id !== args.presetId) };
        return data;
      case "save_settings":
        data = { ...data, settings: args.settings as AppData["settings"] };
        return data;
      case "detect_browsers":
        return catalog;
      case "list_installed_apps":
        return apps;
      case "path_exists":
        return !String(args.path).includes("missing");
      case "path_icon":
      case "read_icon":
        return null;
      case "run_preset":
        return {
          results: (args.preset as Preset).items
            .filter((item) => item.enabled)
            .map((item) => ({ itemId: item.id, status: "launched", message: null })),
        };
      case "create_shortcut":
        return "C:\\Users\\me\\Desktop\\Preset.lnk";
      case "plugin:dialog|open":
        return "C:\\Program Files\\Example\\example.exe";
      default:
        return null;
    }
  });
}
