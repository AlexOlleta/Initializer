import { describe, expect, it } from "vitest";
import {
  ALL_GLYPH_NAMES,
  FEATURED_COLORS,
  FEATURED_GLYPHS,
  PALETTE_ROWS,
  glyphComponent,
  isHexColor,
  toKebab,
} from "./glyphs";

describe("glyphs", () => {
  it("converts lucide names to kebab case", () => {
    expect(toKebab("Gamepad2")).toBe("gamepad-2");
    expect(toKebab("BookOpen")).toBe("book-open");
  });

  it("exposes many glyphs whose names pass backend validation", () => {
    expect(ALL_GLYPH_NAMES.length).toBeGreaterThan(1000);
    for (const name of ALL_GLYPH_NAMES) expect(name).toMatch(/^[a-z0-9-]{1,48}$/);
  });

  it("keeps featured glyphs and stored legacy names resolvable", () => {
    expect(FEATURED_GLYPHS.length).toBeGreaterThanOrEqual(20);
    for (const name of [...FEATURED_GLYPHS, "app-window", "pen-tool", "wrench", "zap"]) {
      expect(ALL_GLYPH_NAMES).toContain(name);
      expect(glyphComponent(name)).toBeTruthy();
    }
  });

  it("only produces valid hex colors", () => {
    for (const color of [...FEATURED_COLORS, ...PALETTE_ROWS.flat()]) {
      expect(isHexColor(color)).toBe(true);
    }
  });
});
