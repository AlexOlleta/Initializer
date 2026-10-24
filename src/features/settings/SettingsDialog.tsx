import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Field, Modal, Select } from "@/components/ui";
import type { Language } from "@/lib/bindings/Language";
import type { Theme } from "@/lib/bindings/Theme";
import { useAppStore } from "@/store/appStore";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useAppStore((state) => state.data?.settings);
  const saveSettings = useAppStore((state) => state.saveSettings);
  if (!settings) return null;

  return (
    <Modal title={t("settings.title")} onClose={onClose} width="max-w-md">
      <div className="flex flex-col gap-5">
        <Field label={t("settings.language")}>
          <Select<Language>
            value={settings.language}
            options={[
              { value: "system", label: t("settings.languageSystem") },
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
            onChange={(language) => void saveSettings({ ...settings, language })}
          />
        </Field>
        <Field label={t("settings.theme")}>
          <Select<Theme>
            value={settings.theme}
            options={[
              { value: "system", label: t("settings.themeSystem") },
              { value: "light", label: t("settings.themeLight") },
              { value: "dark", label: t("settings.themeDark") },
            ]}
            onChange={(theme) => void saveSettings({ ...settings, theme })}
          />
        </Field>
        <p className="flex gap-2.5 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <Info size={16} className="shrink-0 text-accent" />
          {t("settings.startupHint")}
        </p>
      </div>
    </Modal>
  );
}
