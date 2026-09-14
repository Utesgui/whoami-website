# whoami

A clean, multi-connection-aware “what is my IP?” website. Shows **observed public addresses**, not an invented count of physical internet lines.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run build
npm start
```

Open **http://127.0.0.1:3001**. For development, keep `npm start` running for the API and run `npm run dev` in another terminal; Vite proxies `/api` to port 3001.

The interface also works on static hosting. The dedicated Pages build omits the same-origin API check and API link, while public services are still checked directly from the browser. No API keys are required. `?demo=1` opens a clearly labeled, offline example using documentation-only IP addresses; it never contacts external IP services until you switch to live.

## GitHub Pages production

**Website:** https://utesgui.github.io/whoami-website/

Pushes to `main` run `.github/workflows/deploy-pages.yml`: unit/server tests, static build, desktop/mobile Pages smoke tests, then deployment. The repository's Pages source must be **GitHub Actions**. The deployment requires no server, API keys, or third-party hosting account.

```sh
npm run build:pages
npm run test:pages
npm run preview:pages
```

The Pages build uses `/whoami-website/` as its asset base. To use another repository name, pass `-- --base=/your-repository/` to `build:pages` and adapt the Pages preview/test base paths. The workflow derives the deployed asset prefix from the repository name.

GitHub Pages cannot run Node.js, so this edition checks **five public destinations** normally and **nine in a deeper scan** (27 HTTP results across three rounds), and has no `/api/whoami` endpoint. IPv4/IPv6 discovery, optional WebRTC, location lookups, names, history, themes, translations, and export still work. The ordinary `npm run build` / `npm start` deployment retains the server API as an additional destination (six quick / ten deep). GitHub Pages itself can log normal website request metadata under GitHub's privacy policies.

## What it can discover

- IPv4 and IPv6 addresses observed by this server, ipify, and icanhazip, including distinct addresses exposed to different destinations.
- Deeper discovery: three paced rounds against nine public HTTP destinations in multiple destination networks, plus the site's IP API when running with a backend. Requests are staggered, with two seconds between rounds, cache-busting, timeouts, independent failures, and cancellation. HTTP 429 stops further requests to that endpoint for the remainder of the scan. Rough upper bound: 35 seconds.
- Optional WebRTC/STUN discovery with separate Google/Cloudflare ICE sessions, repeated in deep mode. **Off by default**: it can expose an IP outside a VPN or proxy. No camera or microphone permission is requested. Public server-reflexive addresses are remote observations; global host addresses are shown as **device candidates**, not remote confirmations. Private, link-local, mDNS, documentation and TURN-relay addresses are excluded.
- Per-address source evidence, first/last-seen times, and optional provider, ASN, and approximate location from ipapi.co.
- Browser-reported online status, secure context, language, timezone, and effective connection estimate when supported.
- Per-request diagnostics, address masking, copy, IPv4/IPv6 filters, and downloadable JSON reports.
- Manual names for addresses (for example DSL, 5G, or work VPN), copy-all, and a bounded scan timeline with comparisons.
- Complete German/English UI, including help, diagnostic errors, accessibility labels, and date formatting. The first supported browser language is selected; the header switch changes it immediately.
- Light, dark, and system appearance under **Preferences & history**. System mode follows live operating-system changes.

## Names, history, and monitoring

Expand an address to give it a **manual name** of up to 40 characters. A name is your annotation, not proof that the IP belongs to a particular physical line. All observed addresses can be copied in one click. Reports include annotations and scan snapshots.

**Scan history** retains the latest 30 scans and compares observed addresses against the preceding scan with results. New addresses and addresses not seen again are distinguished. Stopped scans and scans with no public observations do not produce misleading outage comparisons. Partial service failures, VPN changes, and different probe destinations can explain differences; this is not a line-outage detector. Up to 100 recent addresses are retained.

**Automatic scans** are optional (off by default), every minute or every five minutes after the preceding scan finishes. They use one HTTP round without WebRTC, regardless of the manual scan options. Monitoring pauses while the page is hidden or offline, never overlaps a scan, and restarts its interval when the page becomes available. Stopping a scan turns monitoring off. Monitoring is not saved across reloads and does not run in the demo.

By default, names, IPs, and history live only in this tab. Explicitly enable **Remember connection data on this device** to retain them in local browser storage. Turning this off removes saved connection data while leaving the current tab's observations available. **Clear connection data** removes the tab's observations, names, and scan history, disables local saving and monitoring, and preserves language/appearance preferences. Storage failures are shown explicitly; data is not claimed to be saved or erased if the browser blocks the operation.

The demo is isolated from live observations and saved data. Returning to live restores the tab's real data and starts a fresh scan; demo IPs and annotations never enter the saved store.

**A browser cannot enumerate WAN interfaces or force traffic through each line.** Your OS, router, VPN, and connection reuse decide the path. Three internet lines might expose only one address; IPv4 and IPv6 can be from the same line; idle failover lines may not appear at all. Switch the active connection and scan again without reloading to accumulate observations. Earlier observations are labeled separately from the latest scan. For a complete physical-line inventory, use your router’s WAN status or a local interface-aware diagnostic tool.

A failed IPv6 check means “not observed,” not “unsupported.” HTTP durations include service and connection overhead and are **not ping, bandwidth, or speed-test results**. IP geolocation is approximate; the browser timezone is a separate device setting.

## Finding all addresses on a multi-WAN setup

Open **Looking for all your addresses?**, choose the expected IPv4 and IPv6 counts (there is a **3 IPv4 + 3 IPv6** preset), then **Run multi-WAN scan**. This enables deeper discovery without silently enabling WebRTC. The coverage panel distinguishes this scan from all collected observations and shows which expected counts remain missing. Expectations are tab-only and included in JSON exports.

Deep mode adds `v4.ident.me` and `v6.ident.me` ([API documentation](https://api.ident.me/)), plus `ip4only.me/api/` and `ip6only.me/api/` ([API documentation](https://ip4only.me/docs/)). These add destination-network diversity beyond ipify and icanhazip. For the CSV API only field 2, the remote address, is used; forwarded-header fields are not trusted. Quick and automatic scans never contact the extra providers. Providers may change routing or rate-limit; they are not availability guarantees.

**Reaching 3 + 3 is a count, not proof of three lines.** A router's WAN IPv6, device global IPv6 addresses, temporary privacy addresses and delegated prefixes are not interchangeable. Device-only WebRTC candidates are listed for completeness but excluded from remote-observed coverage and history address comparisons. An address remotely confirmed in an earlier scan is not counted as remotely confirmed now merely because it reappears as a device candidate.

If an address remains missing, use the router's WAN status as the authoritative inventory. For external verification, explicitly route **only the testing device** through each WAN in turn and scan in the same tab. Do not disable a shared WAN just for this test. If multiple adapters connect directly to the computer, use OS routing or a local interface-bound tool. A static website cannot enumerate all NICs, bypass source-address selection, force a fresh TCP connection, or activate an idle failover WAN. Query-string cache-busting and fresh ICE sessions improve sampling but do not override these limits.

## Privacy and external services

Loading the live page contacts this server, `api.ipify.org`, `api6.ipify.org`, `api64.ipify.org`, `ipv4.icanhazip.com`, and `ipv6.icanhazip.com`. Those services receive the source IP and normal request metadata. Requests omit credentials and referrers. Only explicitly choosing “Look up details” sends the selected IP to `ipapi.co`. Only enabling WebRTC for a scan contacts Google and Cloudflare STUN.

Explicit deep scans additionally contact ident.me and ip4.me through the four endpoints above. They receive the source IP and normal request metadata and have their own retention policies. See [ident.me's policy](https://api.ident.me/) and [ip4.me's legal notice](https://ip4only.me/legal.txt). Device candidates exposed by optional WebRTC may include global IPv6 addresses that ordinary HTTP requests do not use.

There are no accounts, analytics, external fonts, or cookies. Language and appearance preferences use local browser storage. **IP observations, names, and history are not persisted unless you explicitly opt in.** Saved connection data stays in this browser, is not cloud-synced, and can be accessed by others using this browser profile. New data replaces old entries at the stated retention limits. Clearing site data in browser settings is an alternative if in-app removal is blocked. This server does not log requests; external providers and your hosting infrastructure may have their own logging/retention policies. Reports contain IP addresses and manual names. The hide control masks all on-screen IP text, including history, but not copied or exported data.

External services can be blocked, rate-limited, or unavailable; each failure is visible under **Behind the results**. For high-traffic production use, arrange suitable service agreements or substitute your own geographically/network-diverse, CORS-enabled echo endpoints in `src/discovery.ts`. A backend proxy to an external IP service would see the backend’s IP, **not the visitor’s**, and is intentionally not used.

## JSON API and deployment

`GET /api/whoami` (also `HEAD`) returns the address seen by the site server and limited request context. No caching, no wildcard CORS, and no full-header dumps. It is usable by scripts and same-origin integrations.

```sh
curl http://127.0.0.1:3001/api/whoami
```

Configuration:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | Listening port |
| `HOST` | `127.0.0.1` | Bind address; set `0.0.0.0` only when intentionally exposing the service |
| `TRUST_PROXY` | `false` | Trust the first validated `X-Forwarded-For` entry instead of the socket address |

Use HTTPS for a public deployment. **Only enable `TRUST_PROXY=true` behind a controlled reverse proxy that strips/replaces incoming forwarding headers, and prevent clients from reaching this server directly.** Otherwise a client can spoof its reported IP. Forwarding headers are ignored by default. A local or private socket address is returned as such by the API and excluded from the public address list.

The production server serves `dist`, protects against path traversal, and sets a Content Security Policy for the configured providers. Update that policy in `server.mjs` when changing endpoints. The IP API supports IPv6 when the host and bind configuration support it; a dual-stack public deployment requires appropriate DNS and networking.

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover public-IP parsing, normalization, deduplication, bounded history, scan comparisons, storage validation/failures, labels, localization, timeouts, cancellation, multi-round discovery, and optional lookups. Server tests cover address provenance and static serving. Browser tests exercise live mocked responses and a labeled demo at desktop and mobile sizes, including language/theme changes, labels, history, opt-in persistence, automatic scan lifecycle, copy/export, and failure states.
