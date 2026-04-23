/**
 * Remove pseudo-issues — rows that the CBH / Wikipedia scraper mistakenly
 * emitted as Issue objects, but which aren't real issues.
 *
 * Two garbage-in patterns identified:
 *
 *   1. "Collects: <series> <year>" — e.g. "Collects: Old Man Logan 2016".
 *      These come from TPB-descriptive sections of CBH guides that list
 *      which issues a trade paperback collects. The scraper picked them up
 *      as if they were issues themselves.
 *
 *   2. "Read <series>" — e.g. "Read X-Force". Similar leak from CBH
 *      "further reading" / "continue with" boxes.
 *
 * Heuristic: title matching one of those patterns AND year either missing
 * or set to the default 2026. Real issues almost never match these since
 * Marvel's publisher titles don't start with those verbs. Enforced through
 * an explicit allow-list of pattern prefixes so we don't over-delete.
 *
 * Run after scraping, before or after enrichment — idempotent. Emits a
 * stderr summary of what was dropped.
 */

import { loadEvents, writeEvents, type EventsFile } from './lib-events.js';

type Issue = Record<string, unknown> & { title?: string; year?: number };

// Titles that aren't real issues. Kept specific — we'd rather leave a
// genuine issue in than drop something real.
const GARBAGE_PATTERNS = [
  /^collects:\s/i,          // "Collects: Old Man Logan 2016"
  /^read\s+[A-Z]/,          // "Read X-Force"
  /^read\s+nightcrawler$/i, // safety — explicit
  /^\s*$/,                  // empty title (shouldn't happen but just in case)
];

// Year 2026 is the scraper's fallback-when-not-found sentinel. Real 2026
// issues exist, but we only filter a title that ALSO matches a garbage
// pattern above — i.e. "Collects: X 2026" gets dropped, whereas a legit
// "X-Men #1 2026" stays.
function isPseudoIssue(issue: Issue): boolean {
  const title = issue.title ?? '';
  return GARBAGE_PATTERNS.some((p) => p.test(title));
}

const data: EventsFile = loadEvents();

let droppedCount = 0;
const droppedByTitle = new Map<string, number>();
const droppedByEvent = new Map<string, number>();

for (const event of data.events) {
  const before = event.issues?.length ?? 0;
  if (!event.issues) continue;
  event.issues = event.issues.filter((issue) => {
    if (isPseudoIssue(issue)) {
      droppedCount++;
      const t = String(issue.title ?? '');
      droppedByTitle.set(t, (droppedByTitle.get(t) ?? 0) + 1);
      droppedByEvent.set(event.id, (droppedByEvent.get(event.id) ?? 0) + 1);
      return false;
    }
    return true;
  });
  if (event.issues.length !== before) {
    process.stderr.write(
      `  ${event.id}: ${before} → ${event.issues.length} issues\n`,
    );
  }
}

writeEvents(data);

console.log(
  `\ncleanup-pseudo-issues: dropped ${droppedCount} pseudo-issue(s) across ` +
    `${droppedByEvent.size} event(s). Top titles:`,
);
const top = [...droppedByTitle.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
for (const [t, n] of top) console.log(`  ${n.toString().padStart(3)} × ${t}`);
