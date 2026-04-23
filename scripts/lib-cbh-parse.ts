/**
 * Pure parsing helpers for the CBH scraper. No I/O, no network — every
 * function is a function from strings to `Issue[]` (or a slug). Kept
 * separate from `scrape-cbh.ts` so the parsing rules have unit tests
 * (`lib-cbh-parse.test.ts`) and changes can be validated without
 * re-scraping live pages.
 */

import type { Issue, Role } from '../pwa/src/lib/schema';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse a single CBH content line into zero-or-more Issue objects.
 *
 * Handles the TPB-description pattern that dominates character / team
 * guides: a TPB name on one paragraph and a "Collects: …" / "Includes: …"
 * list in the next. The list body is split on commas + " and " and each
 * fragment parsed individually by `parseIssueFragment`.
 *
 * Plain "Title #N" / "Title #1-5" / "Title (YYYY) #N" lines are handed
 * straight to `parseIssueFragment`.
 */
export function parseIssueLine(text: string, role: Role, year: number): Issue[] {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  const listPrefix = raw.match(
    /^(?:collects|includes|contains)(?:\s*\([^)]*\))?:\s*(.+)$/i,
  );
  if (listPrefix) {
    const body = listPrefix[1]
      // "Cable #5 to #14" → "Cable #5-14" so the range matcher picks it up.
      .replace(/(\d+)\s+to\s+#?(\d+)/gi, '$1-$2');
    // Commas are the reliable separator. " And " between fragments is
    // also used (case-insensitive — CBH writes it as "And") and we split
    // on it only when the right-hand side starts with an uppercase word,
    // which generally means a new title rather than a continuation.
    //
    // Deliberately NOT splitting on " & ": ampersand is far more often
    // part of a title ("Cable & Deadpool", "Blood & Metal") than a
    // separator between two refs. CBH consistently uses ", " or " And "
    // for the separator.
    const fragments = body
      .split(/,\s*/)
      .flatMap((p) => p.split(/\s+and\s+(?=[A-Z])/i));
    const out: Issue[] = [];
    for (const f of fragments) {
      out.push(...parseIssueFragment(f.trim(), role, year));
    }
    return out;
  }

  return parseIssueFragment(raw, role, year);
}

/**
 * Parse one slug-like fragment into an Issue (or a run of Issues for a
 * range like "#5-14"). Rejects prose by length + stop-word heuristics.
 * If a `(YYYY)` annotation appears inside the fragment, that year wins
 * over `defaultYear` — CBH uses `(1986)` / `(1993)` to disambiguate
 * multiple series with the same title.
 */
export function parseIssueFragment(
  text: string,
  role: Role,
  defaultYear: number,
): Issue[] {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  // A "(YEAR)" annotation inside a fragment names the series' first year
  // (e.g. "X-Factor (1986) #84-86"). Override the caller's default year
  // so the catalog gets the right series key later on in the pipeline.
  const yearMatch = raw.match(/\((19[6-9]\d|20\d\d)\)/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : defaultYear;

  // Strip TPB-volume prefixes — "Vol. 2: Wolverine #17" is the contents
  // of a trade paperback, not an issue title. Drop the leading "Vol. N:"
  // / "Volume N:" tokens.
  const volStripped = raw.replace(/^(?:vol\.?\s*\d+|volume\s*\d+)[:\s]+/i, '');

  // Strip parens BEFORE the other rejects + regexes — the matchers assume
  // unparenthesised input.
  const cleaned = volStripped
    .replace(/\s*\(\d{4}\)/g, '')
    .replace(/[()]/g, '')
    .trim();
  if (!cleaned) return [];

  // Reject obvious prose (not issue references). Kept conservative so we
  // don't drop real fragments that happen to include a stop-word.
  if (cleaned.length > 200) return [];
  if (
    /^(my review|my thoughts|as i mentioned|check out|this trade|this series|while |buy |for my|for more|also|plus |including|writer|artist|pencil|cover |variant|video companion|krakin|by the time|she |he |they |it was|after |before |during |now |then )/i.test(
      cleaned,
    )
  ) {
    return [];
  }
  if (
    /\b(recommend|deserve|disappointing|enjoyable|review|theory|theories|essay|krakoa podcast|check out)/i.test(
      cleaned,
    )
  ) {
    return [];
  }

  // Reject prose by proxy: the title part (before "#N") should be ≤7
  // words. A real issue is "X-Men #1" or "Uncanny X-Men: Messiah Complex
  // #1", not "She appeared in Uncanny X-Men #393".
  const preHash = cleaned.split(/\s*#\d/)[0];
  if (preHash && preHash.split(/\s+/).length > 7) return [];

  // "Title #1-5" or "Title 1-5" or "Title 1 – 5"
  const range = cleaned.match(/^(.+?)\s*#?(\d+)\s*[\-\u2013\u2014]\s*#?(\d+)\b/);
  if (range) {
    const [, rawTitle, aStr, bStr] = range;
    const title = rawTitle.replace(/[:,]\s*$/, '').trim();
    const a = parseInt(aStr, 10),
      b = parseInt(bStr, 10);
    if (b - a > 30) return []; // guard — avoids treating a year as an issue range
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
    return [
      {
        id: slugify(`${title}-${numStr}`),
        title,
        number: parseInt(numStr, 10),
        year,
        role,
      },
    ];
  }

  return [];
}
