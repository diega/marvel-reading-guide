/**
 * Wikipedia scraper — fallback for events CBH doesn't cover cleanly.
 *
 * Wikipedia wraps each heading in `<div class="mw-heading{N}">` rather than using
 * raw `<hN>` tags, so we detect section starts/ends by class. Event articles
 * typically have a "Titles involved" section with sub-headings (Prologue / Core /
 * Tie-ins / Epilogue) that map directly to our role enum — and older or shorter
 * pages fall back to a flat "Issues" or "Reading order" list.
 *
 * Runs AFTER `scrape-cbh.ts` and MERGES into the existing events.json (preserves
 * per-issue enrichment when re-scraping).
 *
 * Usage: `npm run scrape:wikipedia`
 */

import * as cheerio from 'cheerio';
import { loadEvents, writeEvents } from './lib-events.js';
import type { Event, EventsFile, Issue, Role } from '../pwa/src/lib/schema';

interface WikiSource {
  id: string;
  name: string;
  slug: string;
  year: number;
  endYear?: number;
  summary: string;
  url: string;
  coreTitles?: string[];
}

const SOURCES: WikiSource[] = [
  {
    id: 'utopia',
    name: 'Dark Reign: Utopia',
    slug: 'utopia',
    year: 2009,
    summary: "Norman Osborn's Dark Avengers clash with the X-Men. Cyclops founds Utopia.",
    url: 'https://en.wikipedia.org/wiki/Utopia_(comics)',
    coreTitles: ['uncanny x-men', 'dark avengers', 'utopia', 'exodus'],
  },
  {
    id: 'second-coming',
    name: 'X-Men: Second Coming',
    slug: 'second-coming',
    year: 2010,
    summary: "Hope Summers returns to the present. Nightcrawler dies. X-Force goes proactive.",
    url: 'https://en.wikipedia.org/wiki/X-Men:_Second_Coming',
    coreTitles: ['x-men: second coming', 'second coming', 'cable', 'uncanny x-men', 'x-force', 'x-men legacy', 'new mutants'],
  },
  {
    id: 'age-of-x',
    name: 'Age of X',
    slug: 'age-of-x',
    year: 2011,
    summary: "Legion creates an alternate reality where mutants are hunted. Short Carey crossover.",
    url: 'https://en.wikipedia.org/wiki/Age_of_X',
    coreTitles: ['age of x', 'x-men legacy', 'new mutants'],
  },
  {
    id: 'schism',
    name: 'X-Men: Schism',
    slug: 'schism',
    year: 2011,
    summary: "Cyclops vs. Wolverine. The X-Men split into two factions.",
    url: 'https://en.wikipedia.org/wiki/X-Men:_Schism',
    coreTitles: ['schism', 'prelude to schism', 'regenesis'],
  },
  {
    id: 'axis',
    name: 'Avengers & X-Men: AXIS',
    slug: 'axis',
    year: 2014,
    summary: "Red Skull becomes Onslaught. Magneto forms a reluctant alliance.",
    url: 'https://en.wikipedia.org/wiki/Avengers_%26_X-Men:_AXIS',
    coreTitles: ['axis', 'avengers & x-men'],
  },
  {
    id: 'battle-of-the-atom',
    name: 'X-Men: Battle of the Atom',
    slug: 'battle-of-the-atom',
    year: 2013,
    summary: "Future X-Men come back to force the original time-displaced X-Men home.",
    url: 'https://en.wikipedia.org/wiki/X-Men:_Battle_of_the_Atom',
    coreTitles: ['battle of the atom', 'all-new x-men', 'x-men', 'uncanny x-men', 'wolverine and the x-men'],
  },
  {
    id: 'death-of-x',
    name: 'Death of X',
    slug: 'death-of-x',
    year: 2016,
    summary: "Retelling of what happened between Secret Wars end and the IvX preamble. Death of Cyclops.",
    url: 'https://en.wikipedia.org/wiki/Death_of_X',
    coreTitles: ['death of x'],
  },
  {
    id: 'from-the-ashes',
    name: 'From the Ashes',
    slug: 'from-the-ashes',
    year: 2024,
    summary: "Post-Krakoa era relaunch. X-Men return to flagship titles after Fall of X.",
    url: 'https://en.wikipedia.org/wiki/X-Men:_From_the_Ashes',
    coreTitles: ['x-men', 'uncanny x-men', 'exceptional x-men', 'nyx', 'x-factor', 'x-force', 'phoenix', 'dazzler', 'storm', 'magik', 'laura', 'sentinels', 'wolverine', 'deadpool'],
  },
  {
    id: 'messiah-complex',
    name: 'X-Men: Messiah Complex',
    slug: 'messiah-complex',
    year: 2007,
    endYear: 2008,
    summary: "First mutant birth since M-Day triggers a war. Hope Summers is born; X-Force reforms.",
    url: 'https://en.wikipedia.org/wiki/X-Men:_Messiah_Complex',
    coreTitles: ['messiah complex'],
  },
  {
    id: 'curse-of-the-mutants',
    name: 'X-Men: Curse of the Mutants',
    slug: 'curse-of-the-mutants',
    year: 2010,
    summary: "Vampires invade Utopia. Dracula's son Xarus is crowned. Jubilee is turned.",
    url: 'https://en.wikipedia.org/wiki/Curse_of_the_Mutants',
    coreTitles: ['curse of the mutants', 'x-men', 'x-men: curse'],
  },
  {
    id: 'necrosha',
    name: 'Necrosha',
    slug: 'necrosha',
    year: 2009,
    endYear: 2010,
    summary: "Selene and the Inner Circle resurrect dead mutants on Genosha.",
    url: 'https://en.wikipedia.org/wiki/Necrosha',
    coreTitles: ['necrosha', 'x-necrosha', 'x-force', 'x-men: legacy', 'new mutants'],
  },
  {
    id: 'hellfire-galas',
    name: 'Hellfire Galas',
    slug: 'hellfire-galas',
    year: 2021,
    endYear: 2023,
    summary: "Annual Krakoan soiree. Became a staging ground for major arcs (2021 reveal, 2022 Destiny of X, 2023 Fall of X).",
    url: 'https://en.wikipedia.org/wiki/Hellfire_Gala',
    coreTitles: ['hellfire gala', 'x-men: hellfire gala', 'immortal x-men', 'x-men'],
  },
  {
    id: 'fear-itself',
    name: 'Fear Itself',
    slug: 'fear-itself',
    year: 2011,
    summary: "The Serpent, God of Fear, returns and worthy heroes take up hammers. X-Men tie-ins throughout.",
    url: 'https://en.wikipedia.org/wiki/Fear_Itself_(comics)',
    coreTitles: ['fear itself', 'worthy', 'uncanny x-men'],
  },
  {
    id: 'dark-x-men',
    name: 'Dark X-Men',
    slug: 'dark-x-men',
    year: 2009,
    endYear: 2023,
    summary: "Norman Osborn's Dark Reign X-Men team (2009) and the Fall-of-X–era relaunch (2023).",
    url: 'https://en.wikipedia.org/wiki/Dark_X-Men',
    coreTitles: ['dark x-men'],
  },
  {
    id: 'age-of-revelation',
    name: 'Age of Revelation',
    slug: 'age-of-revelation',
    year: 2025,
    endYear: 2026,
    summary: "Doug Ramsey unleashes an apocalyptic reality. Jonathan Hickman's follow-up to Krakoa.",
    url: 'https://en.wikipedia.org/wiki/Age_of_Revelation',
    coreTitles: ['age of revelation', 'x-men', 'uncanny x-men', 'magik', 'storm', 'phoenix', 'psylocke'],
  },
  {
    id: 'inferno-hickman',
    name: 'Inferno (Hickman, 2021)',
    slug: 'inferno-hickman',
    year: 2021,
    summary: "Hickman's farewell to Krakoa. Moira's secret revealed; 'Krakoa forever' becomes 'Krakoa must fall'.",
    url: 'https://en.wikipedia.org/wiki/Inferno_(Marvel_Comics)',
    coreTitles: ['inferno'],
  },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15';

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseIssueLines(text: string, role: Role, year: number): Issue[] {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\[\d+\]/g, '')                         // WP citations
    .replace(/^chapter\s+\d+\s*[:\-\u2013\u2014]?\s*/i, '')  // "Chapter 2: Uncanny X-Men..." → "Uncanny X-Men..."
    .replace(/^part\s+\d+\s*[:\-\u2013\u2014]?\s*["'"]?/i, '')
    .trim();
  if (!cleaned) return [];
  // Reject prose (collected edition summaries, narrative asides).
  if (cleaned.length > 140) return [];
  if (/\bwritten by\b|\bdrawn by\b|\bstarting with\b|\bcollects?\b|\bomnibus\b|\btrade paperback\b/i.test(cleaned)) return [];
  // Reject bare titles lacking any issue-like token
  if (!/#\d/.test(cleaned) && cleaned.split(/\s+/).length < 2) return [];

  const range = cleaned.match(/^(.+?)\s*#?(\d+)\s*[\-\u2013\u2014]\s*#?(\d+)\b/);
  if (range) {
    const [, rawTitle, aStr, bStr] = range;
    const title = rawTitle.replace(/[:,]\s*$/, '').trim();
    const a = parseInt(aStr, 10), b = parseInt(bStr, 10);
    if (b - a > 15) return [];
    const out: Issue[] = [];
    for (let n = a; n <= b; n++) {
      out.push({ id: slugify(`${title}-${n}`), title, number: n, year, role });
    }
    return out;
  }

  const single = cleaned.match(/^(.+?)\s+#(\d+)\b/);
  if (single) {
    const [, rawTitle, numStr] = single;
    const title = rawTitle.replace(/[:,]\s*$/, '').trim();
    return [{ id: slugify(`${title}-${numStr}`), title, number: parseInt(numStr, 10), year, role }];
  }

  return [];
}

// Map WP section heading → our Role enum
function roleFromHeading(text: string): Role | null {
  const t = text.toLowerCase();
  if (/prologue|prelude|lead[- ]?in|road to/.test(t)) return 'context';
  if (/core (mini|series|title)|main (title|mini|series)|ongoing series\b/.test(t)) return 'core';
  if (/tie[-. ]?in|one[- ]?shot|limited series|infinity comics|events and crossovers/.test(t)) return 'tie-in-required';
  if (/epilogue|aftermath|conclusion/.test(t)) return 'context';
  if (/reading order|issues/.test(t)) return 'core';
  return null;
}

function extractIssues(source: WikiSource, html: string): Issue[] {
  const $ = cheerio.load(html);
  const parser = $('.mw-parser-output').first();

  const issues: Issue[] = [];
  let inSection = false;
  let currentRole: Role = 'tie-in-required';
  const year = source.endYear ?? source.year;

  parser.children().each((_, el) => {
    const tag = el.tagName?.toLowerCase?.() ?? '';
    const cls = el.attribs?.class || '';
    const text = $(el).clone().find('.mw-editsection, sup').remove().end().text().trim();

    // Section markers are div.mw-heading2 / mw-heading3.
    // We allow multiple collection-sections per article (Titles + Reading order + Tie-ins etc).
    if (/mw-heading2/.test(cls)) {
      const cleaned = text.replace(/\[edit\]$/, '').trim();
      if (/^(titles involved|titles|reading order|issues|publication( details)?|involved issues|issues involved|collected issues|chronological reading order)$/i.test(cleaned) ||
          /^"march to/i.test(cleaned) ||
          /^issues\b/i.test(cleaned) ||
          /^tie-ins/i.test(cleaned) ||
          /^main plot$/i.test(cleaned) ||
          /^norman osborn|^dark x-men 2023$/i.test(cleaned) ||
          /^chronological/i.test(cleaned)) {
        inSection = true;
        currentRole = /reading order|^issues|^titles$|^publication|involved issues|chronological/i.test(cleaned) ? 'core' : 'tie-in-required';
        return;
      }
      // non-matching H2: just close the current section and keep scanning
      inSection = false;
      return;
    }

    if (!inSection) return;

    if (/mw-heading[34]/.test(cls)) {
      const cleaned = text.replace(/\[edit\]$/, '').trim();
      const r = roleFromHeading(cleaned);
      if (r) currentRole = r;
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      $(el).find('> li').each((_, li) => {
        const liText = $(li).clone().find('sup').remove().end().text().trim();
        for (const parsed of parseIssueLines(liText, currentRole, year)) {
          const isCore = (source.coreTitles ?? []).some((t) =>
            parsed.title.toLowerCase().includes(t.toLowerCase()),
          );
          if (isCore && parsed.role === 'tie-in-required') parsed.role = 'core';
          issues.push(parsed);
        }
      });
    }

    if (tag === 'p') {
      for (const parsed of parseIssueLines(text, currentRole, year)) {
        const isCore = (source.coreTitles ?? []).some((t) =>
          parsed.title.toLowerCase().includes(t.toLowerCase()),
        );
        if (isCore && parsed.role === 'tie-in-required') parsed.role = 'core';
        issues.push(parsed);
      }
    }

    if (tag === 'table') {
      // Two common layouts:
      //   A) Series listing: [Title, Issues(#N or #N-M), Writer, Artist, ...]
      //   B) Crossover parts: [Part#, Title#N, Release date, ...]
      //
      // Infinity Comics table quirk: first row has full title "X-Men: From the Ashes | Eversong | #1-3",
      // subsequent rows are continuations with just arc-name + issue range. We track the last seen
      // "full" series title (one containing a recognized keyword) and reuse it for ambiguous rows.
      const rows = $(el).find('tr').toArray();
      const seriesKeywords = /x-?men|marvel|wolverine|spider-?man|deadpool|phoenix|avengers|uncanny|astonishing|psylocke|storm|magik|dazzler|sentinels|nyx|hellions|cable|magneto|cyclops|mystique/i;
      let lastSeriesTitle: string | null = null;
      for (const row of rows) {
        const cells = $(row).find('td').map((_, c) => $(c).text().trim().replace(/\s+/g, ' ')).get();
        if (cells.length < 2) continue;

        let titleCell = cells[0].replace(/\[[a-z0-9]+\]/g, '').trim();
        let issuesPart: string | null = null;

        // Layout B: first cell is just a part number (e.g. "1", "2")
        if (/^\d{1,2}$/.test(titleCell)) {
          // Title#N is likely in cell 1
          const c1 = cells[1].replace(/\[[a-z0-9]+\]/g, '').trim();
          const m = c1.match(/^(.+?)\s+#(\d+)\s*$/);
          if (m) {
            titleCell = m[1];
            issuesPart = `#${m[2]}`;
          } else {
            continue; // skip if no parseable title
          }
        } else {
          // Layout A: scan remaining cells for issue number
          for (let i = 1; i < Math.min(cells.length, 4); i++) {
            const c = cells[i].replace(/\[[a-z0-9]+\]/g, '').trim();
            if (/^#?\d+(\s*[\-\u2013\u2014]\s*#?\d+)?$/.test(c) || /^\(\s*#?\d+/.test(c)) {
              issuesPart = c;
              break;
            }
          }
        }

        if (!titleCell || /^(symbol|\*+|title)$/i.test(titleCell)) continue;
        // Skip obvious section labels (bolded text in a 1-cell row)
        if (titleCell.length > 80 || cells.length === 1) continue;

        // If titleCell doesn't contain a known series keyword, inherit the last full series title
        // (Infinity Comics pattern) — OR skip the row if we have no context.
        if (!seriesKeywords.test(titleCell)) {
          if (lastSeriesTitle) {
            titleCell = lastSeriesTitle;
          } else {
            continue;
          }
        } else {
          lastSeriesTitle = titleCell;
        }

        const combined = issuesPart ? `${titleCell} ${issuesPart}` : `${titleCell} #1`;
        for (const parsed of parseIssueLines(combined, currentRole, year)) {
          const isCore = (source.coreTitles ?? []).some((t) =>
            parsed.title.toLowerCase().includes(t.toLowerCase()),
          );
          if (isCore && parsed.role === 'tie-in-required') parsed.role = 'core';
          issues.push(parsed);
        }
      }
    }
  });

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

function inferLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('comicbookherald')) return 'Comic Book Herald';
    if (u.hostname.includes('wikipedia')) return 'Wikipedia';
    if (u.hostname.includes('crushingkrisis')) return 'Crushing Krisis';
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

async function main() {
  const existing = loadEvents() as unknown as EventsFile;
  const byId = new Map(existing.events.map((e) => [e.id, e]));

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

    const wpSrc = { label: 'Wikipedia', url: source.url };

    // Backfill category on existing events
    for (const e of existing.events) { if (!e.category) e.category = 'crossover'; }

    if (byId.has(source.id)) {
      // Merge into existing event: dedupe by issue.id, track Wikipedia as additional source.
      const ev = byId.get(source.id)!;
      const seen = new Set(ev.issues.map((i) => i.id));
      let added = 0;
      for (const i of issues) {
        if (!seen.has(i.id)) { ev.issues.push(i); seen.add(i.id); added++; }
      }
      ev.sources = ev.sources ?? [];
      if (ev.sourceUrl && !ev.sources.some((s) => s.url === ev.sourceUrl)) {
        ev.sources.push({ label: inferLabel(ev.sourceUrl), url: ev.sourceUrl });
      }
      if (!ev.sources.some((s) => s.url === source.url)) ev.sources.push(wpSrc);
      console.log(`  merged into '${source.id}' (+${added} new issues, total ${ev.issues.length})`);
    } else {
      existing.events.push({
        id: source.id,
        name: source.name,
        slug: source.slug,
        year: source.year,
        endYear: source.endYear,
        summary: source.summary,
        category: 'crossover',
        sourceUrl: source.url,
        sources: [wpSrc],
        issues,
      });
      console.log(`  added new event '${source.id}'`);
    }
  }

  existing.generatedAt = new Date().toISOString();
  writeEvents(existing);
  console.log(`\nWrote events.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
