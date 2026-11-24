import { OWNER_TYPES, type OwnerType } from "@bonus/core";
import { t, td } from "../i18n";
import { cx } from "../lib/format";

/** Compact segmented filter for personal and business products/accounts. */
export function OwnerTypeFilter({ value, onChange }: { value: OwnerType | ""; onChange: (value: OwnerType | "") => void }) {
  const items: (OwnerType | "")[] = ["", ...OWNER_TYPES];
  return (
    <div role="group" aria-label={t("acct.ownerType")} className="inline-flex gap-1 rounded-[var(--radius-control)] bg-sunken p-1 ring-1 ring-line ring-inset">
      {items.map((item) => {
        const active = value === item;
        return (
          <button
            key={item || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item)}
            className={cx(
              "min-h-10 rounded-[7px] px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 sm:min-h-8",
              active ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {item ? td(`ownerType.${item}`) : t("common.all")}
          </button>
        );
      })}
    </div>
  );
}
