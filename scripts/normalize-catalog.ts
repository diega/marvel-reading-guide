/**
 * Normalise events.json into catalog + ref form.
 *
 * Takes either shape as input (legacy flat or already-normalised) and
 * writes the normalised shape back. Idempotent — re-running on an
 * already-normalised file re-runs the dedup pass and rewrites with
 * sorted catalog keys.
 *
 * What it does:
 *   1. Walk every issue across every event. Collect issues with
 *      `marvelId` into a `catalog: { [marvelId]: CatalogEntry }` map,
 *      keeping the first non-null value seen for each identity field.
 *      Silently prefers existing catalog values over duplicate issue
 *      inlines.
 *   2. Rewrite each event's issues as `EventIssueRef` objects holding
 *      only (id, role, note, ref=marvelId) plus any fields that DIFFER
 *      from the catalog entry (per-appearance overrides). Issues
 *      without marvelId keep their identity fields inline.
 *
 * Supersedes `dedup-enrichment.ts`: normalisation is deduplication by
 * construction — each identity field lives in exactly one place.
 *
 * Bundle effect: with 3300 issues and ~40% marvelId duplication, the
 * normalised form saves ~30-40% on events.json's compressed size.
 * Consumers never see the catalog — `pwa/src/lib/data.ts` hydrates at
 * import time back into the same `Issue` shape.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = resolve(__dirname, '../pwa/src/data/events.json');

// ---- types (loose — script works against either shape) ---------------------

type AnyRecord = Record<string, unknown>;
interface EventLike extends AnyRecord {
  id: string;
  issues?: IssueLike[];
}
interface IssueLike extends AnyRecord {
  id: string;
  marvelId?: number;
  ref?: number;
  role: string;
  note?: string;
}
interface RawFile extends AnyRecord {
  generatedAt?: string;
  catalog?: Record<string, AnyRecord>;
  events: EventLike[];
}

// Fields belonging to the catalog entry (issue identity, not per-appearance).
const CATALOG_FIELDS = [
  'title',
  'number',
  'year',
  'publishedAt',
  'slug',
  'digitalId',
  'drn',
  'cover',
] as const;

// ---- normalise -------------------------------------------------------------

const raw: RawFile = JSON.parse(readFileSync(EVENTS_PATH, 'utf8'));
const wasNormalised = !!raw.catalog;
const priorCatalog: Record<string, AnyRecord> = raw.catalog ?? {};

// Collect every non-null value seen per (marvelId, field), count by value.
// The catalog gets the MODE (most common value) for each field, which beats
// "first seen" when scrapers disagree — e.g. the current-year fallback
// (2026 sentinel) shouldn't win over the correct year when most entries
// carry it right.
const seen = new Map<string, Map<string, Map<string, number>>>();
function recordValue(mid: number, field: string, value: unknown) {
  if (value == null) return;
  const key = String(mid);
  let byField = seen.get(key);
  if (!byField) {
    byField = new Map();
    seen.set(key, byField);
  }
  let byValue = byField.get(field);
  if (!byValue) {
    byValue = new Map();
    byField.set(field, byValue);
  }
  const k = JSON.stringify(value);
  byValue.set(k, (byValue.get(k) ?? 0) + 1);
}

// Pass 1a: collect every observed (marvelId, field, value) across events +
// prior catalog.
for (const event of raw.events) {
  for (const issue of event.issues ?? []) {
    const mid =
      typeof issue.marvelId === 'number'
        ? issue.marvelId
        : typeof issue.ref === 'number'
          ? issue.ref
          : null;
    if (mid == null) continue;
    for (const field of CATALOG_FIELDS) recordValue(mid, field, issue[field]);
  }
}
for (const [key, entry] of Object.entries(priorCatalog)) {
  const mid = Number(key);
  if (!Number.isFinite(mid)) continue;
  for (const field of CATALOG_FIELDS) recordValue(mid, field, entry[field]);
}

// Special-case: slugs encode the year of first publication (e.g.
// `new_x-men_2001_114` → 2001), which is almost always a more reliable
// source than a scraper's issue.year (which falls back to current year on
// failure). Weight the slug-derived year heavily.
function yearFromSlug(slug: unknown): number | null {
  if (typeof slug !== 'string') return null;
  const m = slug.match(/_(\d{4})_\d+$/) ?? slug.match(/_(\d{4})$/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) && y > 1960 && y < 2100 ? y : null;
}

const catalog: Record<string, Record<string, unknown>> = {};

// Pass 1b: build catalog from modes.
for (const [key, byField] of seen) {
  const mid = Number(key);
  const entry: Record<string, unknown> = { marvelId: mid };
  for (const field of CATALOG_FIELDS) {
    const byValue = byField.get(field);
    if (!byValue) continue;
    let bestValue: unknown = null;
    let bestCount = -1;
    for (const [k, count] of byValue) {
      if (count > bestCount) {
        bestCount = count;
        bestValue = JSON.parse(k);
      }
    }
    if (bestValue != null) entry[field] = bestValue;
  }
  // Overwrite `year` with slug-derived if available. The slug carries the
  // series' first year (the "(2001)" in a Marvel catalog listing), which
  // is the canonical identifier — resistant to scraper fallback noise.
  const slugYear = yearFromSlug(entry.slug);
  if (slugYear != null) entry.year = slugYear;
  catalog[key] = entry;
}

// Pass 2: rewrite events.
let inlinedTotal = 0;
let refOnlyTotal = 0;

for (const event of raw.events) {
  event.issues = (event.issues ?? []).map((issue) => {
    const mid =
      typeof issue.marvelId === 'number'
        ? issue.marvelId
        : typeof issue.ref === 'number'
          ? issue.ref
          : null;

    const ref: Record<string, unknown> = {
      id: issue.id,
      role: issue.role,
    };
    if (issue.note != null) ref.note = issue.note;

    if (mid != null) {
      ref.ref = mid;
      // Deliberately DON'T preserve per-appearance overrides for any
      // catalog field. The catalog's mode-picked value is the canonical
      // one for an issue's identity (title, cover, DRN, etc.) — and a
      // single issue should look the same everywhere it appears. If
      // two scrapers disagreed (e.g. comicvine cover vs marvel cover),
      // the mode pick wins; if the mode is genuinely wrong, fix it in
      // the catalog, not per-event.
      refOnlyTotal++;
    } else {
      // No marvelId — inline every identity field we have. There's no
      // catalog entry to hydrate from, so the ref carries the truth.
      for (const field of CATALOG_FIELDS) {
        const v = issue[field];
        if (v != null) ref[field] = v;
      }
      inlinedTotal++;
    }
    return ref as IssueLike;
  });
}

// ---- write ------------------------------------------------------------------

const output: RawFile = {
  generatedAt: raw.generatedAt ?? new Date().toISOString(),
  catalog,
  events: raw.events,
};

// Sort catalog keys for deterministic output.
const sortedCatalog: Record<string, unknown> = {};
for (const k of Object.keys(catalog).sort((a, b) => Number(a) - Number(b))) {
  sortedCatalog[k] = catalog[k];
}
output.catalog = sortedCatalog as Record<string, AnyRecord>;

writeFileSync(EVENTS_PATH, JSON.stringify(output, null, 2) + '\n');

const catalogSize = Object.keys(catalog).length;
console.log(
  `normalize-catalog: ${catalogSize} unique catalog entries, ` +
    `${refOnlyTotal} refs (ref-only), ` +
    `${inlinedTotal} inline-only (no marvelId). ` +
    `input was ${wasNormalised ? 'already normalised' : 'legacy flat'}.`,
);
