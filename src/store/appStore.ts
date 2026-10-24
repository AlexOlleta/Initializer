import { create } from "zustand";
import type { AppData } from "@/lib/bindings/AppData";
import type { BrowserCatalog } from "@/lib/bindings/BrowserCatalog";
import type { InstalledApp } from "@/lib/bindings/InstalledApp";
import type { Preset } from "@/lib/bindings/Preset";
import type { Settings } from "@/lib/bindings/Settings";
import { errorMessage, ipc } from "@/lib/ipc";

export type ToastTone = "info" | "success" | "error";

export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  details?: string[];
};

export type View = { kind: "list" } | { kind: "edit"; initial: Preset; isNew: boolean };

type AppState = {
  data: AppData | null;
  loadError: string | null;
  catalog: BrowserCatalog;
  apps: InstalledApp[] | null;
  appsLoading: boolean;
  imageIcons: Record<string, string | null>;
  view: View;
  toasts: Toast[];
  init: () => Promise<void>;
  setData: (data: AppData) => void;
  loadApps: (refresh: boolean) => Promise<void>;
  setImageIcon: (presetId: string, dataUrl: string | null) => void;
  loadImageIcon: (presetId: string) => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  openEditor: (initial: Preset, isNew: boolean) => void;
  closeEditor: () => void;
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
};

let toastSequence = 0;
const TOAST_TIMEOUT_MS = 5000;

export const useAppStore = create<AppState>((set, get) => ({
  data: null,
  loadError: null,
  catalog: { browsers: [], defaultId: null },
  apps: null,
  appsLoading: false,
  imageIcons: {},
  view: { kind: "list" },
  toasts: [],

  init: async () => {
    try {
      const data = await ipc.loadData();
      set({ data });
      data.presets
        .filter((preset) => preset.icon.kind === "image")
        .forEach((preset) => void get().loadImageIcon(preset.id));
    } catch (error) {
      set({ loadError: errorMessage(error) });
      return;
    }
    ipc
      .detectBrowsers()
      .then((catalog) => set({ catalog }))
      .catch(() => undefined);
    void get().loadApps(false);
  },

  setData: (data) => set({ data }),

  loadApps: async (refresh) => {
    if (get().appsLoading) return;
    set({ appsLoading: true });
    try {
      set({ apps: await ipc.listInstalledApps(refresh) });
    } catch (error) {
      get().pushToast({ tone: "error", title: errorMessage(error) });
    } finally {
      set({ appsLoading: false });
    }
  },

  setImageIcon: (presetId, dataUrl) =>
    set((state) => ({ imageIcons: { ...state.imageIcons, [presetId]: dataUrl } })),

  loadImageIcon: async (presetId) => {
    const dataUrl = await ipc.readIcon(presetId).catch(() => null);
    get().setImageIcon(presetId, dataUrl);
  },

  saveSettings: async (settings) => {
    try {
      set({ data: await ipc.saveSettings(settings) });
    } catch (error) {
      get().pushToast({ tone: "error", title: errorMessage(error) });
    }
  },

  openEditor: (initial, isNew) =>
    set({ view: { kind: "edit", initial: structuredClone(initial), isNew } }),
  closeEditor: () => set({ view: { kind: "list" } }),

  pushToast: (toast) => {
    const id = ++toastSequence;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    if (toast.tone !== "error") {
      window.setTimeout(() => get().dismissToast(id), TOAST_TIMEOUT_MS);
    }
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function findPreset(data: AppData | null, presetId: string): Preset | undefined {
  return data?.presets.find((preset) => preset.id === presetId);
}
