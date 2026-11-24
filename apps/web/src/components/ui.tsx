import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { t } from "../i18n";
import { cx } from "../lib/format";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none",
        // >=44px touch targets on phones, compact on pointer devices
        size === "sm" ? "h-11 px-3 text-sm sm:h-8 sm:px-2.5" : "h-11 px-4 text-sm sm:h-10",
        variant === "primary" && "bg-brand text-on-brand hover:bg-brand-hover",
        variant === "secondary" && "bg-surface text-ink ring-1 ring-line ring-inset hover:bg-sunken",
        variant === "ghost" && "text-brand hover:bg-brand-soft",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        className,
      )}
    />
  );
}

const fieldCls =
  "block rounded-[var(--radius-control)] border-0 bg-surface px-3 py-2 text-base text-ink ring-1 ring-line ring-inset placeholder:text-faint focus:ring-2 focus:ring-brand focus:outline-none sm:text-sm";

/** Full width unless the caller sets a width or flex sizing. */
const width = (cls?: string) => (cls && /(^|\s)(w-|flex-1|min-w-|basis-)/.test(cls) ? "" : "w-full");

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, "h-11 sm:h-10", width(props.className), props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldCls, width(props.className), props.className)} />;
}

export { Select } from "./Select";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  slate: "bg-sunken text-muted ring-1 ring-line ring-inset",
  green: "bg-money-soft text-money",
  red: "bg-danger-soft text-danger",
  amber: "bg-warn-soft text-warn",
  indigo: "bg-brand-soft text-brand",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export const statusTone = (s: string): Tone => (s === "open" ? "green" : s === "denied" ? "red" : s === "pending" ? "amber" : "slate");

export function ProgressBar({ ratio, tone = "indigo", label }: { ratio: number; tone?: "indigo" | "green" | "amber" | "red"; label?: string }) {
  const color = { indigo: "bg-brand", green: "bg-money", amber: "bg-warn-bar", red: "bg-danger" }[tone];
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/70" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <p className="py-10 text-center text-sm text-muted" role="status">
      {t("common.loading")}
    </p>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
      {t("common.error", { msg: (error as Error).message })}
    </p>
  );
}

/** Centered dialog on wide screens, bottom sheet on phones. */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="anim-scrim absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        className={cx(
          "anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[20px] border border-line bg-surface sm:rounded-[var(--radius-panel)]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-2 pl-4">
          <h3 id={titleId} className="truncate text-base font-semibold">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 pb-safe">{children}</div>
      </div>
    </div>
  );
}

/** Issuer "card face" swatch: a tiny card in the issuer's colour with its initials. No logos. */
const ISSUER_COLORS: Record<string, string> = {
  chase: "#1a5aa6",
  amex: "#2a7bbf",
  citi: "#0b3c6e",
  boa: "#b3122e",
  barclays: "#1d8fc9",
  capital_one: "#d03027",
  discover: "#e2620f",
  us_bank: "#2d3a8c",
  wells_fargo: "#c41f1f",
};
const ISSUER_SHORT: Record<string, string> = {
  chase: "CH",
  amex: "AX",
  citi: "CI",
  boa: "BA",
  barclays: "BC",
  capital_one: "C1",
  discover: "DI",
  us_bank: "US",
  wells_fargo: "WF",
};
export function issuerColor(id: string) {
  return ISSUER_COLORS[id] ?? hashColor(id);
}
export function issuerShort(id: string) {
  return ISSUER_SHORT[id] ?? id.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}
function hashColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 38%)`;
}
export function IssuerChip({ issuer, closed, size = "md" }: { issuer: string | null; closed?: boolean; size?: "sm" | "md" }) {
  const id = issuer ?? "?";
  const bg = ISSUER_COLORS[id] ?? hashColor(id);
  const label = ISSUER_SHORT[id] ?? id.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={cx(
        "relative inline-flex shrink-0 items-end justify-start overflow-hidden rounded-[4px] font-semibold tracking-wide text-white",
        size === "sm" ? "h-5 w-8 p-0.5 text-[9px]" : "h-7 w-11 p-1 text-[10px]",
        closed && "opacity-40 grayscale",
      )}
      style={{ background: bg }}
    >
      <span className="absolute top-1 left-1 h-1.5 w-2 rounded-[1px] bg-white/55" />
      <span className="leading-none">{label}</span>
    </span>
  );
}
