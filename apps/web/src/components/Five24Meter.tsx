import { t } from "../i18n";
import { cx } from "../lib/format";
import type { X24Status } from "../lib/types";
import { issuerColor, issuerShort } from "./ui";

/**
 * 5/24 as five physical card slots. Each counted card occupies a slot (earliest to
 * free up on the left); cards beyond the limit spill into red slots below.
 */
export function Five24Meter({ s, compact }: { s: X24Status; compact?: boolean }) {
  const wide = compact ? "hidden" : "hidden sm:block";
  const wideInline = compact ? "hidden" : "hidden sm:inline";
  const narrow = compact ? "" : "sm:hidden";
  const slots = Math.max(5, s.count);
  const over = Math.max(0, s.count - 4); // slots that must free up before applying (count must be < 5)
  return (
    <div>
      <ol className={cx("grid grid-cols-5 gap-x-2 gap-y-3", !compact && "sm:gap-x-3")} aria-label={`${s.count}/24`}>
        {Array.from({ length: slots }, (_, i) => {
          const c = s.counted[i];
          const beyond = i >= 5;
          if (!c)
            return (
              <li key={i} className="min-w-0">
                <div className="flex aspect-[1.586] items-center justify-center rounded-[8px] border-2 border-dashed border-line text-xs text-faint">
                  {t("dash.slotEmpty")}
                </div>
              </li>
            );
          // Which cards must fall off before the count drops below 5: the first `over` ones.
          const blocking = s.count >= 5 && i < over;
          return (
            <li key={c.id} className="min-w-0">
              <div
                title={`${c.label}: ${t("dash.slotDrops", { date: c.dropsOn })}`}
                className={cx(
                  cx("relative flex aspect-[1.586] flex-col justify-between overflow-hidden rounded-[8px] p-1.5 text-white", !compact && "sm:p-2.5"),
                  blocking && "ring-2 ring-warn-bar ring-offset-2 ring-offset-surface",
                  beyond && "ring-2 ring-danger ring-offset-2 ring-offset-surface",
                )}
                style={{ background: `linear-gradient(135deg, ${issuerColor(c.issuer)}, color-mix(in oklab, ${issuerColor(c.issuer)} 70%, black))` }}
              >
                <div className="flex items-start justify-between">
                  <span className="h-2.5 w-3.5 rounded-[2px] bg-white/60 sm:h-3 sm:w-4" aria-hidden />
                  <span className="text-[10px] font-semibold tracking-wide opacity-90 sm:text-xs">
                    {issuerShort(c.issuer)}
                    {c.isAuthorizedUser && " AU"}
                  </span>
                </div>
                <p className={cx("truncate text-xs font-medium", wide)}>{c.label.replace(/ ••\d{4}$/, "")}</p>
              </div>
              <p className={cx("tabular mt-1 truncate text-xs", blocking ? "font-semibold text-warn" : beyond ? "font-semibold text-danger" : "text-muted")}>
                <span className={narrow}>{c.dropsOn.slice(0, 7)}</span>
                <span className={wideInline}>{t("dash.slotDrops", { date: c.dropsOn })}</span>
              </p>
            </li>
          );
        })}
      </ol>
      {s.count > 5 && <p className="mt-2 text-xs font-medium text-danger">{t("dash.slotsOver", { n: s.count - 5 })}</p>}
    </div>
  );
}
