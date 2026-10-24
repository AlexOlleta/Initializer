import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Button,
  CheckRow,
  Field,
  IconButton,
  NumberInput,
  Select,
  TextInput,
} from "@/components/ui";
import type { BrowserCatalog } from "@/lib/bindings/BrowserCatalog";
import type { BrowserFamily } from "@/lib/bindings/BrowserFamily";
import type { BrowserProfile } from "@/lib/bindings/BrowserProfile";
import type { BrowserRef } from "@/lib/bindings/BrowserRef";
import type { Item } from "@/lib/bindings/Item";
import type { ItemTarget } from "@/lib/bindings/ItemTarget";
import type { WindowState } from "@/lib/bindings/WindowState";
import { joinArgs, splitArgs } from "@/lib/args";
import { normalizeUrl } from "@/lib/factory";
import { useAppStore } from "@/store/appStore";

const MAX_DELAY_SECONDS = 120;

type Props = {
  item: Item;
  defaultDelayMs: number;
  onChange: (item: Item) => void;
  onBrowseExe: (item: Item) => void;
  onBrowsePath: (item: Item) => void;
  autoFocusUrl: boolean;
};

export function ItemDetails(props: Props) {
  const { item, onChange } = props;
  const target = item.target;
  const setTarget = (next: ItemTarget) => onChange({ ...item, target: next });

  return (
    <div className="grid grid-cols-1 gap-4 border-t border-border px-4 pb-4 pt-4 md:grid-cols-2">
      {target.type === "exe" ? (
        <ExeFields {...props} target={target} setTarget={setTarget} />
      ) : null}
      {target.type === "app" ? <AppFields target={target} setTarget={setTarget} /> : null}
      {target.type === "url" ? (
        <UrlFields target={target} setTarget={setTarget} autoFocus={props.autoFocusUrl} />
      ) : null}
      {target.type === "path" ? (
        <PathField path={target.path} onBrowse={() => props.onBrowsePath(item)} />
      ) : null}
      <CommonFields {...props} />
    </div>
  );
}

function PathField({ path, onBrowse }: { path: string; onBrowse: () => void }) {
  const { t } = useTranslation();
  return (
    <Field label={t("item.path")} className="md:col-span-2">
      <div className="flex gap-2">
        <TextInput value={path} readOnly className="text-muted" />
        <Button icon={<FolderOpen size={15} />} onClick={onBrowse}>
          {t("actions.change")}
        </Button>
      </div>
    </Field>
  );
}

function ArgsField({
  label,
  args,
  placeholder,
  onChange,
}: {
  label: string;
  args: string[];
  placeholder: string;
  onChange: (args: string[]) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => joinArgs(args));
  return (
    <Field label={label} hint={t("item.argsHint")}>
      <TextInput
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          onChange(splitArgs(event.target.value));
        }}
      />
    </Field>
  );
}

function ExeFields({
  item,
  target,
  setTarget,
  onBrowseExe,
}: Props & { target: Extract<ItemTarget, { type: "exe" }>; setTarget: (t: ItemTarget) => void }) {
  const { t } = useTranslation();

  const chooseWorkingDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") setTarget({ ...target, workingDir: dir });
  };

  return (
    <>
      <PathField path={target.path} onBrowse={() => onBrowseExe(item)} />
      <ArgsField
        label={t("item.args")}
        args={target.args}
        placeholder="--start-minimized"
        onChange={(args) => setTarget({ ...target, args })}
      />
      <Field label={t("item.workingDir")}>
        <div className="flex gap-2">
          <TextInput
            value={target.workingDir ?? ""}
            readOnly
            placeholder={t("item.workingDirDefault")}
            className="text-muted"
          />
          <IconButton
            label={t("actions.browse")}
            className="h-9 w-9"
            onClick={() => void chooseWorkingDir()}
          >
            <FolderOpen size={16} />
          </IconButton>
          {target.workingDir ? (
            <IconButton
              label={t("actions.clear")}
              className="h-9 w-9"
              onClick={() => setTarget({ ...target, workingDir: null })}
            >
              <X size={16} />
            </IconButton>
          ) : null}
        </div>
      </Field>
    </>
  );
}

function AppFields({
  target,
  setTarget,
}: {
  target: Extract<ItemTarget, { type: "app" }>;
  setTarget: (t: ItemTarget) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={t("item.processName")} hint={t("item.processNameHint")} className="md:col-span-2">
      <TextInput
        value={target.processName ?? ""}
        placeholder="Spotify.exe"
        onChange={(event) =>
          setTarget({ ...target, processName: event.target.value.trim() || null })
        }
      />
    </Field>
  );
}

function profilesFor(browser: BrowserRef, catalog: BrowserCatalog): BrowserProfile[] {
  const id =
    browser.kind === "installed"
      ? browser.id
      : browser.kind === "default"
        ? catalog.defaultId
        : null;
  return catalog.browsers.find((candidate) => candidate.id === id)?.profiles ?? [];
}

function profileLabels(profiles: BrowserProfile[]) {
  const counts = new Map<string, number>();
  profiles.forEach((profile) => counts.set(profile.name, (counts.get(profile.name) ?? 0) + 1));
  return profiles.map((profile) => ({
    value: profile.id,
    label:
      (counts.get(profile.name) ?? 0) > 1 && profile.id !== profile.name
        ? `${profile.name} (${profile.id})`
        : profile.name,
  }));
}

function UrlFields({
  target,
  setTarget,
  autoFocus,
}: {
  target: Extract<ItemTarget, { type: "url" }>;
  setTarget: (t: ItemTarget) => void;
  autoFocus: boolean;
}) {
  const { t } = useTranslation();
  const catalog = useAppStore((state) => state.catalog);
  const defaultBrowser = catalog.browsers.find((browser) => browser.id === catalog.defaultId);
  const browser = target.browser;
  const browserValue = browser.kind === "installed" ? `installed:${browser.id}` : browser.kind;
  const browserOptions = [
    {
      value: "default",
      label: defaultBrowser
        ? t("item.browserDefaultNamed", { name: defaultBrowser.name })
        : t("item.browserDefault"),
    },
    ...catalog.browsers.map((candidate) => ({
      value: `installed:${candidate.id}`,
      label: candidate.name,
    })),
    ...(browser.kind === "installed" && !catalog.browsers.some((b) => b.id === browser.id)
      ? [{ value: `installed:${browser.id}`, label: `${browser.id} (${t("item.missing")})` }]
      : []),
    { value: "custom", label: t("item.browserCustom") },
  ];

  const profiles = browser.kind === "custom" ? [] : profilesFor(browser, catalog);
  const profileOptions = [
    { value: "", label: t("item.profileNone") },
    ...profileLabels(profiles),
    ...(target.profile && !profiles.some((p) => p.id === target.profile)
      ? [{ value: target.profile, label: target.profile }]
      : []),
  ];

  const changeBrowser = async (value: string) => {
    if (value === "default")
      return setTarget({ ...target, browser: { kind: "default" }, profile: null });
    if (value.startsWith("installed:")) {
      return setTarget({
        ...target,
        browser: { kind: "installed", id: value.slice("installed:".length) },
        profile: null,
      });
    }
    const exe = await open({
      multiple: false,
      filters: [{ name: "Browser", extensions: ["exe"] }],
    });
    if (typeof exe !== "string") return;
    const family: BrowserFamily = /firefox|librewolf|waterfox|floorp|zen/i.test(exe)
      ? "firefox"
      : "chromium";
    setTarget({ ...target, browser: { kind: "custom", exePath: exe, family }, profile: null });
  };

  return (
    <>
      <Field label={t("item.url")} className="md:col-span-2">
        <TextInput
          autoFocus={autoFocus}
          value={target.url}
          placeholder={t("item.urlPlaceholder")}
          onChange={(event) => setTarget({ ...target, url: event.target.value })}
          onBlur={(event) => setTarget({ ...target, url: normalizeUrl(event.target.value) })}
        />
      </Field>
      <Field label={t("item.browser")}>
        <Select
          value={browserValue}
          options={browserOptions}
          onChange={(value) => void changeBrowser(value)}
        />
      </Field>
      {browser.kind === "custom" ? (
        <Field label={t("item.customFamily")} hint={browser.exePath}>
          <Select<BrowserFamily>
            value={browser.family}
            options={[
              { value: "chromium", label: "Chromium (Chrome, Edge, Brave, Opera…)" },
              { value: "firefox", label: "Firefox" },
            ]}
            onChange={(family) => setTarget({ ...target, browser: { ...browser, family } })}
          />
        </Field>
      ) : (
        <Field label={t("item.profile")}>
          <Select
            value={target.profile ?? ""}
            options={profileOptions}
            onChange={(value) => setTarget({ ...target, profile: value || null })}
          />
        </Field>
      )}
      <div className="md:col-span-2">
        <CheckRow
          checked={target.private}
          onChange={(value) => setTarget({ ...target, private: value })}
          label={t("item.private")}
          hint={t("item.privateHint")}
        />
      </div>
      <ArgsField
        label={t("item.browserArgs")}
        args={target.args}
        placeholder="--start-maximized"
        onChange={(args) => setTarget({ ...target, args })}
      />
    </>
  );
}

function CommonFields({ item, defaultDelayMs, onChange }: Props) {
  const { t } = useTranslation();
  const type = item.target.type;
  const supportsWindow = type !== "url";
  const supportsSkip = type === "exe" || type === "app";
  const missingProcess = item.target.type === "app" && !item.target.processName;

  return (
    <>
      {supportsWindow ? (
        <Field label={t("item.windowState")} hint={t("item.windowHint")}>
          <Select<WindowState>
            value={item.windowState}
            options={(["normal", "minimized", "maximized"] as const).map((value) => ({
              value,
              label: t(`item.window.${value}`),
            }))}
            onChange={(windowState) => onChange({ ...item, windowState })}
          />
        </Field>
      ) : null}
      <Field label={t("item.delay")}>
        <NumberInput
          value={item.delayAfterMs === null ? null : item.delayAfterMs / 1000}
          min={0}
          max={MAX_DELAY_SECONDS}
          placeholder={t("item.delayDefault", { seconds: defaultDelayMs / 1000 })}
          onChange={(seconds) =>
            onChange({
              ...item,
              delayAfterMs: seconds === null ? null : Math.round(seconds * 1000),
            })
          }
        />
      </Field>
      {supportsSkip ? (
        <div className="md:col-span-2">
          <CheckRow
            checked={item.skipIfRunning}
            onChange={(skipIfRunning) => onChange({ ...item, skipIfRunning })}
            label={t("item.skipIfRunning")}
            hint={item.skipIfRunning && missingProcess ? t("item.skipNeedsProcess") : undefined}
          />
        </div>
      ) : null}
    </>
  );
}
