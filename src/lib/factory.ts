import type { BrowserRef } from "./bindings/BrowserRef";
import type { Item } from "./bindings/Item";
import type { ItemTarget } from "./bindings/ItemTarget";
import type { Preset } from "./bindings/Preset";
import { DEFAULT_COLOR, DEFAULT_GLYPH } from "./glyphs";

export function newId(): string {
  return crypto.randomUUID();
}

export function newPreset(name: string): Preset {
  return {
    id: newId(),
    name,
    icon: { kind: "glyph", glyph: DEFAULT_GLYPH, color: DEFAULT_COLOR },
    tabMode: "newWindow",
    defaultDelayMs: 500,
    items: [],
    shortcuts: [],
  };
}

export function newItem(target: ItemTarget): Item {
  return {
    id: newId(),
    enabled: true,
    skipIfRunning: target.type === "exe" || target.type === "app",
    windowState: "normal",
    delayAfterMs: null,
    target,
  };
}

export function exeTarget(
  path: string,
  args: string[] = [],
  workingDir: string | null = null,
): ItemTarget {
  return { type: "exe", path, args, workingDir };
}

export function urlTarget(url: string, browser: BrowserRef = { kind: "default" }): ItemTarget {
  return { type: "url", url, browser, profile: null, private: false, args: [] };
}

export function duplicatePreset(preset: Preset, name: string): Preset {
  return {
    ...structuredClone(preset),
    id: newId(),
    name,
    icon:
      preset.icon.kind === "image"
        ? { kind: "glyph", glyph: DEFAULT_GLYPH, color: DEFAULT_COLOR }
        : { ...preset.icon },
    shortcuts: [],
    items: preset.items.map((item) => ({ ...structuredClone(item), id: newId() })),
  };
}

export function duplicateItem(item: Item): Item {
  return { ...structuredClone(item), id: newId() };
}

export function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function itemTitle(item: Item): string {
  const target = item.target;
  switch (target.type) {
    case "exe":
      return stripExtension(fileName(target.path));
    case "app":
      return target.displayName;
    case "url":
      return hostOf(target.url) ?? target.url;
    case "path":
      return fileName(target.path);
  }
}

export function itemSubtitle(item: Item): string {
  const target = item.target;
  switch (target.type) {
    case "exe":
    case "path":
      return target.path;
    case "app":
      return target.aumid;
    case "url":
      return target.url;
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
