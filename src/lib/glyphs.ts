import { icons, Rocket, type LucideIcon } from "lucide-react";

export function toKebab(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

export const ALL_GLYPHS: ReadonlyMap<string, LucideIcon> = new Map(
  Object.entries(icons).map(([name, component]) => [toKebab(name), component]),
);

export const ALL_GLYPH_NAMES: readonly string[] = [...ALL_GLYPHS.keys()].sort();

export const FEATURED_GLYPHS = [
  "rocket",
  "sunrise",
  "sun",
  "moon",
  "coffee",
  "briefcase",
  "laptop",
  "code",
  "terminal",
  "gamepad-2",
  "tv",
  "clapperboard",
  "music",
  "headphones",
  "book-open",
  "graduation-cap",
  "palette",
  "globe",
  "house",
  "heart",
  "star",
].filter((name) => ALL_GLYPHS.has(name));

export const FEATURED_COLORS = [
  "#5b5bd6",
  "#8e4ec6",
  "#d6409f",
  "#e5484d",
  "#f76b15",
  "#ffb224",
  "#30a46c",
  "#12a594",
  "#0090ff",
  "#6f6e77",
  "#1c2024",
];

const HUES = [0, 15, 30, 45, 60, 90, 120, 150, 175, 195, 210, 230, 250, 270, 290, 315, 340];
const LIGHTNESS = [78, 66, 55, 45, 35];

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export const PALETTE_ROWS: readonly string[][] = [
  ...LIGHTNESS.map((lightness) => HUES.map((hue) => hslToHex(hue, 75, lightness))),
  [97, 90, 82, 72, 62, 52, 43, 35, 27, 20, 14, 9, 5].map((lightness) => hslToHex(0, 0, lightness)),
];

export const DEFAULT_GLYPH = "rocket";
export const DEFAULT_COLOR = FEATURED_COLORS[0] ?? "#5b5bd6";

export function glyphComponent(name: string): LucideIcon {
  return ALL_GLYPHS.get(name) ?? Rocket;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
