// Snapshot/restore previously-enriched issue metadata so re-scraping a CBH page
// doesn't wipe all the `slug` / `marvelId` / `digitalId` / `drn` / `cover` values
// the enricher spent minutes populating (and which trigger marvel.com rate limits
// when re-fetched).
//
// The cache is keyed by a stable (normalized_title | number | year) tuple,
// independent of the arbitrary per-event `Issue.id`.

import { readFile, writeFile } from 'node:fs/promises';
import { loadEvents, writeEvents } from './lib-events.js';
import type { EventsFile, Issue } from '../pwa/src/lib/schema';

const CACHE_PATH = new URL('./.enrichment-cache.json', import.meta.url);

type CachedFields = Pick<Issue, 'marvelId' | 'slug' | 'digitalId' | 'drn' | 'cover' | 'publishedAt'>;

function key(issue: Pick<Issue, 'title' | 'number' | 'year'>): string {
  return `${issue.title.toLowerCase().trim()}|${issue.number}|${issue.year}`;
}

export async function snapshotEnrichment(): Promise<number> {
  let file: EventsFile;
  try {
    file = loadEvents() as unknown as EventsFile;
  } catch {
    return 0;
  }

  let existing: Record<string, CachedFields> = {};
  try {
    existing = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {}

  let added = 0;
  for (const ev of file.events) {
    for (const iss of ev.issues) {
      const hasData = iss.marvelId || iss.slug || iss.digitalId || iss.drn || iss.cover;
      if (!hasData) continue;
      const k = key(iss);
      if (!existing[k]) added++;
      existing[k] = {
        marvelId: iss.marvelId,
        slug: iss.slug,
        digitalId: iss.digitalId,
        drn: iss.drn,
        cover: iss.cover,
        publishedAt: iss.publishedAt,
      };
    }
  }

  // Cache file isn't the app's data source of truth — plain writeFile is fine.
  await writeFile(CACHE_PATH, JSON.stringify(existing, null, 2));
  return added;
}

export async function restoreEnrichment(): Promise<number> {
  let file: EventsFile;
  try {
    file = loadEvents() as unknown as EventsFile;
  } catch {
    return 0;
  }

  let cache: Record<string, CachedFields> = {};
  try {
    cache = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    return 0;
  }

  let applied = 0;
  for (const ev of file.events) {
    for (const iss of ev.issues) {
      const c = cache[key(iss)];
      if (!c) continue;
      if (c.marvelId && !iss.marvelId) iss.marvelId = c.marvelId;
      if (c.slug && !iss.slug) iss.slug = c.slug;
      if (c.digitalId && !iss.digitalId) iss.digitalId = c.digitalId;
      if (c.drn && !iss.drn) iss.drn = c.drn;
      if (c.cover && !iss.cover) iss.cover = c.cover;
      if (c.publishedAt && !iss.publishedAt) iss.publishedAt = c.publishedAt;
      applied++;
    }
  }

  writeEvents(file);
  return applied;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  if (mode === 'snapshot') {
    const n = await snapshotEnrichment();
    console.log(`snapshot: ${n} new cache entr${n === 1 ? 'y' : 'ies'}`);
  } else if (mode === 'restore') {
    const n = await restoreEnrichment();
    console.log(`restore: applied cache to ${n} issue${n === 1 ? '' : 's'}`);
  } else {
    console.error('usage: lib-enrichment-cache.ts snapshot|restore');
    process.exit(1);
  }
}
