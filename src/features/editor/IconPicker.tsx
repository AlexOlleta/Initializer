import { createElement, useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Plus, Search, Shapes } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Modal, TextInput } from "@/components/ui";
import { PresetIcon } from "@/components/PresetIcon";
import type { Preset } from "@/lib/bindings/Preset";
import type { PresetIcon as PresetIconValue } from "@/lib/bindings/PresetIcon";
import {
  ALL_GLYPH_NAMES,
  DEFAULT_COLOR,
  DEFAULT_GLYPH,
  FEATURED_COLORS,
  FEATURED_GLYPHS,
  PALETTE_ROWS,
  glyphComponent,
  isHexColor,
} from "@/lib/glyphs";
import { errorMessage, ipc } from "@/lib/ipc";
import { useAppStore } from "@/store/appStore";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "bmp", "webp", "ico"];
const VISIBLE_GLYPHS = 20;
const VISIBLE_COLORS = 11;
const BROWSER_PAGE = 240;

function withCurrent(featured: readonly string[], current: string, visible: number): string[] {
  const head = featured.slice(0, visible);
  return head.includes(current) ? head : [current, ...head.slice(0, visible - 1)];
}

function GlyphIcon({ name, size }: { name: string; size: number }) {
  return createElement(glyphComponent(name), { size });
}

export function IconPicker({
  preset,
  onChange,
}: {
  preset: Preset;
  onChange: (icon: PresetIconValue) => void;
}) {
  const { t } = useTranslation();
  const imageUrl = useAppStore((state) => state.imageIcons[preset.id]);
  const setImageIcon = useAppStore((state) => state.setImageIcon);
  const pushToast = useAppStore((state) => state.pushToast);
  const [browsing, setBrowsing] = useState<"glyphs" | "colors" | null>(null);
  const icon = preset.icon;
  const glyph = icon.kind === "glyph" ? icon.glyph : DEFAULT_GLYPH;
  const color = icon.kind === "glyph" ? icon.color : DEFAULT_COLOR;
  const setGlyph = (name: string) => onChange({ kind: "glyph", glyph: name, color });
  const setColor = (value: string) =>
    onChange({ kind: "glyph", glyph, color: value.toLowerCase() });

  const chooseImage = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: IMAGE_EXTENSIONS }],
    });
    if (typeof path !== "string") return;
    try {
      setImageIcon(preset.id, await ipc.importIconImage(preset.id, path));
      onChange({ kind: "image" });
    } catch (error) {
      pushToast({ tone: "error", title: errorMessage(error) });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <PresetIcon icon={icon} imageUrl={imageUrl} size={72} />
        <div className="flex flex-col gap-2">
          <Button compact icon={<ImagePlus size={15} />} onClick={() => void chooseImage()}>
            {t("editor.chooseImage")}
          </Button>
          {icon.kind === "image" ? (
            <Button
              compact
              variant="ghost"
              icon={<Shapes size={15} />}
              onClick={() => onChange({ kind: "glyph", glyph, color })}
            >
              {t("editor.useSymbol")}
            </Button>
          ) : null}
        </div>
      </div>
      {icon.kind === "glyph" ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">{t("editor.glyph")}</span>
            <div className="grid grid-cols-7 gap-1">
              {withCurrent(FEATURED_GLYPHS, glyph, VISIBLE_GLYPHS).map((name) => (
                <GlyphButton key={name} name={name} selected={name === glyph} onSelect={setGlyph} />
              ))}
              <button
                type="button"
                title={t("editor.moreGlyphs")}
                aria-label={t("editor.moreGlyphs")}
                onClick={() => setBrowsing("glyphs")}
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">{t("editor.color")}</span>
            <div className="flex flex-wrap gap-2">
              {withCurrent(FEATURED_COLORS, color, VISIBLE_COLORS).map((swatch) => (
                <Swatch
                  key={swatch}
                  color={swatch}
                  selected={swatch === color}
                  onSelect={setColor}
                />
              ))}
              <button
                type="button"
                title={t("editor.moreColors")}
                aria-label={t("editor.moreColors")}
                onClick={() => setBrowsing("colors")}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </>
      ) : null}
      {browsing === "glyphs" ? (
        <GlyphBrowser
          selected={glyph}
          color={color}
          onClose={() => setBrowsing(null)}
          onSelect={(name) => {
            setGlyph(name);
            setBrowsing(null);
          }}
        />
      ) : null}
      {browsing === "colors" ? (
        <ColorBrowser
          selected={color}
          onClose={() => setBrowsing(null)}
          onSelect={(value) => {
            setColor(value);
            setBrowsing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function GlyphButton({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={selected}
      onClick={() => onSelect(name)}
      className={`flex aspect-square items-center justify-center rounded-lg transition-colors ${selected ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-text"}`}
    >
      <GlyphIcon name={name} size={18} />
    </button>
  );
}

function Swatch({
  color,
  selected,
  onSelect,
  shape = "circle",
}: {
  color: string;
  selected: boolean;
  onSelect: (color: string) => void;
  shape?: "circle" | "square";
}) {
  return (
    <button
      type="button"
      title={color}
      aria-label={color}
      aria-pressed={selected}
      onClick={() => onSelect(color)}
      className={`border-2 transition-transform hover:scale-110 ${shape === "circle" ? "h-7 w-7 rounded-full" : "h-[26px] w-[26px] rounded-md"} ${selected ? "border-text" : "border-transparent"}`}
      style={{ background: color }}
    />
  );
}

function GlyphBrowser({
  selected,
  color,
  onClose,
  onSelect,
}: {
  selected: string;
  color: string;
  onClose: () => void;
  onSelect: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(BROWSER_PAGE);
  const deferredQuery = useDeferredValue(query);

  const matches = useMemo(() => {
    const terms = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return terms.length === 0
      ? ALL_GLYPH_NAMES
      : ALL_GLYPH_NAMES.filter((name) => terms.every((term) => name.includes(term)));
  }, [deferredQuery]);

  return (
    <Modal title={t("editor.moreGlyphs")} onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <TextInput
            autoFocus
            className="pl-9"
            placeholder={t("editor.searchGlyphs")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(BROWSER_PAGE);
            }}
          />
        </div>
        <span className="text-xs text-muted">
          {t("editor.glyphCount", { count: matches.length })}
        </span>
        {matches.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t("editor.noGlyphs")}</p>
        ) : (
          <div className="grid grid-cols-10 gap-1">
            {matches.slice(0, limit).map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={name === selected}
                onClick={() => onSelect(name)}
                className={`flex aspect-square items-center justify-center rounded-lg transition-colors ${name === selected ? "text-white" : "text-muted hover:bg-surface-2 hover:text-text"}`}
                style={name === selected ? { background: color } : undefined}
              >
                <GlyphIcon name={name} size={20} />
              </button>
            ))}
          </div>
        )}
        {matches.length > limit ? (
          <Button className="self-center" onClick={() => setLimit((value) => value + BROWSER_PAGE)}>
            {t("editor.showMore")}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

function ColorBrowser({
  selected,
  onClose,
  onSelect,
}: {
  selected: string;
  onClose: () => void;
  onSelect: (color: string) => void;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(selected);
  const valid = isHexColor(custom);

  return (
    <Modal
      title={t("editor.moreColors")}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <Button onClick={onClose}>{t("actions.cancel")}</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSelect(custom)}>
            {t("editor.apply")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          {PALETTE_ROWS.map((row) => (
            <div key={row.join()} className="flex gap-1">
              {row.map((swatch) => (
                <Swatch
                  key={swatch}
                  color={swatch}
                  shape="square"
                  selected={swatch.toLowerCase() === selected.toLowerCase()}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">{t("editor.customColor")}</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label={t("editor.customColor")}
              value={valid ? custom : selected}
              onChange={(event) => setCustom(event.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
            <div className="w-32">
              <TextInput
                className="font-mono uppercase"
                maxLength={7}
                value={custom}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  setCustom(raw.startsWith("#") ? raw : `#${raw}`);
                }}
              />
            </div>
            <span
              className="h-9 flex-1 rounded-lg border border-border"
              style={{ background: valid ? custom : "transparent" }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
