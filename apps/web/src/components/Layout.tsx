import type { ReactNode } from "react";
import { t, type MessageKey } from "../i18n";
import { cx } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { IconCards, IconCheck, IconCog, IconGift, IconHome } from "./icons";

const NAV: { to: string; key: MessageKey; icon: () => ReactNode }[] = [
  { to: "/", key: "nav.dashboard", icon: IconHome },
  { to: "/accounts", key: "nav.accounts", icon: IconCards },
  { to: "/benefits", key: "nav.benefits", icon: IconGift },
  { to: "/eligibility", key: "nav.eligibility", icon: IconCheck },
  { to: "/settings", key: "nav.settings", icon: IconCog },
];

const isActive = (path: string, to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`));

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  return (
    <div className="min-h-dvh lg:flex">
      {/* Wide screens: left navigation */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <div>
            <p className="text-base font-bold leading-tight">{t("appName")}</p>
            <p className="text-[11px] text-slate-500">{t("tagline")}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(path, n.to)
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
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
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <p className="font-semibold">{t(NAV.find((n) => isActive(path, n.to))?.key ?? "nav.dashboard")}</p>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-4 lg:px-8 lg:pb-8 lg:pt-6">{children}</main>
      </div>

      {/* Phone: bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={cx(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
              isActive(path, n.to) ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500",
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
