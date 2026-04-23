/**
 * Merges hand-curated guides from `manual-guides.json` into `pwa/src/data/events.json`.
 *
 * Runs AFTER the CBH and Wikipedia scrapers, BEFORE the enrichers — that way the
 * manual issues still go through slug/digitalId/DRN/cover enrichment in a single
 * subsequent pass.
 *
 * Hand-curation is reserved for sources where scraping is unreliable or unsupported
 * (e.g. Cyclops the character, West Coast Avengers the team). Each entry is schema-
 * identical to a scraped event; issue IDs are generated deterministically so
 * re-merges don't duplicate.
 *
 * Usage: `npm run merge:manual`
 */

import { readFile } from 'node:fs/promises';
import { loadEvents, writeEvents } from './lib-events.js';
import type { Event, EventsFile, Issue } from '../pwa/src/lib/schema';
import { deriveEventCovers, deriveTeamCovers } from './lib-covers';

interface ManualIssueSpec {
  title: string;
  number: number;
  year: number;
  role: Issue['role'];
  note?: string;
}

interface ManualGuide extends Omit<Event, 'issues'> {
  issues: ManualIssueSpec[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const guidesPath = new URL('./manual-guides.json', import.meta.url);

  const file = loadEvents() as unknown as EventsFile;
  const manual: { guides: ManualGuide[] } = JSON.parse(await readFile(guidesPath, 'utf8'));

  const byId = new Map(file.events.map((e) => [e.id, e]));

  for (const guide of manual.guides) {
    const issuesWithIds: Issue[] = guide.issues.map((i, idx) => ({
      id: `${guide.id}-${slugify(i.title)}-${i.number}-${i.year}-${idx}`,
      title: i.title,
      number: i.number,
      year: i.year,
      role: i.role,
      note: i.note,
    }));

    if (byId.has(guide.id)) {
      // Overwrite existing event (manual wins on conflict).
      const ev = byId.get(guide.id)!;
      ev.name = guide.name;
      ev.slug = guide.slug;
      ev.year = guide.year;
      ev.endYear = guide.endYear;
      ev.summary = guide.summary;
      ev.category = guide.category;
      ev.sourceUrl = guide.sourceUrl;
      ev.sources = guide.sources;
      ev.issues = issuesWithIds;
      console.log(`  replaced '${guide.id}' (${issuesWithIds.length} issues)`);
    } else {
      file.events.push({ ...guide, issues: issuesWithIds });
      console.log(`  added '${guide.id}' (${issuesWithIds.length} issues)`);
    }
  }

  const evCovers = deriveEventCovers(file);
  const tmCovers = deriveTeamCovers(file);
  if (evCovers || tmCovers) {
    console.log(`  derived ${evCovers} event + ${tmCovers} team cover(s)`);
  }

  file.generatedAt = new Date().toISOString();
  writeEvents(file);
  console.log(`\nWrote events.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
