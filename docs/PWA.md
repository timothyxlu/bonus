# Install Bonus as an app (PWA)

Bonus is an installable Progressive Web App. Once installed it opens in its own window /
full screen, with its own icon, on iPhone, Android and desktop.

## Install

| Device | How |
| --- | --- |
| **iPhone / iPad** (Safari) | Open https://bonus.timothyxlu.xyz, sign in, tap **分享 (Share)** → **添加到主屏幕 (Add to Home Screen)** → 添加. Chrome/Edge on iOS 16.4+ also have Share → Add to Home Screen. |
| **Android** (Chrome) | Open the site, sign in, tap **安装 App** in the banner or 设置 → 安装 App (or ⋮ → **Install app**). |
| **Desktop** (Chrome / Edge) | Open the site, sign in, click **安装 App** (banner or 设置), or the install icon at the right of the address bar. |
| **Mac** (Safari 17+) | File → **Add to Dock** (文件 → 添加到程序坞). |

设置 → **安装 App** shows the right instructions for the current browser and says
"已作为 App 运行" when it is already running installed. The banner on top of the pages can be
hidden with 不再提示.

**iPhone note:** an app on the home screen has its own cookies, separate from Safari, so you sign
in with GitHub once more the first time you open it.

## Cloudflare Access

The site is behind Cloudflare Access. Things that matter for the PWA:

- **Manifest**: browsers fetch `<link rel="manifest">` in CORS mode *without cookies* unless the
  link has `crossorigin="use-credentials"`. Without the cookie Access answers with a 302 to its
  login page, the manifest fails to load and the app is not installable. `index.html` sets
  `crossorigin="use-credentials"`, so no Access change is needed.
- **Optional hardening** (not required): if some browser still fails to read the manifest or icons,
  add these paths to the existing **bonus-public** Bypass app (Zero Trust → Access → Applications →
  bonus-public → Configure → add destinations on `bonus.timothyxlu.xyz`):
  `/manifest.webmanifest`, `/icons/*`, `/screenshots/*`, `/icon.svg`. They contain no personal
  data (the screenshots use fictional demo data). Do **not** bypass `/`, `/sw.js`, `/offline`,
  `/assets/*`, `/api/*` or `/authorize`.
- **Session expiry**: opening the installed app after the Access session has expired goes through
  the normal Access → GitHub login and comes back to the app. The service worker never answers
  navigations from cache while online, so the redirect is not hidden.

## Service worker (`apps/web/public/sw.js`)

- Never intercepts `/api/*` (this covers card secrets such as `/api/accounts/*/secret*`), `/mcp`,
  `/authorize`, `/token`, `/register`, `/.well-known/*`, `/cdn-cgi/*` (Access login callback) or
  any request with an `Authorization` header. Non-GET and cross-origin requests are not touched.
- Caches only content-hashed build output (`/assets/*`, cache first) and the icons and offline page.
  HTML is never cached.
- Navigations are network-only; when the network is unreachable it shows `/offline` (a static page
  with a retry button).
- Bump `VERSION` in `sw.js` when the precached files change. Hashed assets need no bump.

## Icons and screenshots

- `public/icon.svg` is the master. `public/icons/maskable.svg` (full bleed, artwork inside the 80%
  safe zone) and `public/icons/apple-touch.svg` (full bleed; iOS rounds the corners) are variants.
- The PNGs in `public/icons/` were rendered from those SVGs with headless Chromium;
  `public/screenshots/` are 1280×800 (wide) and 390×844 @2x (narrow) shots of the local dev
  build with `examples/demo-history.json` imported. Never use real data for screenshots.
