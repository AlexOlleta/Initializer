import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  Link2,
  MonitorUp,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button, IconButton, Menu, Modal } from "@/components/ui";
import { PresetIcon } from "@/components/PresetIcon";
import type { Preset } from "@/lib/bindings/Preset";
import {
  createDesktopShortcut,
  deletePreset,
  exportPresets,
  runPreset,
  saveShortcutAs,
} from "@/lib/actions";
import { duplicatePreset, newPreset } from "@/lib/factory";
import { useAppStore } from "@/store/appStore";

export function PresetList() {
  const { t } = useTranslation();
  const presets = useAppStore((state) => state.data?.presets ?? []);
  const openEditor = useAppStore((state) => state.openEditor);
  const [pendingDelete, setPendingDelete] = useState<Preset | null>(null);

  if (presets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-accent">
          <Play size={30} />
        </div>
        <div className="flex max-w-sm flex-col gap-1.5">
          <h2 className="text-lg font-semibold">{t("presets.emptyTitle")}</h2>
          <p className="text-sm text-muted">{t("presets.emptyBody")}</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => openEditor(newPreset(t("presets.defaultName")), true)}
        >
          {t("actions.newPreset")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {presets.map((preset) => (
          <PresetCard key={preset.id} preset={preset} onDelete={() => setPendingDelete(preset)} />
        ))}
      </div>
      {pendingDelete ? (
        <Modal
          title={t("confirm.deleteTitle")}
          onClose={() => setPendingDelete(null)}
          width="max-w-md"
          footer={
            <>
              <Button onClick={() => setPendingDelete(null)}>{t("actions.cancel")}</Button>
              <Button
                variant="danger"
                icon={<Trash2 size={15} />}
                onClick={() => {
                  void deletePreset(pendingDelete);
                  setPendingDelete(null);
                }}
              >
                {t("actions.delete")}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted">
            {t("confirm.deleteBody", { name: pendingDelete.name })}
          </p>
        </Modal>
      ) : null}
    </>
  );
}

function PresetCard({ preset, onDelete }: { preset: Preset; onDelete: () => void }) {
  const { t } = useTranslation();
  const openEditor = useAppStore((state) => state.openEditor);
  const imageUrl = useAppStore((state) => state.imageIcons[preset.id]);
  const [running, setRunning] = useState(false);
  const enabledCount = preset.items.filter((item) => item.enabled).length;

  const run = async () => {
    setRunning(true);
    await runPreset(preset);
    setRunning(false);
  };

  return (
    <article className="group flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <PresetIcon icon={preset.icon} imageUrl={imageUrl} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold" title={preset.name}>
            {preset.name}
          </h3>
          <p className="text-xs text-muted">{t("presets.items", { count: enabledCount })}</p>
          {preset.shortcuts.length > 0 ? (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
              <Link2 size={11} />
              {t("presets.hasShortcut")}
            </span>
          ) : null}
        </div>
        <Menu
          trigger={(toggle) => (
            <IconButton label={t("actions.more")} onClick={toggle}>
              <MoreHorizontal size={18} />
            </IconButton>
          )}
          entries={[
            {
              label: t("actions.shortcutDesktop"),
              icon: <MonitorUp size={15} />,
              onSelect: () => void createDesktopShortcut(preset),
            },
            {
              label: t("actions.shortcutSaveAs"),
              icon: <Save size={15} />,
              onSelect: () => void saveShortcutAs(preset),
            },
            {
              label: t("actions.duplicate"),
              icon: <Copy size={15} />,
              separatorBefore: true,
              onSelect: () =>
                openEditor(
                  duplicatePreset(preset, t("presets.copyName", { name: preset.name })),
                  true,
                ),
            },
            {
              label: t("actions.export"),
              icon: <Download size={15} />,
              onSelect: () => void exportPresets([preset.id], preset.name),
            },
            {
              label: t("actions.delete"),
              icon: <Trash2 size={15} />,
              tone: "danger",
              separatorBefore: true,
              onSelect: onDelete,
            },
          ]}
        />
      </div>
      <div className="mt-auto flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          icon={<Play size={15} />}
          disabled={running || enabledCount === 0}
          onClick={() => void run()}
        >
          {t("actions.run")}
        </Button>
        <Button icon={<Pencil size={15} />} onClick={() => openEditor(preset, false)}>
          {t("actions.edit")}
        </Button>
      </div>
    </article>
  );
}
