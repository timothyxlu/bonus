import { useState } from "react";
import { t } from "../i18n";
import { bannerDismissed, dismissBanner, promptInstall, useInstallState, type InstallPlatform } from "../lib/pwa";
import { Button, Card } from "./ui";

/** iOS share glyph (square with up arrow), shown inline in the instructions. */
const ShareGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="inline h-4 w-4 align-[-2px]" aria-label="分享">
    <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

function Instructions({ platform }: { platform: InstallPlatform }) {
  if (platform === "ios-safari" || platform === "ios-other") {
    const [before, after] = t(platform === "ios-safari" ? "pwa.ios" : "pwa.iosOther").split("分享");
    return (
      <p className="text-sm text-muted">
        {before}
        <span className="whitespace-nowrap font-medium text-ink">
          <ShareGlyph /> 分享
        </span>
        {after}
      </p>
    );
  }
  return <p className="text-sm text-muted">{t(platform === "mac-safari" ? "pwa.macSafari" : "pwa.manual")}</p>;
}

/** Settings card: always present so the owner can find it; adapts to the platform. */
export function InstallCard() {
  const s = useInstallState();
  return (
    <Card
      title={t("pwa.title")}
      action={
        s.platform === "prompt" && !s.standalone && !s.installed ? (
          <Button size="sm" variant="primary" onClick={() => void promptInstall()}>
            {t("pwa.install")}
          </Button>
        ) : undefined
      }
    >
      {s.standalone ? (
        <p className="text-sm text-money">{t("pwa.installed")}</p>
      ) : s.installed ? (
        <p className="text-sm text-money">{t("pwa.done")}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">{t("pwa.hint")}</p>
          {s.platform !== "prompt" && <Instructions platform={s.platform} />}
        </div>
      )}
    </Card>
  );
}

/** Dismissible banner, only where installing is one tap (native prompt) or a known recipe (iOS). */
export function InstallBanner() {
  const s = useInstallState();
  const [hidden, setHidden] = useState(bannerDismissed);
  const show = !hidden && !s.standalone && !s.installed && (s.platform === "prompt" || s.platform === "ios-safari");
  if (!show) return null;
  return (
    <div role="region" aria-label={t("pwa.bannerTitle")} className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-brand-soft p-3 sm:p-4">
      <img src="/icon.svg" alt="" className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t("pwa.bannerTitle")}</p>
        {s.platform === "prompt" ? <p className="text-sm text-muted">{t("pwa.bannerHint")}</p> : <Instructions platform={s.platform} />}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismissBanner();
            setHidden(true);
          }}
        >
          {t("pwa.dismiss")}
        </Button>
        {s.platform === "prompt" && (
          <Button size="sm" variant="primary" onClick={() => void promptInstall()}>
            {t("pwa.install")}
          </Button>
        )}
      </div>
    </div>
  );
}
