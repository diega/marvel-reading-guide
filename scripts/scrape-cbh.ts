/**
 * Comic Book Herald scraper.
 *
 * CBH publishes one page per event (or per character / per team) with an "Issue by Issue"
 * or similar H2/H3 that introduces the canonical reading order. The scraper walks the
 * post body, flips into collecting mode when it matches `listHeading`, and extracts
 * issue references from <li> and <p> elements until it hits an end marker.
 *
 * Roles are inferred heuristically:
 *   - core               title contains one of the event's `coreTitles`
 *   - tie-in-required    any other issue inside the canonical reading order
 *   - tie-in-optional    issues under a heading whose text says "optional" / "bonus"
 *   - context            issues under a "prelude" / "epilogue" / "previously" heading
 *
 * Output: writes `pwa/src/data/events.json` from scratch. Pair with `scrape-wikipedia.ts`
 * and `merge-manual.ts` for full coverage; follow with `enrich-from-sitemap.ts` and
 * `enrich-from-comicvine.ts` to fill metadata.
 *
 * Usage: `npm run scrape:cbh`
 */

import * as cheerio from 'cheerio';
import { writeEvents } from './lib-events.js';
// Parsing helpers live in lib-cbh-parse.ts so they have unit tests — the
// scraper's end-to-end behaviour depends on them, and we don't want to
// find regressions by re-scraping live pages (which destructively
// overwrites events.json and burns rate-limit budget).
import { parseIssueLine } from './lib-cbh-parse.js';
import type { Category, Event, EventsFile, Issue, Role } from '../pwa/src/lib/schema';

interface CbhSource {
  id: string;
  name: string;
  slug: string;
  year: number;
  endYear?: number;
  summary: string;
  url: string;
  category?: Category;
  // Heading text (case-insensitive substring) that introduces the canonical reading order.
  // For character/team pages this matches the FIRST era heading.
  listHeading: RegExp;
  // Optional: heading substring that ends it (next section we should ignore). Defaults to next H2.
  endHeading?: RegExp;
  // Substring(s) that identify the "core" main series for role-tagging.
  coreTitles: string[];
  // For character/team guides we want to collect across ALL H2 sections (each era).
  // Event pages have a single H3/list.
  collectAcrossH2?: boolean;
}

const SOURCES: CbhSource[] = [
  {
    id: 'house-of-m',
    name: 'House of M',
    slug: 'house-of-m',
    year: 2005,
    endYear: 2006,
    summary: "Scarlet Witch rewrites reality. The 'No More Mutants' aftermath decimates the mutant population.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/guide-part-4-house-of-m/',
    listHeading: /digital comics unlimited event reading order|issue by issue/i,
    coreTitles: ['house of m'],
  },
  {
    id: 'decimation',
    name: 'Decimation',
    slug: 'decimation',
    year: 2006,
    summary: "The 198 remaining mutants regroup while humanity hunts the depowered. X-Men: Deadly Genesis sets up Messiah Complex.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/guide-part-5-decimation/',
    listHeading: /issue by issue|reading order|reading list|reading timeline/i,
    coreTitles: ['decimation', 'son of m', 'generation m'],
  },
  {
    id: 'messiah-complex',
    name: 'X-Men: Messiah Complex',
    slug: 'messiah-complex',
    year: 2007,
    endYear: 2008,
    summary: "First mutant birth since M-Day triggers a war. Hope Summers is born; X-Force reforms.",
    url: 'https://www.comicbookherald.com/herald-guided-tour-x-men-messiah-complex/',
    listHeading: /hunt for the mutant messiah|reading order|reading list|issue by issue|on your comic book shelves/i,
    coreTitles: ['messiah complex', 'x-men', 'uncanny x-men', 'x-factor', 'new x-men'],
  },
  {
    id: 'avengers-vs-x-men',
    name: 'Avengers vs. X-Men',
    slug: 'avengers-vs-x-men',
    year: 2012,
    summary: "The Phoenix Force returns to Earth. Avengers and X-Men clash over Hope Summers.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/guide-part-16-avengers-vs-x-men/',
    listHeading: /issue by issue.*avengers.*x-men.*reading|avx.*reading|issue by issue/i,
    coreTitles: ['avengers vs', 'avx'],
  },
  {
    id: 'hox-pox',
    name: 'House of X / Powers of X',
    slug: 'hox-pox',
    year: 2019,
    summary: "Hickman reboots mutantkind on Krakoa. 12-issue interwoven reset of the X-Men.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/jonathan-hickman-x-men-reading-order/',
    listHeading: /^house of x and powers of x reading order/i,
    endHeading: /after hox|dawn of x trade|hardcover collections|issue by issue|everything is x of swords|next:|heroically support/i,
    coreTitles: ['house of x', 'powers of x'],
  },
  {
    id: 'dawn-of-x',
    name: 'Dawn of X + X of Swords',
    slug: 'dawn-of-x',
    year: 2019,
    endYear: 2020,
    summary: "Krakoan-era launch post-HoX/PoX: Dawn of X titles + X of Swords crossover.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/jonathan-hickman-x-men-reading-order/',
    listHeading: /^issue by issue dawn of x/i,
    endHeading: /^next:|reign of x|heroically support/i,
    coreTitles: ['house of x', 'powers of x', 'x-men', 'new mutants', 'excalibur', 'fallen angels', 'marauders', 'x-force', 'x-factor', 'cable', 'hellions', 'giant-size', 'x of swords'],
  },
  {
    id: 'reign-of-x',
    name: 'Reign of X',
    slug: 'reign-of-x',
    year: 2021,
    endYear: 2022,
    summary: "Post-X of Swords Krakoa era: Inferno, Hellfire Gala 2021, Trial of Magneto, X Lives/Deaths of Wolverine.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/jonathan-hickman-x-men-reading-order/reign-of-x/',
    listHeading: /issue by issue reign of x comics checklist/i,
    coreTitles: ['x-men', 'inferno', 'trial of magneto', 'x-factor', 'marauders', 'excalibur', 'new mutants', 'x-force', 'cable', 'hellions', 'hellfire gala', 's.w.o.r.d.', 'way of x', 'x lives', 'x deaths', 'children of the atom', 'wolverine', 'giant-size'],
  },
  {
    id: 'destiny-of-x',
    name: 'Destiny of X',
    slug: 'destiny-of-x',
    year: 2022,
    endYear: 2023,
    summary: "Krakoan era deepens: Immortal X-Men, X-Men Red, Legion of X, A.X.E., Knights of X.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/jonathan-hickman-x-men-reading-order/destiny-of-x/',
    listHeading: /destiny of x comics/i,
    coreTitles: ['immortal x-men', 'x-men red', 'x-men', 'legion of x', 'knights of x', 'marauders', 'sabretooth', 'wolverine', 'x-force', 'new mutants', 'x-terminators', 'dark web'],
  },
  {
    id: 'judgment-day',
    name: 'A.X.E.: Judgment Day',
    slug: 'judgment-day',
    year: 2022,
    summary: "Eternals judge mutants and humanity. Orchis era builds.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/marvel-fresh-start-reading-order/judgment-day-reading-order/',
    listHeading: /judgment day issue by issue|comics checklist/i,
    coreTitles: ['a.x.e.', 'axe:', 'judgment day'],
  },
  {
    id: 'sins-of-sinister',
    name: 'Sins of Sinister',
    slug: 'sins-of-sinister',
    year: 2023,
    summary: "Sinister corrupts the Krakoan resurrection protocols. Three alternate-timeline trilogies.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/x-men-sins-of-sinister/',
    listHeading: /sins of sinister comics checklist/i,
    coreTitles: ['sins of sinister', 'immortal x-men', 'nightcrawlers', 'storm', 'immoral x-men'],
  },
  {
    id: 'fall-of-x',
    name: 'Fall of X',
    slug: 'fall-of-x',
    year: 2023,
    endYear: 2024,
    summary: "Orchis dismantles Krakoa. The end of the Hickman/Gillen/Duggan/Ewing era.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/jonathan-hickman-x-men-reading-order/fall-of-x/',
    listHeading: /fall of x comics|orchis strikes/i,
    coreTitles: ['x-men', 'uncanny x-men', 'rise of the powers of x', 'wolverine', 'hellfire gala', 'immortal x-men', 'invincible iron man', 'x-men red', 'dark x-men', 'ms marvel', 'realm of x', 'children of the vault', 'uncanny spider-man'],
  },
  {
    id: 'inhumans-vs-x-men',
    name: 'Inhumans vs. X-Men',
    slug: 'inhumans-vs-x-men',
    year: 2016,
    endYear: 2017,
    summary: "Terrigen Mist decimates mutants. Inhumans and X-Men go to war.",
    url: 'https://www.comicbookherald.com/the-complete-marvel-reading-order-guide/inhumans-vs-x-men/',
    listHeading: /comic book reading order/i,
    coreTitles: ['inhumans vs', 'ivx', 'death of x'],
  },

  // --- CHARACTERS ---
  {
    id: 'wolverine',
    name: 'Wolverine',
    slug: 'wolverine',
    year: 1974,
    endYear: 2026,
    summary: "Logan's full reading order across eras — Claremont, Old Man Logan, Return of Wolverine, Krakoa.",
    url: 'https://www.comicbookherald.com/wolverine-reading-order/',
    category: 'character',
    collectAcrossH2: true,
    listHeading: /chris claremont wolverine era|wolverine does the 1990s|wolverine reading order/i,
    endHeading: /latest additions|related reading/i,
    coreTitles: ['wolverine', 'old man logan', 'weapon x', 'x-force', 'death of wolverine', 'return of wolverine'],
  },
  {
    id: 'magneto',
    name: 'Magneto',
    slug: 'magneto',
    year: 1963,
    endYear: 2026,
    summary: "Magneto across every era — villain, anti-hero, headmaster, revolutionary, Krakoan founder.",
    url: 'https://www.comicbookherald.com/magneto-reading-order/',
    category: 'character',
    collectAcrossH2: true,
    listHeading: /magneto comics reading order|magneto origins/i,
    endHeading: /latest additions|related reading/i,
    coreTitles: ['magneto'],
  },
  // Gambit's CBH page has no heading structure — skip.
  // Emma Frost's CBH page is narrative prose, can't be scraped cleanly — skip.
  {
    id: 'cable',
    name: 'Cable',
    slug: 'cable',
    year: 1986,
    endYear: 2026,
    summary: "Nathan Summers / Askani'son from his New Mutants debut through X-Force, Cable & Deadpool and Krakoa.",
    url: 'https://www.comicbookherald.com/cable-reading-order/',
    category: 'character',
    collectAcrossH2: true,
    listHeading: /enter cable|cable and x-force/i,
    endHeading: /latest additions|related reading/i,
    coreTitles: ['cable', 'x-force', 'cable and deadpool'],
  },

  // --- TEAMS ---
  {
    id: 'x-force',
    name: 'X-Force',
    slug: 'x-force',
    year: 1991,
    endYear: 2026,
    summary: "The black-ops X-Men — from Cable's 90s X-Force to Uncanny X-Force and the Krakoan black-ops team.",
    url: 'https://www.comicbookherald.com/x-force-reading-order/',
    category: 'team',
    collectAcrossH2: true,
    listHeading: /x-force 90[’']s comic book reading order/i,
    endHeading: /latest additions|related reading/i,
    coreTitles: ['x-force', 'uncanny x-force', 'x-statix'],
  },
  {
    id: 'new-mutants',
    name: 'New Mutants',
    slug: 'new-mutants',
    year: 1982,
    endYear: 2026,
    summary: "Marvel's second mutant generation — from Claremont's teens to X-Force, X-Men at School, and Krakoa.",
    url: 'https://www.comicbookherald.com/new-mutants-reading-order/',
    category: 'team',
    collectAcrossH2: true,
    listHeading: /new mutants comics reading order|chris claremont 1980/i,
    endHeading: /latest additions|related reading/i,
    coreTitles: ['new mutants'],
  },
  {
    id: 'x-men-complete',
    name: 'X-Men (Complete Modern Era)',
    slug: 'x-men-complete',
    year: 1999,
    endYear: 2026,
    summary: "The X-Men team spine across the modern era — Morrison, Whedon, Fraction, Bendis, Hickman, Krakoa and From the Ashes interwoven in one continuous reading order.",
    url: 'https://www.comicbookherald.com/the-complete-x-men-reading-order-guide-modern-marvel-comics-era/',
    category: 'team',
    collectAcrossH2: true,
    listHeading: /before the beginning|where to begin.*new x-men|astonishing x-men by joss whedon/i,
    endHeading: /latest additions|related reading/i,
    coreTitles: ['x-men', 'uncanny x-men', 'new x-men', 'astonishing x-men', 'all-new x-men', 'x-men legacy', 'x-men blue', 'x-men gold', 'x-men red'],
  },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15';

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function extractIssues(source: CbhSource, html: string): Issue[] {
  const $ = cheerio.load(html);
  const root = $('.entry-content').first().length ? $('.entry-content').first() : $('article').first();

  const nodes = root.find('h1, h2, h3, h4, h5, li, p, strong').toArray();

  type State = 'before' | 'collecting' | 'after';
  let state: State = 'before';
  const issues: Issue[] = [];
  const year = source.endYear ?? source.year;

  for (const el of nodes) {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!text) continue;

    if (/^h[1-6]$/.test(tag)) {
      if (state === 'before' && source.listHeading.test(text)) {
        state = 'collecting';
        continue;
      }
      if (state === 'collecting') {
        // For character/team pages, each H2 is a new era — keep collecting.
        // For event pages, H2 typically ends the reading order.
        if (tag === 'h2' && !source.collectAcrossH2) { state = 'after'; continue; }
        if (source.endHeading && source.endHeading.test(text)) { state = 'after'; continue; }
        if (/trade collection|support comic book herald|related reading|next:|also available|cinema|amazon|my marvelous year/i.test(text)) {
          state = 'after';
          continue;
        }
      }
    }

    if (state !== 'collecting') continue;

    if (tag === 'li' || tag === 'p') {
      for (const line of text.split(/\n+/)) {
        const parsed = parseIssueLine(line, 'tie-in-required', year);
        for (const iss of parsed) {
          const isCore = source.coreTitles.some((t) =>
            iss.title.toLowerCase().includes(t.toLowerCase()),
          );
          if (isCore) iss.role = 'core';
          issues.push(iss);
        }
      }
    }
  }

  return dedupe(issues);
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const i of issues) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}

async function main() {
  const events: Event[] = [];
  for (const source of SOURCES) {
    console.log(`\n→ ${source.name}`);
    let html: string;
    try {
      html = await fetchHtml(source.url);
    } catch (err) {
      console.error(`  fetch failed: ${(err as Error).message}`);
      continue;
    }
    const issues = extractIssues(source, html);
    console.log(`  ${issues.length} issues (${issues.filter((i) => i.role === 'core').length} core)`);
    if (issues.length === 0) continue;
    events.push({
      id: source.id,
      name: source.name,
      slug: source.slug,
      year: source.year,
      endYear: source.endYear,
      summary: source.summary,
      category: source.category ?? 'crossover',
      sourceUrl: source.url,
      sources: [{ label: 'Comic Book Herald', url: source.url }],
      issues,
    });
  }

  const file: EventsFile = { generatedAt: new Date().toISOString(), events };
  writeEvents(file);
  console.log(`\nWrote events.json — ${events.length} events, ${events.reduce((s, e) => s + e.issues.length, 0)} issues`);
}

main().catch((e) => { console.error(e); process.exit(1); });
