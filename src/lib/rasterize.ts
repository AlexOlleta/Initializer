import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { glyphComponent } from "./glyphs";

const CANVAS = 256;
const GLYPH = 156;
const RADIUS = 60;

export function glyphSvg(glyph: string, color: string): string {
  const inner = renderToStaticMarkup(
    createElement(glyphComponent(glyph), { size: GLYPH, color: "#ffffff", strokeWidth: 2 }),
  );
  const offset = (CANVAS - GLYPH) / 2;
  const positioned = inner.replace("<svg ", `<svg x="${offset}" y="${offset}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}"><rect width="${CANVAS}" height="${CANVAS}" rx="${RADIUS}" fill="${color}"/>${positioned}</svg>`;
}

export async function glyphPngBase64(glyph: string, color: string): Promise<string> {
  const image = new Image(CANVAS, CANVAS);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyphSvg(glyph, color))}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(image, 0, 0, CANVAS, CANVAS);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
