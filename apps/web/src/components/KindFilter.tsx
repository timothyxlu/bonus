import { ACCOUNT_KINDS, type AccountKind } from "@bonus/core";
import { t } from "../i18n";
import { cx } from "../lib/format";
import { KIND_META } from "../lib/kinds";
import { KindIcon } from "./KindIcon";

/** Segmented category filter with counts. */
export function KindFilter({ value, onChange, counts }: { value: AccountKind | ""; onChange: (k: AccountKind | "") => void; counts: Record<string, number> }) {
  const items: (AccountKind | "")[] = ["", ...ACCOUNT_KINDS];
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-sunken p-1 ring-1 ring-line ring-inset">
      {items.map((k) => {
        const active = value === k;
        return (
          <button
            key={k || "all"}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(k)}
            className={cx(
              "flex min-h-10 shrink-0 items-center gap-1.5 rounded-[7px] px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 sm:min-h-8",
              active ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {k && <KindIcon kind={k} small />}
            {k ? t(KIND_META[k].plural) : t("kind.all")}
            <span className="tabular text-xs text-faint">{counts[k || "all"] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
