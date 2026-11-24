import type { ReactNode } from "react";
import { t, type MessageKey } from "../i18n";
import { cx } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { IconCards, IconCheck, IconCog, IconGift, IconHome, IconBook, IconCompass, IconMore, IconTarget } from "./icons";

type NavItem = { to: string; key: MessageKey; icon: (p: { small?: boolean }) => ReactNode };
const NAV: NavItem[] = [
  { to: "/", key: "nav.dashboard", icon: IconHome },
  { to: "/opportunities", key: "nav.opportunities", icon: IconCompass },
  { to: "/bonuses", key: "nav.bonuses", icon: IconTarget },
  { to: "/accounts", key: "nav.accounts", icon: IconCards },
  { to: "/benefits", key: "nav.benefits", icon: IconGift },
  { to: "/eligibility", key: "nav.eligibility", icon: IconCheck },
  { to: "/catalog", key: "nav.catalog", icon: IconBook },
  { to: "/settings", key: "nav.settings", icon: IconCog },
];
/** Phone tab bar: at most five; the rest live under 更多. */
const TABS: NavItem[] = [...NAV.slice(0, 4), { to: "/more", key: "nav.more", icon: IconMore }];
const MORE_PATHS = ["/more", "/benefits", "/eligibility", "/catalog", "/settings"];

const isActive = (path: string, to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`));

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  return (
    <div className="min-h-dvh lg:flex">
      {/* Wide screens: left navigation */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <div>
            <p className="text-base font-bold leading-tight">{t("appName")}</p>
            <p className="text-xs text-muted">{t("tagline")}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              aria-current={isActive(path, n.to) ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                isActive(path, n.to) ? "bg-brand-soft text-brand" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              <n.icon />
              {t(n.key)}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone: compact header */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <p className="font-semibold">{t([...NAV, ...TABS].find((n) => isActive(path, n.to))?.key ?? "nav.dashboard")}</p>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-4 lg:px-8 lg:pb-8 lg:pt-6">{children}</main>
      </div>

      {/* Phone: bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        {TABS.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={cx(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium",
              (n.to === "/more" ? MORE_PATHS.some((p) => isActive(path, p)) : isActive(path, n.to)) ? "text-brand" : "text-muted",
            )}
          >
            <n.icon />
            {t(n.key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
