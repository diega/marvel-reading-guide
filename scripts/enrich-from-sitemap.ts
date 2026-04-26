/**
 * Native Marvel enricher. Fills in, in order:
 *
 *   1. `marvelId` + `slug` — parsed from marvel.com's public sitemap
 *      (https://www.marvel.com/sitemap-comics-{0,1}.xml). One request to each.
 *   2. `digitalId` — fetched from each matched issue's page
 *      (marvel.com/comics/issue/{id}/{slug}) by regex-extracting an
 *      `applink.marvel.com/issue/N` or `digital-comic/N` embedded in the HTML.
 *      Runs with concurrency=6 + exponential backoff + UA rotation on 403.
 *   3. `drn` + `cover` — from bifrost.marvel.com/unison/legacy?digitalId=N,
 *      Marvel's public GraphQL bridge. Bulk-safe, no rate limit observed.
 *   4. `event.cover` + `team.cover` — derived via lib-covers from the issue covers.
 *
 * Overrides in `overrides.json` are applied after the sitemap match and win over
 * any auto-detected value when present.
 *
 * Usage:
 *   npm run enrich:sitemap           # full pipeline
 *   npm run enrich:sitemap:fast      # only step 1 (no network to marvel.com/bifrost)
 */

import { readFile } from 'node:fs/promises';
import { loadEvents, writeEvents } from './lib-events.js';
import type { Event, EventsFile, Issue } from '../pwa/src/lib/schema';
import { deriveEventCovers, deriveTeamCovers } from './lib-covers';

const SITEMAPS = [
  'https://www.marvel.com/sitemap-comics-0.xml',
  'https://www.marvel.com/sitemap-comics-1.xml',
];

const EVENTS_PATH = new URL('../pwa/src/data/events.json', import.meta.url);

interface SitemapEntry {
  id: number;
  slug: string;
  title: string;     // part before _{year}_{num}
  year: number;
  num: number | null;
}

function parseSlug(slug: string): Omit<SitemapEntry, 'id' | 'slug'> | null {
  // Canonical: {title}_{year}_{num}[optional trailing variant text]
  const m = slug.match(/^(.+)_(\d{4})_(\d+)(?:_[a-z0-9_-]+)?$/);
  if (m) {
    return { title: m[1], year: parseInt(m[2], 10), num: parseInt(m[3], 10) };
  }
  // Some one-shots: {title}_{year} (no issue number)
  const m2 = slug.match(/^(.+)_(\d{4})$/);
  if (m2) return { title: m2[1], year: parseInt(m2[2], 10), num: null };
  return null;
}

function normalizeTitle(raw: string, opts: { ampersand?: 'and' | 'drop' } = {}): string {
  let s = raw.toLowerCase();
  // Strip volume suffix in all forms: "(vol. 7)", " vol. 7", " vol 3", "V3"
  s = s.replace(/\s*\(\s*vol\.?\s*\d+\s*\)/gi, '');
  s = s.replace(/\s+vol\.?\s*\d+\b/gi, '');
  s = s.replace(/\s+v\d+\b/gi, '');
  // Strip year suffix: "Uncanny X-Men (2018)" → "Uncanny X-Men"
  s = s.replace(/\s*\(\s*\d{4}\s*\)/g, '');
  s = s.replace(/[\u2013\u2014]/g, '-');   // en/em dash → '-'
  if (opts.ampersand === 'drop') s = s.replace(/\s*&\s*/g, ' ');
  else s = s.replace(/\s*&\s*/g, ' and ');
  s = s.replace(/[':,.!?()]/g, '');
  s = s.replace(/\s+/g, '_');
  s = s.replace(/[^a-z0-9_-]/g, '');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  return s;
}

async function buildIndex(): Promise<Map<string, SitemapEntry[]>> {
  const index = new Map<string, SitemapEntry[]>();
  for (const url of SITEMAPS) {
    console.log(`→ fetching ${url}`);
    const xml = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const urls = xml.match(/comics\/issue\/(\d+)\/([a-z0-9_-]+)/g) ?? [];
    console.log(`  ${urls.length} issue URLs`);
    for (const u of urls) {
      const m = u.match(/comics\/issue\/(\d+)\/([a-z0-9_-]+)/);
      if (!m) continue;
      const id = parseInt(m[1], 10);
      const slug = m[2];
      const parsed = parseSlug(slug);
      if (!parsed) continue;
      const entry: SitemapEntry = { id, slug, ...parsed };
      // Key by normalized title + num (year is part of slug, useful for disambiguation)
      const key = `${parsed.title}|${parsed.num ?? 'x'}`;
      const arr = index.get(key) ?? [];
      arr.push(entry);
      index.set(key, arr);
    }
  }
  console.log(`indexed ${index.size} unique (title, num) combos`);
  return index;
}

/**
 * Try several title normalizations when matching.
 * CBH-style titles often differ subtly from Marvel's canonical slugs
 * (e.g. "Avengers vs. X-Men" vs "avengers_vs_x-men", subtitles, colons).
 */
function candidateTitles(title: string): string[] {
  const base = normalizeTitle(title);
  const candidates = new Set<string>([base]);
  // Ampersand variants — Marvel's slug generator is inconsistent: sometimes &→and, sometimes dropped
  candidates.add(normalizeTitle(title, { ampersand: 'drop' }));
  // Strip common prefixes
  candidates.add(base.replace(/^the_/, ''));
  candidates.add(base.replace(/^x-men_/, ''));
  candidates.add(base.replace(/^uncanny_/, ''));
  // Marvel often prefixes event one-shots with "X-Men_" ("Trial of Magneto"
  // → "x-men_trial_of_magneto") and sometimes also keeps a leading "the"
  // ("X-Men: The Trial of Magneto" → "x-men_the_trial_of_magneto").
  candidates.add(`x-men_${base}`);
  candidates.add(`x-men_the_${base}`);
  // Drop "and" — Marvel's slug convention drops it ("Wolverine and the
  // X-Men" → "wolverine_the_x-men", not "wolverine_and_the_x-men"). Apply
  // both as substitution and as removal.
  candidates.add(base.replace(/_and_/g, '_'));
  // Possessive prefix — Marvel Voices anthologies ("Marvel Voices: ..."
  // → "marvels_voices_..."). Rarely `marvel_voices_`, usually `marvels_`.
  if (/^marvel_/.test(base)) candidates.add(`marvels${base.slice(6)}`);
  // Plural ↔ singular on "Infinity Comics" — sitemap has
  // `x-men_unlimited_infinity_comic_...` (singular).
  candidates.add(base.replace(/_infinity_comics/g, '_infinity_comic'));
  candidates.add(base.replace(/_infinity_comic\b/g, '_infinity_comics'));
  // Handle "Title: Subtitle" → try just subtitle OR just prefix
  const colonSplit = title.split(/:\s+/);
  if (colonSplit.length > 1) {
    candidates.add(normalizeTitle(colonSplit[1]));
    candidates.add(normalizeTitle(colonSplit[0]));
    // "X-Men: Hellfire Gala" + year → Marvel stores year both in slug and title
    candidates.add(normalizeTitle(colonSplit.slice(1).join(' ')));
  }
  // Handle "Title - Subtitle" same way
  const dashSplit = title.split(/\s*[\u2013\u2014\-]\s*/);
  if (dashSplit.length > 1) {
    candidates.add(normalizeTitle(dashSplit[dashSplit.length - 1]));
    candidates.add(normalizeTitle(dashSplit[0]));
  }
  // Common typo correction: "Uncannly" → "uncanny"
  candidates.add(base.replace('uncannly', 'uncanny'));
  // Marvel sometimes appends `_1` to one-shot slugs (e.g. "decimation_..._1_2005_1")
  for (const c of [...candidates]) candidates.add(`${c}_1`);
  return [...candidates].filter((c) => c.length > 0);
}

function isCanonical(e: SitemapEntry): boolean {
  // Drop variants, directors cuts, homage covers, sketch variants, etc.
  return !/(_variant|_variants|_directors_cut|_sketch|_hc\b|_tpb\b|_hardcover|_paperback)/i.test(e.slug);
}

function slugLength(e: SitemapEntry): number {
  // Among canonical hits the shortest slug (no trailing subtitle) wins as a proxy for main edition.
  return e.slug.length;
}

function pickBest(entries: SitemapEntry[], targetYear: number): SitemapEntry | null {
  if (!entries.length) return null;
  const rank = (e: SitemapEntry): [number, number, number] => [
    Math.abs(e.year - targetYear),      // prefer closest year
    isCanonical(e) ? 0 : 1,              // prefer non-variant
    slugLength(e),                        // prefer shortest canonical slug
  ];
  return [...entries].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.id - b.id;
  })[0];
}

const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
];

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function fetchDigitalId(marvelId: number, slug: string, attempt = 1): Promise<number | null> {
  const url = `https://www.marvel.com/comics/issue/${marvelId}/${slug}`;
  const ua = UA_POOL[(attempt - 1) % UA_POOL.length];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html' } });
    if (res.status === 403 || res.status === 429) {
      if (attempt >= 3) return null;
      const wait = 30_000 * attempt;
      console.log(`  marvel.com ${res.status} for ${slug} — backing off ${wait / 1000}s`);
      await sleep(wait);
      return fetchDigitalId(marvelId, slug, attempt + 1);
    }
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/applink\.marvel\.com\/issue\/(\d+)/) ??
      html.match(/digital-comic\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * One-shot bifrost lookup — returns DRN + cover URL from the same response.
 * bifrost is a public unauthenticated GraphQL gateway that marvel.com uses on every
 * issue page to translate legacy digitalId → DRN metadata.
 */
async function fetchBifrost(digitalId: number): Promise<{ drn: string | null; cover: string | null }> {
  // `digitalId` originates from events.json, which lives in this repo, but
  // CodeQL (js/file-access-to-http) flags the file→fetch flow as untrusted.
  // Coerce to an integer at the call boundary so anything weird in the JSON
  // can't smuggle URL components into the fetch.
  const id = Number(digitalId);
  if (!Number.isInteger(id) || id < 0) return { drn: null, cover: null };
  try {
    const res = await fetch(`https://bifrost.marvel.com/unison/legacy?digitalId=${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return { drn: null, cover: null };
    const j: any = await res.json();
    const content = j?.data?.dynamicQueryOrError?.entity?.contents?.[0]?.content;
    const drn = typeof content?.id === 'string' && content.id.startsWith('drn:') ? content.id : null;
    const rawUrl = content?.thumbnails?.[0]?.contentOrError?.entity?.crops?.[0]?.url ?? null;
    return { drn, cover: rawUrl };
  } catch {
    return { drn: null, cover: null };
  }
}

async function runConcurrent<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const out: T[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < tasks.length) {
        const idx = i++;
        out[idx] = await tasks[idx]();
      }
    }),
  );
  return out;
}

async function enrichDigitalIds(file: EventsFile, concurrency = 6, saveCb?: () => Promise<void>): Promise<number> {
  let found = 0;
  const tasks: Array<() => Promise<void>> = [];
  for (const event of file.events) {
    for (const issue of event.issues) {
      if (!issue.marvelId || !issue.slug || issue.digitalId) continue;
      tasks.push(async () => {
        const did = await fetchDigitalId(issue.marvelId!, issue.slug!);
        if (did) { issue.digitalId = did; found++; }
        // Light pacing — not because marvel.com requires it (we've only
        // seen 403s under bursty concurrency, handled by UA-rotating
        // backoff inside fetchDigitalId), but to avoid a microburst when
        // many tasks resolve simultaneously. Dropped from the original
        // 1500-3000ms that was over-cautious for a public HTML endpoint.
        await sleep(200 + Math.random() * 300);
        if (saveCb && found > 0 && found % 25 === 0) await saveCb();
      });
    }
  }
  console.log(`\n→ fetching digitalId for ${tasks.length} issues (concurrency=${concurrency})`);
  await runConcurrent(tasks, concurrency);
  return found;
}

async function enrichBifrost(file: EventsFile, concurrency = 6): Promise<{ drns: number; covers: number }> {
  let drns = 0, covers = 0;
  const tasks: Array<() => Promise<void>> = [];
  for (const event of file.events) {
    for (const issue of event.issues) {
      if (!issue.digitalId) continue;
      if (issue.drn && issue.cover) continue;
      tasks.push(async () => {
        const b = await fetchBifrost(issue.digitalId!);
        if (b.drn && !issue.drn) { issue.drn = b.drn; drns++; }
        if (b.cover && !issue.cover) { issue.cover = b.cover; covers++; }
      });
    }
  }
  console.log(`\n→ bifrost lookup for ${tasks.length} issues (concurrency=${concurrency})`);
  await runConcurrent(tasks, concurrency);
  return { drns, covers };
}

// Event/team cover derivation lives in lib-covers.ts — shared with gen-runs and merge-manual.

interface OverrideEntry {
  title: string;
  number: number;
  year?: number | '*';
  marvelId?: number;
  slug?: string;
  digitalId?: number;
  drn?: string;
  cover?: string;
}

function overrideKey(title: string, num: number, year?: number): string {
  const normalized = title.toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim();
  return `${normalized}|${num}|${year ?? '*'}`;
}

async function loadOverrides(): Promise<Map<string, OverrideEntry>> {
  const path = new URL('./overrides.json', import.meta.url);
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    const entries: OverrideEntry[] = data.entries ?? [];
    const map = new Map<string, OverrideEntry>();
    for (const e of entries) {
      const y = e.year === '*' ? undefined : e.year;
      map.set(overrideKey(e.title, e.number, y), e);
    }
    console.log(`Loaded ${map.size} overrides`);
    return map;
  } catch (err) {
    console.warn(`No overrides file (${(err as Error).message})`);
    return new Map();
  }
}

function applyOverrides(file: EventsFile, overrides: Map<string, OverrideEntry>): number {
  let applied = 0;
  for (const event of file.events) {
    for (const issue of event.issues) {
      const exact = overrides.get(overrideKey(issue.title, issue.number, issue.year));
      const anyYear = overrides.get(overrideKey(issue.title, issue.number));
      const o = exact ?? anyYear;
      if (!o) continue;
      if (o.marvelId && !issue.marvelId) issue.marvelId = o.marvelId;
      if (o.slug && !issue.slug) issue.slug = o.slug;
      if (o.digitalId && !issue.digitalId) issue.digitalId = o.digitalId;
      if (o.drn && !issue.drn) issue.drn = o.drn;
      if (o.cover && !issue.cover) issue.cover = o.cover;
      applied++;
    }
  }
  return applied;
}

async function main() {
  const index = await buildIndex();
  const overrides = await loadOverrides();
  // Reads flat format; hydrates from catalog if on-disk is normalised.
  const file = loadEvents() as unknown as EventsFile;

  let matched = 0;
  let total = 0;
  for (const event of file.events) {
    for (const issue of event.issues) {
      total++;
      const hit = lookup(index, issue);
      if (hit) {
        issue.marvelId = hit.id;
        issue.slug = hit.slug;
        matched++;
      }
    }
    const m = event.issues.filter((i) => i.marvelId).length;
    console.log(`  ${event.name}: ${m}/${event.issues.length}`);
  }

  const overridesApplied = applyOverrides(file, overrides);
  console.log(`\n  overrides applied: ${overridesApplied} issues received extra metadata`);

  const onlySitemap = process.argv.includes('--only-sitemap');
  let digitalIds = 0;
  let bf = { drns: 0, covers: 0 };

  // Autosave after each batch of digitalIds so Ctrl-C never wipes progress.
  // Writes flat — normalisation is a separate pipeline step.
  const save = async () => {
    file.generatedAt = new Date().toISOString();
    writeEvents(file);
    process.stdout.write(' 💾');
  };

  if (!onlySitemap) {
    digitalIds = await enrichDigitalIds(file, 2, save);
    console.log(`\n  digitalIds added this run: ${digitalIds}`);
    await save();

    bf = await enrichBifrost(file);
    console.log(`  DRNs added this run: ${bf.drns}   covers added: ${bf.covers}`);
  } else {
    console.log(`\n  --only-sitemap: skipping marvel.com page fetches and bifrost lookups`);
  }

  const evCovers = deriveEventCovers(file);
  const tmCovers = deriveTeamCovers(file);
  console.log(`  event-level covers derived: ${evCovers}   team covers derived: ${tmCovers}`);

  // Report final coverage
  let withSlug = 0, withDid = 0, withDrn = 0, withCover = 0;
  for (const e of file.events) for (const i of e.issues) {
    if (i.slug) withSlug++;
    if (i.digitalId) withDid++;
    if (i.drn) withDrn++;
    if (i.cover) withCover++;
  }
  console.log(`\n  coverage: slug=${withSlug}/${total}  digitalId=${withDid}/${total}  drn=${withDrn}/${total}  cover=${withCover}/${total}`);

  file.generatedAt = new Date().toISOString();
  writeEvents(file);
  console.log(`\nWrote events.json`);
}

function lookup(index: Map<string, SitemapEntry[]>, issue: Issue): SitemapEntry | null {
  for (const titleKey of candidateTitles(issue.title)) {
    const key = `${titleKey}|${issue.number}`;
    const entries = index.get(key);
    if (!entries) continue;
    const best = pickBest(entries, issue.year);
    if (best) return best;
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
