import { useTranslation } from "react-i18next";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useAppStore, type ToastTone } from "@/store/appStore";

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  info: <Info size={18} className="text-accent" />,
  success: <CheckCircle2 size={18} className="text-success" />,
  error: <XCircle size={18} className="text-danger" />,
};

export function Toasts() {
  const { t } = useTranslation();
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-96 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className="pointer-events-auto flex gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-xl"
        >
          <span className="pt-0.5">{TONE_ICON[toast.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{toast.title}</p>
            {toast.details?.map((detail) => (
              <p key={detail} className="mt-0.5 break-words text-xs text-muted select-text">
                {detail}
              </p>
            ))}
          </div>
          <button
            type="button"
            aria-label={t("actions.close")}
            className="h-6 w-6 shrink-0 rounded-md text-muted hover:bg-surface-2 hover:text-text"
            onClick={() => dismiss(toast.id)}
          >
            <X size={14} className="mx-auto" />
          </button>
        </div>
      ))}
    </div>
  );
}
