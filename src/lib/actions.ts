import { open, save } from "@tauri-apps/plugin-dialog";
import i18n from "@/i18n";
import { useAppStore } from "@/store/appStore";
import type { Preset } from "./bindings/Preset";
import { itemTitle } from "./factory";
import { errorMessage, ipc } from "./ipc";
import { glyphPngBase64 } from "./rasterize";

const t = i18n.t.bind(i18n);
const store = () => useAppStore.getState();

function reportError(error: unknown) {
  store().pushToast({ tone: "error", title: errorMessage(error) });
}

export async function persistIcon(preset: Preset): Promise<void> {
  if (preset.icon.kind === "glyph") {
    await ipc.saveIconPng(preset.id, await glyphPngBase64(preset.icon.glyph, preset.icon.color));
  }
}

export async function savePreset(preset: Preset): Promise<boolean> {
  try {
    await persistIcon(preset);
    store().setData(await ipc.savePreset(preset));
    store().pushToast({ tone: "success", title: t("toast.saved") });
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export async function runPreset(preset: Preset): Promise<void> {
  try {
    const report = await ipc.runPreset(preset);
    const count = (status: string) => report.results.filter((r) => r.status === status).length;
    const failed = report.results.filter((result) => result.status === "failed");
    const summary = t("toast.runResult", {
      launched: count("launched"),
      skipped: count("skipped"),
      failed: failed.length,
    });
    const details = failed.map((result) => {
      const item = preset.items.find((candidate) => candidate.id === result.itemId);
      return `${item ? itemTitle(item) : result.itemId}: ${result.message ?? ""}`;
    });
    store().pushToast(
      failed.length > 0
        ? {
            tone: "error",
            title: t("toast.runFailed", { name: preset.name }),
            details: [summary, ...details],
          }
        : { tone: "success", title: t("toast.runOk", { name: preset.name }), details: [summary] },
    );
  } catch (error) {
    reportError(error);
  }
}

export async function createDesktopShortcut(preset: Preset): Promise<void> {
  await createShortcut(preset, null);
}

export async function saveShortcutAs(preset: Preset): Promise<void> {
  const path = await save({
    defaultPath: `${preset.name.replace(/[<>:"/\\|?*]/g, "_")}.lnk`,
    filters: [{ name: "Shortcut", extensions: ["lnk"] }],
  });
  if (path) await createShortcut(preset, path);
}

async function createShortcut(preset: Preset, path: string | null): Promise<void> {
  try {
    await persistIcon(preset);
    const created = await ipc.createShortcut(preset.id, path ? "custom" : "desktop", path);
    store().setData(await ipc.loadData());
    store().pushToast({ tone: "success", title: t("toast.shortcutCreated"), details: [created] });
  } catch (error) {
    reportError(error);
  }
}

export async function deletePreset(preset: Preset): Promise<void> {
  try {
    store().setData(await ipc.deletePreset(preset.id));
    store().pushToast({ tone: "info", title: t("toast.deleted") });
  } catch (error) {
    reportError(error);
  }
}

export async function exportPresets(presetIds: string[], suggestedName: string): Promise<void> {
  const path = await save({
    defaultPath: `${suggestedName.replace(/[<>:"/\\|?*]/g, "_")}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return;
  try {
    await ipc.exportPresets(path, presetIds);
    store().pushToast({ tone: "success", title: t("toast.exported") });
  } catch (error) {
    reportError(error);
  }
}

export async function importPresets(): Promise<void> {
  const path = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (typeof path !== "string") return;
  try {
    const before = store().data?.presets.length ?? 0;
    const data = await ipc.importPresets(path);
    store().setData(data);
    data.presets
      .filter((preset) => preset.icon.kind === "image")
      .forEach((preset) => void store().loadImageIcon(preset.id));
    store().pushToast({
      tone: "success",
      title: t("toast.imported", { count: data.presets.length - before }),
    });
  } catch (error) {
    reportError(error);
  }
}
