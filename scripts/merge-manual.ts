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
 * Two kinds of curation coexist in manual-guides.json:
 *   · `guides[]`               — full reading-list definitions (issues, summary, ...).
 *   · `teamEventsMappings`     — per-team crossover-membership for the Atlas
 *                                transit-map. Survives the scrape-cbh rewrite
 *                                (which would otherwise wipe event-level fields
 *                                it didn't produce) by living in this file and
 *                                being re-applied every pipeline run.
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

interface ManualFile {
  guides: ManualGuide[];
  /** Optional per-team crossover-membership mappings. Key = team event id,
   *  value = list of crossover event ids. Silently skipped for teams or
   *  events that don't exist in events.json (with a console warning). */
  teamEventsMappings?: Record<string, string[]>;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Apply per-team crossover mappings from `manual-guides.json`. Extracted so it
 * can be unit-tested in isolation against an in-memory EventsFile fixture.
 *
 * Returns counts for logging; logs warnings for unknown teams or events.
 * Silently drops unknown event ids from a mapping (keeps the valid ones) —
 * this is what you want when a crossover gets renamed or removed from
 * events.json and the curator hasn't caught up yet.
 */
export function applyTeamEventsMappings(
  file: EventsFile,
  mappings: Record<string, string[]>,
): { applied: number; unknownTeams: string[]; unknownEvents: string[] } {
  const byId = new Map(file.events.map((e) => [e.id, e]));
  const unknownTeams: string[] = [];
  const unknownEvents: string[] = [];
  let applied = 0;

  for (const [teamId, eventIds] of Object.entries(mappings)) {
    const team = byId.get(teamId);
    if (!team) {
      unknownTeams.push(teamId);
      continue;
    }
    if (team.category !== 'team') {
      console.warn(
        `  ⚠ teamEventsMappings['${teamId}']: entry is category='${team.category}', expected 'team' — skipping`,
      );
      continue;
    }
    const kept: string[] = [];
    for (const eid of eventIds) {
      const ev = byId.get(eid);
      if (!ev) {
        unknownEvents.push(`${teamId}→${eid}`);
        continue;
      }
      kept.push(eid);
    }
    team.teamEvents = kept;
    applied++;
  }

  if (unknownTeams.length) {
    console.warn(
      `  ⚠ teamEventsMappings: ${unknownTeams.length} unknown team id(s) skipped: ${unknownTeams.join(', ')}`,
    );
  }
  if (unknownEvents.length) {
    console.warn(
      `  ⚠ teamEventsMappings: ${unknownEvents.length} unknown event reference(s) dropped: ${unknownEvents.join(', ')}`,
    );
  }
  return { applied, unknownTeams, unknownEvents };
}

async function main() {
  const guidesPath = new URL('./manual-guides.json', import.meta.url);

  const file = loadEvents() as unknown as EventsFile;
  const manual: ManualFile = JSON.parse(await readFile(guidesPath, 'utf8'));

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

  if (manual.teamEventsMappings) {
    const { applied } = applyTeamEventsMappings(file, manual.teamEventsMappings);
    if (applied) console.log(`  applied teamEventsMappings to ${applied} team(s)`);
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

// CLI — only fires when this file is the entry point, so tests can
// import `applyTeamEventsMappings` without triggering a file write.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
