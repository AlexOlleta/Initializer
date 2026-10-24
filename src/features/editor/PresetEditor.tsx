import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  ArrowLeft,
  File,
  Folder,
  Globe,
  Play,
  Save,
  SquareTerminal,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Field, Modal, NumberInput, Select, TextInput } from "@/components/ui";
import { AppPicker } from "@/features/apps/AppPicker";
import type { InstalledApp } from "@/lib/bindings/InstalledApp";
import type { Item } from "@/lib/bindings/Item";
import type { ItemTarget } from "@/lib/bindings/ItemTarget";
import type { Preset } from "@/lib/bindings/Preset";
import type { TabMode } from "@/lib/bindings/TabMode";
import { runPreset, savePreset } from "@/lib/actions";
import { exeTarget, newItem, urlTarget } from "@/lib/factory";
import { errorMessage, ipc } from "@/lib/ipc";
import { extensionOf, presetIssues } from "@/lib/schema";
import { useAppStore } from "@/store/appStore";
import { IconPicker } from "./IconPicker";
import { ItemList } from "./ItemList";

const MAX_DELAY_SECONDS = 120;

export function PresetEditor({ initial, isNew }: { initial: Preset; isNew: boolean }) {
  const { t } = useTranslation();
  const closeEditor = useAppStore((state) => state.closeEditor);
  const pushToast = useAppStore((state) => state.pushToast);
  const [draft, setDraft] = useState<Preset>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [focusUrlId, setFocusUrlId] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [pickingApps, setPickingApps] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);

  const issues = useMemo(() => presetIssues(draft), [draft]);
  const dirty = isNew || JSON.stringify(draft) !== baseline;
  const nameIssue = showIssues ? issues.find((issue) => issue.itemId === null) : undefined;

  const update = (change: Partial<Preset>) => setDraft((current) => ({ ...current, ...change }));
  const setItems = (items: Item[]) => update({ items });
  const addItems = (items: Item[], expand = false) => {
    setDraft((current) => ({ ...current, items: [...current.items, ...items] }));
    if (expand) setExpanded((current) => [...current, ...items.map((item) => item.id)]);
  };
  const replaceTarget = (item: Item, target: ItemTarget) =>
    setDraft((current) => ({
      ...current,
      items: current.items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, target } : candidate,
      ),
    }));

  const pickExe = async (): Promise<ItemTarget | null> => {
    const path = await open({
      multiple: false,
      filters: [{ name: "Programs", extensions: ["exe", "lnk"] }],
    });
    if (typeof path !== "string") return null;
    if (extensionOf(path) !== "lnk") return exeTarget(path);
    try {
      const resolved = await ipc.resolveShortcut(path);
      return exeTarget(resolved.path, resolved.args, resolved.workingDir);
    } catch (error) {
      pushToast({ tone: "error", title: errorMessage(error) });
      return null;
    }
  };

  const pickPath = async (directory: boolean): Promise<ItemTarget | null> => {
    const path = await open({ multiple: false, directory });
    return typeof path === "string" ? { type: "path", path } : null;
  };

  const addExe = async () => {
    const target = await pickExe();
    if (target) addItems([newItem(target)]);
  };

  const addPath = async (directory: boolean) => {
    const target = await pickPath(directory);
    if (target) addItems([newItem(target)]);
  };

  const addUrl = () => {
    const item = newItem(urlTarget(""));
    setFocusUrlId(item.id);
    addItems([item], true);
  };

  const addApps = (apps: InstalledApp[]) =>
    addItems(
      apps.map((app) =>
        newItem({
          type: "app",
          aumid: app.id,
          displayName: app.name,
          processName: app.processName,
        }),
      ),
    );

  const validOrFlag = (): boolean => {
    if (issues.length === 0) return true;
    setShowIssues(true);
    const withIssues = issues.flatMap((issue) => (issue.itemId ? [issue.itemId] : []));
    setExpanded((current) => [...new Set([...current, ...withIssues])]);
    pushToast({ tone: "error", title: t("toast.fixErrors") });
    return false;
  };

  const save = async () => {
    if (!validOrFlag()) return;
    setBusy(true);
    const saved = await savePreset({ ...draft, name: draft.name.trim() });
    setBusy(false);
    if (saved) {
      setBaseline(JSON.stringify(draft));
      closeEditor();
    }
  };

  const test = async () => {
    if (!validOrFlag()) return;
    setBusy(true);
    await runPreset(draft);
    setBusy(false);
  };

  const leave = () => (dirty ? setConfirmLeave(true) : closeEditor());

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={leave}>
          {t("actions.back")}
        </Button>
        <h1 className="flex-1 truncate text-[15px] font-semibold">
          {isNew ? t("editor.titleNew") : t("editor.titleEdit")}
        </h1>
        <Button
          icon={<Play size={15} />}
          disabled={busy || draft.items.length === 0}
          onClick={() => void test()}
        >
          {t("actions.test")}
        </Button>
        <Button
          variant="primary"
          icon={<Save size={15} />}
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {t("actions.save")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border p-6">
          <Field
            label={t("editor.name")}
            hint={
              nameIssue ? <span className="text-danger">{t(nameIssue.message)}</span> : undefined
            }
          >
            <TextInput
              value={draft.name}
              maxLength={80}
              placeholder={t("editor.namePlaceholder")}
              onChange={(event) => update({ name: event.target.value })}
            />
          </Field>
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("editor.icon")}
            </h2>
            <IconPicker preset={draft} onChange={(icon) => update({ icon })} />
          </section>
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("editor.behavior")}
            </h2>
            <Field label={t("editor.tabMode")} hint={t("editor.tabModeHint")}>
              <Select<TabMode>
                value={draft.tabMode}
                options={[
                  { value: "newWindow", label: t("editor.tabNewWindow") },
                  { value: "existingWindow", label: t("editor.tabExisting") },
                ]}
                onChange={(tabMode) => update({ tabMode })}
              />
            </Field>
            <Field label={t("editor.defaultDelay")}>
              <NumberInput
                value={draft.defaultDelayMs / 1000}
                min={0}
                max={MAX_DELAY_SECONDS}
                onChange={(seconds) =>
                  update({ defaultDelayMs: Math.round((seconds ?? 0) * 1000) })
                }
              />
            </Field>
          </section>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted">
              {t("editor.items")}
            </h2>
            <Button compact icon={<AppWindow size={15} />} onClick={() => setPickingApps(true)}>
              {t("editor.addApp")}
            </Button>
            <Button compact icon={<SquareTerminal size={15} />} onClick={() => void addExe()}>
              {t("editor.addExe")}
            </Button>
            <Button compact icon={<Globe size={15} />} onClick={addUrl}>
              {t("editor.addUrl")}
            </Button>
            <Button compact icon={<Folder size={15} />} onClick={() => void addPath(true)}>
              {t("editor.addFolder")}
            </Button>
            <Button compact icon={<File size={15} />} onClick={() => void addPath(false)}>
              {t("editor.addFile")}
            </Button>
          </div>
          {draft.items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
              {t("editor.noItems")}
            </div>
          ) : (
            <ItemList
              items={draft.items}
              defaultDelayMs={draft.defaultDelayMs}
              issues={issues}
              showIssues={showIssues}
              expanded={expanded}
              focusUrlId={focusUrlId}
              onToggleExpanded={(id) =>
                setExpanded((current) =>
                  current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
                )
              }
              onChange={setItems}
              onBrowseExe={(item) =>
                void pickExe().then((target) => target && replaceTarget(item, target))
              }
              onBrowsePath={(item) => {
                const isFile = item.target.type === "path" && extensionOf(item.target.path) !== "";
                void pickPath(!isFile).then((target) => target && replaceTarget(item, target));
              }}
            />
          )}
        </section>
      </div>

      {pickingApps ? <AppPicker onClose={() => setPickingApps(false)} onAdd={addApps} /> : null}
      {confirmLeave ? (
        <Modal
          title={t("editor.unsavedTitle")}
          onClose={() => setConfirmLeave(false)}
          width="max-w-md"
          footer={
            <>
              <Button onClick={() => setConfirmLeave(false)}>{t("actions.cancel")}</Button>
              <Button variant="danger" onClick={closeEditor}>
                {t("actions.discard")}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted">{t("editor.unsavedBody")}</p>
        </Modal>
      ) : null}
    </div>
  );
}
