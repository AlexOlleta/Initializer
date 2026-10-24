import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Plus, Rocket, Settings as SettingsIcon, Upload } from "lucide-react";
import { Button, IconButton, Spinner } from "@/components/ui";
import { Toasts } from "@/components/Toasts";
import { PresetEditor } from "@/features/editor/PresetEditor";
import { PresetList } from "@/features/presets/PresetList";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { resolveLanguage } from "@/i18n";
import type { Theme } from "@/lib/bindings/Theme";
import { exportPresets, importPresets } from "@/lib/actions";
import { newPreset } from "@/lib/factory";
import { useAppStore } from "@/store/appStore";

function useTheme(theme: Theme) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export function App() {
  const { t, i18n } = useTranslation();
  const data = useAppStore((state) => state.data);
  const loadError = useAppStore((state) => state.loadError);
  const view = useAppStore((state) => state.view);
  const init = useAppStore((state) => state.init);
  const openEditor = useAppStore((state) => state.openEditor);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useTheme(data?.settings.theme ?? "system");

  const language = data?.settings.language ?? "system";
  useEffect(() => {
    const resolved = resolveLanguage(language);
    void i18n.changeLanguage(resolved);
    document.documentElement.lang = resolved;
  }, [language, i18n]);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-semibold">{t("errors.load")}</p>
        <p className="max-w-lg text-sm text-muted select-text">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {view.kind === "edit" ? (
        <PresetEditor key={view.initial.id} initial={view.initial} isNew={view.isNew} />
      ) : (
        <>
          <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Rocket size={17} />
            </div>
            <div className="mr-auto flex flex-col">
              <span className="text-[15px] font-semibold leading-tight">{t("app.title")}</span>
              <span className="text-xs text-muted">{t("app.tagline")}</span>
            </div>
            <Button
              variant="ghost"
              icon={<Upload size={15} />}
              onClick={() => void importPresets()}
            >
              {t("actions.import")}
            </Button>
            <Button
              variant="ghost"
              icon={<Download size={15} />}
              disabled={data.presets.length === 0}
              onClick={() => void exportPresets([], "initializer-presets")}
            >
              {t("actions.exportAll")}
            </Button>
            <IconButton label={t("actions.settings")} onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={17} />
            </IconButton>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => openEditor(newPreset(t("presets.defaultName")), true)}
            >
              {t("actions.newPreset")}
            </Button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            <PresetList />
          </main>
        </>
      )}
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
      <Toasts />
    </div>
  );
}
