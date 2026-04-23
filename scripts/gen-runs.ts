/**
 * Generates run-category guides — a writer's tenure on a single title.
 *
 * Runs are schema-identical to events but tagged `category: 'run'` so the UI can
 * distinguish them (e.g. a small badge) and the X-Men team guide can interleave
 * them chronologically with crossovers.
 *
 * Each run is defined declaratively at the top of this file with the series title
 * and first/last issue numbers + years. We interpolate the publication year across
 * the issue range to keep things simple. The issue `title` matches the canonical
 * series name in Marvel.com's sitemap, so a later `enrich-from-sitemap` pass will
 * fill in `slug`/`marvelId`/`digitalId`/`drn`/`cover` automatically.
 *
 * Usage: `npm run gen:runs`
 */

import { loadEvents, writeEvents } from './lib-events.js';
import type { Event, EventsFile, Issue, Role } from '../pwa/src/lib/schema';
import { deriveEventCovers } from './lib-covers';

interface RunSpec {
  id: string;
  name: string;
  slug: string;
  summary: string;
  series: string;          // title prefix, e.g. "New X-Men"
  startIssue: number;
  endIssue: number;
  startYear: number;
  endYear: number;
  sourceUrl: string;
}

const RUNS: RunSpec[] = [
  {
    id: 'morrison-new-x-men',
    name: "Grant Morrison — New X-Men",
    slug: 'morrison-new-x-men',
    summary: "Morrison's radical reset: Emma Frost joins, Cassandra Nova, secondary mutations, Jean's death, Xorn, Here Comes Tomorrow.",
    series: 'New X-Men',
    startIssue: 114,
    endIssue: 154,
    startYear: 2001,
    endYear: 2004,
    sourceUrl: 'https://en.wikipedia.org/wiki/Grant_Morrison%27s_New_X-Men',
  },
  {
    id: 'whedon-astonishing-x-men',
    name: "Joss Whedon — Astonishing X-Men",
    slug: 'whedon-astonishing-x-men',
    summary: "Team back-to-basics: Gifted, Dangerous, Torn, Unstoppable. The return of Colossus; the Cure; Danger; Breakworld.",
    series: 'Astonishing X-Men',
    startIssue: 1,
    endIssue: 24,
    startYear: 2004,
    endYear: 2008,
    sourceUrl: 'https://en.wikipedia.org/wiki/Astonishing_X-Men',
  },
  {
    id: 'brubaker-uncanny-x-men',
    name: "Ed Brubaker — Uncanny X-Men",
    slug: 'brubaker-uncanny-x-men',
    summary: "Rise and Fall of the Shi'ar Empire, The Extremists, Divided We Stand. Sets up the post-Decimation status quo.",
    series: 'Uncanny X-Men',
    startIssue: 475,
    endIssue: 499,
    startYear: 2006,
    endYear: 2008,
    sourceUrl: 'https://en.wikipedia.org/wiki/Uncanny_X-Men',
  },
  {
    id: 'fraction-uncanny-x-men',
    name: "Matt Fraction — Uncanny X-Men",
    slug: 'fraction-uncanny-x-men',
    summary: "Manifest Destiny → Utopia → Second Coming → Five Lights. San Francisco era ends, Utopia born.",
    series: 'Uncanny X-Men',
    startIssue: 500,
    endIssue: 544,
    startYear: 2008,
    endYear: 2011,
    sourceUrl: 'https://en.wikipedia.org/wiki/Uncanny_X-Men',
  },
  {
    id: 'gillen-uncanny-x-men',
    name: "Kieron Gillen — Uncanny X-Men",
    slug: 'gillen-uncanny-x-men',
    summary: "Fear Itself, Schism, Regenesis and the start of AvX from Cyclops' extinction-team angle.",
    series: 'Uncanny X-Men',
    startIssue: 1,
    endIssue: 20,
    startYear: 2011,
    endYear: 2013,
    sourceUrl: 'https://en.wikipedia.org/wiki/Uncanny_X-Men_(2011_comic_book)',
  },
  {
    id: 'aaron-wolverine-and-the-x-men',
    name: "Jason Aaron — Wolverine and the X-Men",
    slug: 'aaron-wolverine-and-the-x-men',
    summary: "Post-Schism Jean Grey School. Kid Omega, Hellfire Brats, Age of Ultron, AvX tie-ins.",
    series: 'Wolverine and the X-Men',
    startIssue: 1,
    endIssue: 42,
    startYear: 2011,
    endYear: 2014,
    sourceUrl: 'https://en.wikipedia.org/wiki/Wolverine_and_the_X-Men_(comic_book)',
  },
  {
    id: 'bendis-all-new-x-men',
    name: "Brian Michael Bendis — All-New X-Men",
    slug: 'bendis-all-new-x-men',
    summary: "Original 5 X-Men time-displaced to the present. Paired with Uncanny X-Men vol.3 by the same author.",
    series: 'All-New X-Men',
    startIssue: 1,
    endIssue: 41,
    startYear: 2012,
    endYear: 2015,
    sourceUrl: 'https://en.wikipedia.org/wiki/All-New_X-Men',
  },
  {
    id: 'bendis-uncanny-x-men-vol3',
    name: "Brian Michael Bendis — Uncanny X-Men (vol.3)",
    slug: 'bendis-uncanny-x-men-vol3',
    summary: "Revolutionary Cyclops' extinction team, post-AvX. Paired with All-New X-Men.",
    series: 'Uncanny X-Men',
    startIssue: 1,
    endIssue: 35,
    startYear: 2013,
    endYear: 2015,
    sourceUrl: 'https://en.wikipedia.org/wiki/Uncanny_X-Men_(2013_comic_book)',
  },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function interpolateYear(run: RunSpec, issueNum: number): number {
  const totalIssues = run.endIssue - run.startIssue + 1;
  const totalYears = run.endYear - run.startYear;
  const idx = issueNum - run.startIssue;
  return Math.round(run.startYear + (idx / totalIssues) * totalYears);
}

function buildRunEvent(run: RunSpec): Event {
  const issues: Issue[] = [];
  for (let n = run.startIssue; n <= run.endIssue; n++) {
    const year = interpolateYear(run, n);
    const role: Role = 'core'; // every issue in a run is core by definition
    issues.push({
      id: `${run.id}-${n}`,
      title: run.series,
      number: n,
      year,
      role,
    });
  }
  return {
    id: run.id,
    name: run.name,
    slug: run.slug,
    year: run.startYear,
    endYear: run.endYear,
    summary: run.summary,
    category: 'run',
    sourceUrl: run.sourceUrl,
    sources: [{ label: 'Wikipedia', url: run.sourceUrl }],
    issues,
  };
}

async function main() {
  const file = loadEvents() as unknown as EventsFile;
  const byId = new Map(file.events.map((e) => [e.id, e]));

  for (const run of RUNS) {
    const event = buildRunEvent(run);
    if (byId.has(run.id)) {
      // Preserve enrichment if already present
      const existing = byId.get(run.id)!;
      const byKey = new Map(existing.issues.map((i) => [`${i.title}|${i.number}|${i.year}`, i]));
      for (const fresh of event.issues) {
        const k = `${fresh.title}|${fresh.number}|${fresh.year}`;
        const prev = byKey.get(k);
        if (prev) {
          fresh.marvelId = prev.marvelId;
          fresh.slug = prev.slug;
          fresh.digitalId = prev.digitalId;
          fresh.drn = prev.drn;
          fresh.cover = prev.cover;
        }
      }
      Object.assign(existing, event);
      console.log(`  updated run '${run.id}' (${event.issues.length} issues)`);
    } else {
      file.events.push(event);
      console.log(`  added run '${run.id}' (${event.issues.length} issues)`);
    }
  }

  // Issues in freshly-generated runs may already have a cover if the enricher cache
  // kicked in. Derive the event-level cover so the Home card and detail hero look
  // complete even before the next `enrich-from-sitemap` pass.
  const covered = deriveEventCovers(file);
  if (covered > 0) console.log(`  derived ${covered} event-level cover(s) from issues`);

  file.generatedAt = new Date().toISOString();
  writeEvents(file);
  console.log(`\nWrote events.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
