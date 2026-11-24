import { IconCheck, IconChevron, IconCog, IconGift } from "../components/icons";
import { t } from "../i18n";
import { Link } from "../lib/router";

/** Phone-only overflow page for destinations that don't fit the tab bar. */
export function MorePage() {
  const items = [
    { to: "/benefits", label: t("nav.benefits"), icon: <IconGift /> },
    { to: "/eligibility", label: t("nav.eligibility"), icon: <IconCheck /> },
    { to: "/settings", label: t("nav.settings"), icon: <IconCog /> },
  ];
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      {items.map((i) => (
        <li key={i.to}>
          <Link to={i.to} className="flex min-h-14 items-center gap-3 px-4 text-base hover:bg-sunken">
            <span className="text-brand">{i.icon}</span>
            <span className="flex-1">{i.label}</span>
            <span className="text-faint">
              <IconChevron />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
