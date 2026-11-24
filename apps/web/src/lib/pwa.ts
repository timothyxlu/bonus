import { useSyncExternalStore } from "react";

/** Chrome / Edge / Samsung Internet: the deferred install prompt. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "prompt" | "ios-safari" | "ios-other" | "mac-safari" | "manual";
export interface InstallState {
  /** Already running as an installed app (standalone window / home-screen app). */
  standalone: boolean;
  /** Installed during this session (appinstalled fired). */
  installed: boolean;
  /** How to install from here. "prompt" = native prompt is ready. */
  platform: InstallPlatform;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { standalone: false, installed: false, platform: "manual" };
const listeners = new Set<() => void>();
const set = (patch: Partial<InstallState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Which manual instructions to show when there is no native prompt. */
export function detectPlatform(ua: string, maxTouchPoints: number): Exclude<InstallPlatform, "prompt"> {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? "ios-other" : "ios-safari";
  if (/Macintosh/.test(ua) && /Version\/\d+.*Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return "mac-safari";
  return "manual";
}

/** Call once at startup, before React renders, so an early beforeinstallprompt is not missed. */
export function initInstallPrompt() {
  if (typeof window === "undefined") return;
  state = { standalone: isStandalone(), installed: false, platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0) };
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    set({ platform: "prompt" });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ installed: true, platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0) });
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => set({ standalone: isStandalone() }));
}

/** Shows the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") set({ installed: true });
  set({ platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0) });
  return outcome === "accepted";
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useInstallState = () => useSyncExternalStore(subscribe, () => state, () => state);

const DISMISS_KEY = "bonus.installBanner.dismissed";
export function bannerDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
export function dismissBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode: banner just comes back next time */
  }
}
