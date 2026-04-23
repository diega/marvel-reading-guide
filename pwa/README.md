# pwa/ — Marvel Reading Guide front-end

React + Vite + TypeScript PWA, offline-capable, deployed to Cloudflare Pages.

## Development

```bash
npm install
npm run dev                              # http://localhost:5173

npm run typecheck                        # tsc --noEmit
npm run build                            # tsc -b && vite build → dist/
npm run preview                          # serve dist/ locally
```

## Deploy to Cloudflare Pages

```bash
npm run build
CLOUDFLARE_API_TOKEN=<scoped-token> \
CLOUDFLARE_ACCOUNT_ID=<account-id> \
CF_PAGES_PROJECT=<pages-project-name> \
  ./deploy.sh
```

Required token permissions: **Account · Cloudflare Pages : Edit** (plus
`Zone : Read` + `Zone : DNS : Edit` if you're using a custom domain — see below).

`deploy.sh` creates the Pages project if missing and uploads `dist/`. It is
idempotent and mirrors what `.github/workflows/deploy.yml` does on push to
`main`.

### Project name

Both `deploy.sh` and the GitHub Actions workflow require the Pages project
name explicitly; there is no silent fallback to the repo name or similar —
what gets deployed where stays obvious.

- **`deploy.sh`** → reads `$CF_PAGES_PROJECT`. Errors if unset.
- **CI workflow** → reads the `CF_PAGES_PROJECT` repository variable
  (Settings → Secrets and variables → Actions → Variables). Fails fast in a
  dedicated step before anything expensive runs if unset.

### Custom domain (optional)

Set a repository variable `PWA_CUSTOM_DOMAIN` with the hostname you want
(e.g. `example.com` or `reader.example.com`). The workflow's post-deploy
step is idempotent and on every run:

1. Attaches the hostname to the Pages project (no-op if already attached).
2. Upserts a **proxied** `CNAME {PWA_CUSTOM_DOMAIN} → {CF_PAGES_PROJECT}.pages.dev`
   in the hosting zone.

The zone must already be live in the same Cloudflare account (Sites → Add a
site, then point your registrar's nameservers). Cloudflare auto-issues a
Google-backed TLS cert for the domain within a few minutes of attach. The
zone lookup is done automatically — works for both apex (`example.com`) and
one-deep subdomains (`www.example.com` → zone `example.com`).

Forkers who just want the default `*.pages.dev` URL can leave this unset and
skip the extra token scopes.

## Architecture

### Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | [`Home`](src/routes/Home.tsx) | Teams + Characters grid. Level selector at top. |
| `/event/:slug` | [`EventDetail`](src/routes/EventDetail.tsx) / [`GuideDetail`](src/routes/GuideDetail.tsx) | Crossover event → issue list with role badges. Team with `teamEvents` → chronological event cards. |
| `/atlas` | [`Atlas`](src/routes/Atlas.tsx) | Transit-map view: teams as colored lines, events as stations, crossovers as interchanges. |
| `/me` | [`Account`](src/routes/Account.tsx) | Language picker + any overlay-provided extras. |

The app runs in fully anonymous mode by default — no login, no accounts. An
overlay can opt in to an auth gate via the extension points described below.

### State

| Concern | Where | Why |
|---------|-------|-----|
| Auth state | [`lib/extensions-context.tsx`](src/lib/extensions-context.tsx) | Delegated to `extensions.auth`. Default provider is `{ status: 'anon' }`. |
| Reading progress | [`lib/db.ts`](src/lib/db.ts) (Dexie/IndexedDB) | `progress` table keyed by `issueId`. Read via `extensions.progress.useReadSet()`. |
| Depth level (α/ε/Ω) | [`lib/level-context.tsx`](src/lib/level-context.tsx) | React context persisted to `localStorage.mrg:level`. |
| Language | [`lib/i18n.tsx`](src/lib/i18n.tsx) | Built-in provider with ES/EN dictionaries. Persisted to `localStorage.mrg:lang`. |

### Libraries

Just Dexie (IndexedDB wrapper) and react-router-dom. No Redux, no MobX, no
React Query. Everything else is React context or inline `useState`.

### Data consumption

The dataset (`src/data/events.json`, ~3300 issues across 33 guides) is
**imported statically** — Vite inlines it into the JS bundle at build time.
Consumption goes through [`lib/data.ts`](src/lib/data.ts).

### Extension points

On boot, `main.tsx` calls `loadExtensions()` which dynamically `import()`s
`/extensions/index.js`. A 404 silently falls back to defaults; a 200 merges
the overlay's implementation into the resolved extensions context.

Contracts in [`src/lib/extensions.ts`](src/lib/extensions.ts):

- `AuthProvider` — drives the login gate. Default: `{ status: 'anon' }`,
  `requireSignIn: false`.
- `ProgressAdapter` — read-set + mark-read / mark-unread. Default: Dexie-backed
  (local only).
- `DeeplinkResolver` — `webHref(issue)` + `open(issue)`. Default: opens the
  `marvel.com/comics/issue/{id}/{slug}` URL in a new tab.
- `AccountExtras` — optional React component slotted into the Account screen
  above the language picker.

An overlay ships an ES module that `export`s an `extensions` object
(`AppExtensions`) and is copied into `dist/extensions/index.js` during its
own deploy pipeline. This repo never ships that file, so running
`npm run preview` locally always exercises the default anon path.

### Depth levels

Each reading guide (event or team) has issues with a `role`:

| Role | Alpha | Epsilon | Omega |
|------|:-----:|:-------:|:-----:|
| `core` | ✓ | ✓ | ✓ |
| `tie-in-required` | | ✓ | ✓ |
| `tie-in-optional` | | | ✓ |
| `context` | | | ✓ |

Alpha = minimum viable reading (just the main miniseries). Epsilon = the
recommended path with required tie-ins. Omega = completionist. Users pick
once; the selection persists across the app.

### Cross-references

Each issue can appear in multiple guides (e.g. "Avengers vs. X-Men #1" lives
in the AvX crossover event AND the Cyclops character spine).
[`lib/crossref.ts`](src/lib/crossref.ts) builds a `marvelId → events` index
once at first use. EventDetail renders "also in" chips.

## Folder layout

```
pwa/
├── src/
│   ├── routes/                React Router route components
│   ├── lib/                   Contexts, schema, extension contracts + defaults
│   ├── data/events.json       Canonical reading-list dataset (committed)
│   ├── styles.css             Dark UI (single file, CSS custom properties)
│   ├── App.tsx                Router + bottom nav + optional auth gate
│   └── main.tsx               Provider stack (i18n, extensions, level, router)
├── public/                    Static assets + PWA icons
├── index.html                 Vite entry template
├── vite.config.ts             Vite + vite-plugin-pwa config
├── deploy.sh                  One-shot Cloudflare Pages deploy
└── tsconfig.*.json            TypeScript project refs
```

## PWA behaviour

`vite-plugin-pwa` with `registerType: 'autoUpdate'`. The service worker
precaches the app shell and uses a `CacheFirst` strategy for `marvel.com` /
`marvelfe.com` covers (500 entries, 30-day TTL). Installable on iOS and
Android.
