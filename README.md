# Ferrocast web

The dashboard, OBS overlays, website and promo videos for **[Ferrocast](https://ferrocast.clearcraftlabs.com)**: a free, open-source, local-first companion app for streamers. Alerts, overlays, merged chat, a chatbot and cross-platform moderation for Twitch, YouTube and Kick, on macOS, Windows, Linux and the web.

The engine (Rust) lives in a separate repository. This one holds everything that runs in a browser.

```
apps/dashboard   React dashboard (desktop window and browser), with a demo mode
apps/overlays    the OBS browser-source page (vanilla TypeScript, tiny)
apps/site        ferrocast.clearcraftlabs.com (Astro, static)
apps/video       Remotion promo loops
packages/api     typed API client, protocol parsers, demo engine
packages/ui      design tokens, shared components, the ferrofluid renderer
brand/           logo, app icon, favicons (generated)
```

## Run it

Needs Node 22.12+ and pnpm 11.

```bash
pnpm install
pnpm dev            # dashboard with a simulated stream at http://localhost:5280
pnpm build          # dist/dashboard + dist/overlays (embedded by the desktop app) and the site
tools/check.sh      # every gate: format, types, lint, unit tests, builds, browser tests
```

Without the desktop app running, the dashboard starts in **demo mode**: a believable stream with chat from three platforms, alerts, a queue and every screen working. Add `?engine=http://127.0.0.1:47820` and a pairing code (`#pair=CODE`) to talk to a real engine.

## Licence

GPL-3.0-only. See [LICENSE](LICENSE). Free stays free: nothing free today will move behind a paywall later.

"Ferrocast" is a trademark of ClearCraft Labs. Twitch, YouTube, Kick, OBS and other names belong to their owners and are used only to say what Ferrocast works with.
