# Contributing

Thanks for the interest — this project is a labor of love and PRs are welcome.
It's built to be simple enough that anyone who can run a Vite dev server can
play with it.

## Quickstart

```bash
git clone https://github.com/diega/marvel-reading-guide.git
cd marvel-reading-guide/pwa
npm install
npm run dev           # http://localhost:5173
```

The dataset (`pwa/src/data/events.json`) is committed, so the dev server runs
standalone with no backend. All reading state lives in your browser's
IndexedDB.

## Project layout at a glance

- [`pwa/`](pwa/) — the front-end. React + Vite + TypeScript.
- [`scripts/`](scripts/) — the data pipeline that rebuilds
  [`pwa/src/data/events.json`](pwa/src/data/events.json) from public sources
  (Comic Book Herald, Wikipedia, marvel.com sitemap, ComicVine).

## Adding a new reading guide

You don't need to touch any scraper for this — the simplest path is:

1. Edit [`scripts/manual-guides.json`](scripts/manual-guides.json). The file is
   an array of event objects with an `issues` list, each with a role
   (`core` / `tie-in-required` / `tie-in-optional` / `context`). Look at any
   existing manual guide (e.g. the Cyclops character spine) for reference.
2. From `scripts/`, run `npm install && npm run merge:manual` to merge the new
   guide into `events.json`.
3. Optionally run `npm run enrich:sitemap` to fill in `slug`, `marvelId`,
   `digitalId` and cover URLs from marvel.com's public sitemap.
4. Optionally run `CV_API_KEY=... npm run enrich:comicvine` to fill in
   any covers the sitemap missed via ComicVine.
5. `cd ../pwa && npm run dev` and sanity-check the guide renders.

PRs that add manual guides are the easiest to review — they're basically data
changes. If you add a non-X-Men team spine or a character timeline, mention it
in the PR description so reviewers know what to look for.

## Correcting an existing guide

Use [`scripts/overrides.json`](scripts/overrides.json) to override a scraped
guide's issue list without re-editing the scraper output. The `README.md` in
`scripts/` documents the format.

## Adding a new depth level

Don't. The three-level model (α / ε / Ω) is deliberately fixed. If you think
a particular issue is mis-classified, PR a tweak to its `role` in
`events.json` or the corresponding `overrides.json` entry.

## Extension points

The app exposes four runtime extension points for authentication, progress
sync, issue deeplinks, and Account-screen UI. The default implementations
keep the app in fully anonymous, local-only mode. If you want to build your
own overlay (say, to sync your reading progress to a custom backend), see
the contracts in [`pwa/src/lib/extensions.ts`](pwa/src/lib/extensions.ts).
The overlay is a single ES module served at `/extensions/index.js`; the app
loads it via dynamic `import()` on boot and silently falls back to defaults
on 404.

## Code style

- TypeScript strict mode. `npm run typecheck` must pass.
- Prettier-style formatting is enforced informally — keep indentation
  (2 spaces), single quotes, trailing commas.
- No new runtime dependencies without a PR-level discussion. The stack is
  intentionally minimal.
- Component files are `.tsx`, lib files are `.ts` unless they render JSX.

## Commit + PR style

- Conventional subjects are nice but not required. Describe the user-visible
  effect in the PR title.
- If the PR changes `events.json`, mention which event / team / character it
  touched and whether the change came from `scripts/` (scraper output) or
  `scripts/overrides.json` / `scripts/manual-guides.json` (hand-curated).
- Screenshots (before / after) are appreciated for UI changes.

## Bug reports

Open an issue with:

- the browser + device (iOS Safari, desktop Chrome, etc.)
- which route (URL path)
- a screenshot or screen recording if the bug is visual
- any console errors

## License

By submitting a contribution you agree to license it under the repo's
[dual license](LICENSE): Apache 2.0 for code changes, CC BY 4.0 for
dataset changes (`pwa/src/data/events.json`). The distinction matters
only for attribution requirements — both allow commercial use and
modification.
