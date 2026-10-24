import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, RefreshCw, Search } from "lucide-react";
import { Button, IconButton, Modal, Spinner, TextInput } from "@/components/ui";
import type { InstalledApp } from "@/lib/bindings/InstalledApp";
import { useAppStore } from "@/store/appStore";

export function AppPicker({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (apps: InstalledApp[]) => void;
}) {
  const { t } = useTranslation();
  const apps = useAppStore((state) => state.apps);
  const loading = useAppStore((state) => state.appsLoading);
  const loadApps = useAppStore((state) => state.loadApps);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = apps ?? [];
    return needle ? list.filter((app) => app.name.toLowerCase().includes(needle)) : list;
  }, [apps, query]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const confirm = () => {
    const chosen = (apps ?? []).filter((app) => selected.includes(app.id));
    onAdd(chosen);
    onClose();
  };

  return (
    <Modal
      title={t("apps.title")}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <Button onClick={onClose}>{t("actions.cancel")}</Button>
          <Button variant="primary" disabled={selected.length === 0} onClick={confirm}>
            {selected.length > 0 ? `${t("apps.add")} (${selected.length})` : t("apps.add")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <TextInput
              autoFocus
              className="pl-9"
              placeholder={t("apps.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <IconButton
            label={t("actions.refresh")}
            disabled={loading}
            onClick={() => void loadApps(true)}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </IconButton>
        </div>
        <div className="h-[46vh] overflow-y-auto rounded-xl border border-border">
          {apps === null || (loading && filtered.length === 0) ? (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-muted">
              <Spinner />
              {t("apps.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              {t("apps.empty")}
            </div>
          ) : (
            <ul>
              {filtered.map((app) => {
                const checked = selected.includes(app.id);
                return (
                  <li key={app.id}>
                    <button
                      type="button"
                      onClick={() => toggle(app.id)}
                      onDoubleClick={() => {
                        onAdd([app]);
                        onClose();
                      }}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2 ${checked ? "bg-surface-2" : ""}`}
                    >
                      {app.icon ? (
                        <img src={app.icon} alt="" width={24} height={24} draggable={false} />
                      ) : (
                        <span className="h-6 w-6 rounded bg-surface-2" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{app.name}</span>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
                      >
                        {checked ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
