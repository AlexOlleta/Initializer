import { useEffect, useState } from "react";
import { AppWindow, File, Folder, Globe, SquareTerminal } from "lucide-react";
import type { Item } from "@/lib/bindings/Item";
import { ipc } from "@/lib/ipc";
import { useAppStore } from "@/store/appStore";

const pathIconCache = new Map<string, Promise<string | null>>();

function cachedPathIcon(path: string): Promise<string | null> {
  let pending = pathIconCache.get(path);
  if (!pending) {
    pending = ipc.pathIcon(path).catch(() => null);
    pathIconCache.set(path, pending);
  }
  return pending;
}

export function ItemIcon({ item, size = 28 }: { item: Item; size?: number }) {
  const target = item.target;
  const appIcon = useAppStore((state) =>
    target.type === "app"
      ? (state.apps?.find((app) => app.id === target.aumid)?.icon ?? null)
      : null,
  );
  const path = target.type === "exe" || target.type === "path" ? target.path : null;
  const [loaded, setLoaded] = useState<{ path: string; icon: string | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    void cachedPathIcon(path).then((icon) => {
      if (active) setLoaded({ path, icon });
    });
    return () => {
      active = false;
    };
  }, [path]);

  const source = appIcon ?? (loaded && loaded.path === path ? loaded.icon : null);
  if (source) {
    return (
      <img src={source} alt="" width={size} height={size} className="shrink-0" draggable={false} />
    );
  }
  const Fallback =
    target.type === "url"
      ? Globe
      : target.type === "app"
        ? AppWindow
        : target.type === "exe"
          ? SquareTerminal
          : /\.[^\\.]+$/.test(target.path)
            ? File
            : Folder;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted"
      style={{ width: size, height: size }}
    >
      <Fallback size={Math.round(size * 0.6)} />
    </div>
  );
}
