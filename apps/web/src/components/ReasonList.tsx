import { ruleMessage } from "../i18n";
import { cx } from "../lib/format";

/** Outcome glyphs: shape + colour, never colour alone. */
const outcomeMark: Record<string, { glyph: string; cls: string; label: string }> = {
  pass: { glyph: "✓", cls: "bg-money-soft text-money", label: "通过" },
  block: { glyph: "✕", cls: "bg-danger-soft text-danger", label: "阻止" },
  uncertain: { glyph: "?", cls: "bg-warn-soft text-warn", label: "不确定" },
  info: { glyph: "i", cls: "bg-brand-soft text-brand", label: "提示" },
};

export function ReasonList({ reasons, hidePass }: { reasons: { rule: string; outcome: string; message: string; params?: Record<string, string | number>; eligibleFrom?: string }[]; hidePass?: boolean }) {
  return (
    <ul className="space-y-2">
      {reasons
        .filter((r) => !hidePass || r.outcome !== "pass")
        .map((r, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold", outcomeMark[r.outcome]?.cls)} role="img" aria-label={outcomeMark[r.outcome]?.label}>
              {outcomeMark[r.outcome]?.glyph}
            </span>
            <span>
              {ruleMessage(r)}
              {r.eligibleFrom && <span className="tabular ml-1 text-xs text-muted">({r.eligibleFrom})</span>}
            </span>
          </li>
        ))}
    </ul>
  );
}
