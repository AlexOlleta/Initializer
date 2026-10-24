import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
  secondary: "bg-surface border border-border hover:bg-surface-2",
  ghost: "hover:bg-surface-2 text-text",
  danger: "bg-danger text-white hover:opacity-90",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  compact?: boolean;
};

export function Button({
  variant = "secondary",
  icon,
  compact = false,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const size = compact ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${size} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "default" | "danger";
};

export function IconButton({
  label,
  tone = "default",
  className = "",
  children,
  ...props
}: IconButtonProps) {
  const toneClass = tone === "danger" ? "hover:text-danger" : "hover:text-text";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 disabled:opacity-40 ${toneClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-accent";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input type="text" spellCheck={false} className={`${INPUT_CLASS} ${className}`} {...rest} />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 0.5,
  placeholder,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      className={INPUT_CLASS}
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === "") return onChange(null);
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <select
      className={`${INPUT_CLASS} cursor-pointer pr-8 ${className}`}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Toggle checked={checked} onChange={onChange} label={label} />
      <div className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full ${width} flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export type MenuEntry = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  separatorBefore?: boolean;
};

export function Menu({
  trigger,
  entries,
}: {
  trigger: (toggle: () => void) => ReactNode;
  entries: MenuEntry[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((value) => !value))}
      {open ? (
        <div className="absolute right-0 z-30 mt-1 min-w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
          {entries.map((entry) => (
            <div key={entry.label}>
              {entry.separatorBefore ? <div className="my-1 border-t border-border" /> : null}
              <button
                type="button"
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2 ${entry.tone === "danger" ? "text-danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect();
                }}
              >
                <span className="text-muted">{entry.icon}</span>
                {entry.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-border border-t-accent"
      style={{ width: size, height: size }}
    />
  );
}

const CONTEXT_MENU_WIDTH = 220;

export function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - CONTEXT_MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - entries.length * 38 - 16);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
      style={{ left, top, width: CONTEXT_MENU_WIDTH }}
    >
      {entries.map((entry) => (
        <div key={entry.label}>
          {entry.separatorBefore ? <div className="my-1 border-t border-border" /> : null}
          <button
            type="button"
            role="menuitem"
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2 ${entry.tone === "danger" ? "text-danger" : ""}`}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            <span className="text-muted">{entry.icon}</span>
            {entry.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
