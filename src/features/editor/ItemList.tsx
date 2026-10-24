import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  EyeOff,
  GripVertical,
  Power,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ContextMenu, IconButton, Toggle } from "@/components/ui";
import { ItemIcon } from "@/components/ItemIcon";
import type { Item } from "@/lib/bindings/Item";
import { duplicateItem, itemSubtitle, itemTitle } from "@/lib/factory";
import { ipc } from "@/lib/ipc";
import type { PresetIssue } from "@/lib/schema";
import { ItemDetails } from "./ItemDetails";

type Props = {
  items: Item[];
  defaultDelayMs: number;
  issues: PresetIssue[];
  showIssues: boolean;
  expanded: string[];
  focusUrlId: string | null;
  onToggleExpanded: (id: string) => void;
  onChange: (items: Item[]) => void;
  onBrowseExe: (item: Item) => void;
  onBrowsePath: (item: Item) => void;
};

export function ItemList(props: Props) {
  const { items, onChange } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(items, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              {...props}
              item={item}
              issues={props.issues.filter((issue) => issue.itemId === item.id)}
              onItemChange={(next) =>
                onChange(items.map((candidate) => (candidate.id === item.id ? next : candidate)))
              }
              onRemove={() => onChange(items.filter((candidate) => candidate.id !== item.id))}
              onDuplicate={() => {
                const index = items.findIndex((candidate) => candidate.id === item.id);
                onChange([
                  ...items.slice(0, index + 1),
                  duplicateItem(item),
                  ...items.slice(index + 1),
                ]);
              }}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function usePathMissing(path: string | null): boolean {
  const [result, setResult] = useState<{ path: string; missing: boolean } | null>(null);
  useEffect(() => {
    if (!path) return;
    let active = true;
    void ipc
      .pathExists(path)
      .then((exists) => active && setResult({ path, missing: !exists }))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [path]);
  return result !== null && result.path === path && result.missing;
}

function ItemRow({
  item,
  issues,
  showIssues,
  expanded,
  focusUrlId,
  defaultDelayMs,
  onToggleExpanded,
  onItemChange,
  onRemove,
  onDuplicate,
  onBrowseExe,
  onBrowsePath,
}: Omit<Props, "items" | "onChange"> & {
  item: Item;
  onItemChange: (item: Item) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const isOpen = expanded.includes(item.id);
  const path = item.target.type === "exe" || item.target.type === "path" ? item.target.path : null;
  const missing = usePathMissing(path);
  const visibleIssues = showIssues ? issues : [];
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("input, textarea, select")) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
      className={`rounded-xl border bg-surface transition-shadow ${isDragging ? "z-10 shadow-lg" : ""} ${visibleIssues.length > 0 ? "border-danger" : "border-border"} ${item.enabled ? "" : "opacity-60"}`}
    >
      <div className="flex items-center gap-3 px-2 py-2.5">
        <button
          type="button"
          className="flex h-8 w-6 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
          aria-label={t("actions.dragHandle")}
          title={t("actions.dragHandle")}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <ItemIcon item={item} />
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col text-left"
          onClick={() => onToggleExpanded(item.id)}
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {itemTitle(item) || t(`item.types.${item.target.type}`)}
            </span>
            <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              {t(`item.types.${item.target.type}`)}
            </span>
            {item.target.type === "url" && item.target.private ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
                <EyeOff size={12} />
                {t("item.privateBadge")}
              </span>
            ) : null}
            {missing ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-warning">
                <AlertTriangle size={12} />
                {t("item.missing")}
              </span>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted">{itemSubtitle(item)}</span>
        </button>
        <Toggle
          checked={item.enabled}
          onChange={(enabled) => onItemChange({ ...item, enabled })}
          label={t("item.enabled")}
        />
        <IconButton
          label={isOpen ? t("actions.collapse") : t("actions.expand")}
          onClick={() => onToggleExpanded(item.id)}
        >
          <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </IconButton>
        <IconButton label={t("actions.duplicate")} onClick={onDuplicate}>
          <Copy size={15} />
        </IconButton>
        <IconButton label={t("actions.remove")} tone="danger" onClick={onRemove}>
          <Trash2 size={15} />
        </IconButton>
      </div>
      {visibleIssues.length > 0 ? (
        <ul className="px-12 pb-2 text-xs text-danger">
          {visibleIssues.map((issue) => (
            <li key={issue.message}>{t(issue.message)}</li>
          ))}
        </ul>
      ) : null}
      {isOpen ? (
        <ItemDetails
          item={item}
          defaultDelayMs={defaultDelayMs}
          onChange={onItemChange}
          onBrowseExe={onBrowseExe}
          onBrowsePath={onBrowsePath}
          autoFocusUrl={focusUrlId === item.id}
        />
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          entries={[
            { label: t("actions.duplicate"), icon: <Copy size={15} />, onSelect: onDuplicate },
            {
              label: item.enabled ? t("actions.disable") : t("actions.enable"),
              icon: <Power size={15} />,
              onSelect: () => onItemChange({ ...item, enabled: !item.enabled }),
            },
            {
              label: t("actions.remove"),
              icon: <Trash2 size={15} />,
              tone: "danger",
              separatorBefore: true,
              onSelect: onRemove,
            },
          ]}
        />
      ) : null}
    </li>
  );
}
