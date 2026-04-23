/**
 * Propagate enriched metadata across duplicate issue entries.
 *
 * The same issue (same `marvelId`) frequently appears in multiple guides —
 * e.g. "New X-Men #114" lives in both the Grant Morrison run and the
 * Cyclops character spine. The sitemap + bifrost enrichers populate fields
 * per-entry, and sometimes one copy gets `drn` / `digitalId` / `cover` and
 * the other doesn't. That's a silent regression: the un-enriched copy
 * loses its native deeplink and can't be tracked by the remote progress
 * sync (no DRN ⇒ no cloud button in the PWA).
 *
 * This script groups issues by `marvelId` across all events, picks the
 * first non-null value per propagatable field, and copies it back onto
 * every entry in the group that was missing it. Safe to re-run — it only
 * fills nulls. Flags conflicts (same field, different non-null values) on
 * stderr; that shouldn't happen in normal operation and indicates a scraper
 * bug.
 *
 * Runs last in the pipeline, after `enrich:sitemap` and `enrich:comicvine`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_PATH = resolve(__dirname, '../pwa/src/data/events.json');

type Issue = Record<string, unknown> & { marvelId?: number };
type Event = { id: string; name: string; issues?: Issue[] };
type EventsFile = { generatedAt?: string; events: Event[] };

const PROPAGATE_FIELDS = ['drn', 'digitalId', 'slug', 'cover'] as const;

const raw = readFileSync(EVENTS_PATH, 'utf8');
const data: EventsFile = JSON.parse(raw);

// Pass 1: collect the best-known value per (marvelId, field).
const bestByMarvelId = new Map<number, Record<string, unknown>>();
let conflictCount = 0;

for (const event of data.events) {
  for (const issue of event.issues ?? []) {
    const mid = issue.marvelId;
    if (typeof mid !== 'number') continue;

    const cur = bestByMarvelId.get(mid) ?? {};
    for (const field of PROPAGATE_FIELDS) {
      const incoming = (issue as Record<string, unknown>)[field];
      if (incoming == null) continue;
      if (cur[field] == null) {
        cur[field] = incoming;
      } else if (cur[field] !== incoming) {
        conflictCount++;
        process.stderr.write(
          `! conflict marvelId=${mid} field=${field}: ` +
            `${JSON.stringify(cur[field])} vs ${JSON.stringify(incoming)} (keeping first)\n`,
        );
      }
    }
    bestByMarvelId.set(mid, cur);
  }
}

// Pass 2: fill in missing fields on every entry.
let patchedFields = 0;
let affectedIssues = 0;

for (const event of data.events) {
  for (const issue of event.issues ?? []) {
    const mid = issue.marvelId;
    if (typeof mid !== 'number') continue;
    const merged = bestByMarvelId.get(mid);
    if (!merged) continue;

    let touched = false;
    for (const field of PROPAGATE_FIELDS) {
      const current = (issue as Record<string, unknown>)[field];
      if (current == null && merged[field] != null) {
        (issue as Record<string, unknown>)[field] = merged[field];
        patchedFields++;
        touched = true;
      }
    }
    if (touched) affectedIssues++;
  }
}

writeFileSync(EVENTS_PATH, JSON.stringify(data, null, 2) + '\n');

console.log(
  `dedup-enrichment: patched ${patchedFields} field(s) across ${affectedIssues} issue(s) ` +
    `(${bestByMarvelId.size} unique marvelIds, ${conflictCount} conflict(s) flagged).`,
);
