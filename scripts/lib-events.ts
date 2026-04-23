/**
 * I/O helper for `pwa/src/data/events.json`. All pipeline scripts should
 * read via `loadEvents()` and write via `writeEvents()` so they don't
 * care whether the on-disk file is in the legacy flat shape or the
 * normalised (catalog + refs) shape.
 *
 * `loadEvents()` always returns the **hydrated / flat** view — every
 * issue has its identity fields inline, ready for in-place mutation by
 * scrapers and enrichers.
 *
 * `writeEvents(file)` is currently a thin wrapper around `writeFileSync`
 * that preserves whatever shape you pass. To emit the normalised form,
 * run `normalize-catalog.ts` as the final step of the pipeline — that
 * script handles the shape transformation explicitly and keeps its
 * concerns separate from enrichment logic.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const EVENTS_PATH = resolve(__dirname, '../pwa/src/data/events.json');

// ---- types --------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

interface FlatIssue extends AnyRecord {
  id: string;
  title?: string;
  number?: number;
  year?: number;
  role: string;
  note?: string;
  marvelId?: number;
  digitalId?: number;
  drn?: string;
  slug?: string;
  cover?: string;
  publishedAt?: string;
}

interface EventRecord extends AnyRecord {
  id: string;
  issues?: FlatIssue[];
}

export interface EventsFile {
  generatedAt?: string;
  events: EventRecord[];
}

interface NormalisedIssue extends AnyRecord {
  id: string;
  role: string;
  note?: string;
  ref?: number;
  title?: string;
  number?: number;
  year?: number;
  slug?: string;
  digitalId?: number;
  drn?: string;
  cover?: string;
  publishedAt?: string;
}

interface NormalisedEventsFile {
  generatedAt?: string;
  catalog: Record<string, AnyRecord>;
  events: Array<AnyRecord & { id: string; issues?: NormalisedIssue[] }>;
}

function isNormalised(raw: unknown): raw is NormalisedEventsFile {
  const r = raw as NormalisedEventsFile;
  return !!r && typeof r === 'object' && typeof r.catalog === 'object' && r.catalog != null;
}

// ---- load ---------------------------------------------------------------

/**
 * Read events.json from disk, returning the hydrated/flat form regardless
 * of on-disk shape. Safe to mutate the returned object in-place and pass
 * back to `writeEvents`.
 */
export function loadEvents(): EventsFile {
  const raw = JSON.parse(readFileSync(EVENTS_PATH, 'utf8'));
  if (!isNormalised(raw)) return raw as EventsFile;

  const catalog = raw.catalog;
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

  const events = raw.events.map((ev) => {
    const issues: FlatIssue[] = (ev.issues ?? []).map((r) => {
      const cat: AnyRecord | undefined =
        r.ref != null ? catalog[String(r.ref)] : undefined;
      const issue: FlatIssue = {
        id: r.id,
        role: r.role,
      };
      if (r.note != null) issue.note = r.note;
      if (r.ref != null) issue.marvelId = r.ref;
      for (const f of CATALOG_FIELDS) {
        const v = r[f] ?? cat?.[f];
        if (v != null) issue[f] = v as never;
      }
      return issue;
    });
    return { ...ev, issues } as EventRecord;
  });

  return { generatedAt: raw.generatedAt, events };
}

// ---- write --------------------------------------------------------------

/**
 * Write the in-memory file back to disk in whatever shape you provide.
 * Pipeline scripts hand in the flat shape; `normalize-catalog.ts` runs
 * at the end of the pipeline to re-shape to normalised before commit.
 */
export function writeEvents(file: EventsFile | NormalisedEventsFile): void {
  writeFileSync(EVENTS_PATH, JSON.stringify(file, null, 2) + '\n');
}
