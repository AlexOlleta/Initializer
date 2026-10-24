import { createElement } from "react";
import { ImageOff } from "lucide-react";
import type { PresetIcon as PresetIconValue } from "@/lib/bindings/PresetIcon";
import { glyphComponent } from "@/lib/glyphs";

export function PresetIcon({
  icon,
  imageUrl,
  size = 48,
}: {
  icon: PresetIconValue;
  imageUrl?: string | null;
  size?: number;
}) {
  const radius = Math.round(size * 0.24);
  if (icon.kind === "image") {
    return imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{ borderRadius: radius }}
        draggable={false}
      />
    ) : (
      <div
        className="flex shrink-0 items-center justify-center bg-surface-2 text-muted"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <ImageOff size={size * 0.45} />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center text-white shadow-sm"
      style={{ width: size, height: size, borderRadius: radius, background: icon.color }}
    >
      <GlyphIcon name={icon.glyph} size={Math.round(size * 0.6)} />
    </div>
  );
}

function GlyphIcon({ name, size }: { name: string; size: number }) {
  return createElement(glyphComponent(name), { size, strokeWidth: 2 });
}
