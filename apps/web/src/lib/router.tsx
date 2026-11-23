import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** Tiny pushState router - the app has a handful of flat routes. */
interface RouterValue {
  path: string;
  query: URLSearchParams;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}
const Ctx = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search });
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) history.replaceState(null, "", to);
    else history.pushState(null, "", to);
    setLoc({ path: location.pathname, search: location.search });
    if (!opts?.replace) window.scrollTo({ top: 0 });
  }, []);
  return <Ctx.Provider value={{ path: loc.path, query: new URLSearchParams(loc.search), navigate }}>{children}</Ctx.Provider>;
}

export function useRouter() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRouter outside RouterProvider");
  return v;
}

export function Link({ to, className, children, onClick }: { to: string; className?: string; children: ReactNode; onClick?: () => void }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
