import type { Category, Event } from './schema';
import { getAllEvents } from './data';

/**
 * Cross-reference index: DRN → list of events where the issue appears.
 * Issues without a DRN fall back to a synthetic (title|number|year) key.
 *
 * Used for:
 *  - Showing "also in: Cyclops, X-Men" chips in EventDetail
 *  - Auto-grouping team/character guide issues by matching crossover event (so Cyclops'
 *    reading list shows "House of M" as a section header around the HoM issues)
 */

export interface CrossRef {
  eventId: string;
  eventName: string;
  eventSlug: string;
  category: Category;
}

type IssueLike = { drn?: string; title: string; number: number; year: number };

let cachedIndex: Map<string, CrossRef[]> | null = null;

function indexKey(issue: IssueLike): string {
  if (issue.drn) return `drn:${issue.drn}`;
  return `t:${issue.title.toLowerCase().trim()}|${issue.number}|${issue.year}`;
}

function buildIndex(events: Event[]): Map<string, CrossRef[]> {
  const map = new Map<string, CrossRef[]>();
  for (const ev of events) {
    const category = ev.category ?? 'crossover';
    for (const issue of ev.issues) {
      const key = indexKey(issue);
      const list = map.get(key) ?? [];
      list.push({ eventId: ev.id, eventName: ev.name, eventSlug: ev.slug, category });
      map.set(key, list);
    }
  }
  return map;
}

function getIndex(): Map<string, CrossRef[]> {
  if (!cachedIndex) cachedIndex = buildIndex(getAllEvents());
  return cachedIndex;
}

export function crossRefsFor(issue: IssueLike, currentEventId: string): CrossRef[] {
  const list = getIndex().get(indexKey(issue)) ?? [];
  return list.filter((ref) => ref.eventId !== currentEventId);
}

/**
 * Returns the best-matching crossover event for an issue, if any. Used to label issues
 * inside a team/character guide with the era/event they belong to.
 * Picks the first crossover match (guides are typically scraped in chronological order).
 */
export function crossoverEraFor(issue: IssueLike, currentEventId: string): CrossRef | null {
  const refs = crossRefsFor(issue, currentEventId);
  return refs.find((r) => r.category === 'crossover') ?? null;
}

/**
 * For a team/character guide, expand its issues into a chronological list of "chapters":
 * each chapter is either a matched crossover event (with the team's issues that fall inside it)
 * or a standalone issue block (for issues that don't match any event).
 *
 * Preserves the guide's own reading order — every time the matched event changes,
 * a new chapter starts. Consecutive unmatched issues fold into a single standalone chapter.
 */
export interface GuideChapter {
  kind: 'event' | 'standalone';
  eventId?: string;
  eventName?: string;
  eventSlug?: string;
  eventYear?: number;
  issues: IssueLike[];
}

export function guideChapters(
  issues: IssueLike[],
  currentEventId: string,
  eventsById?: Map<string, { year: number; endYear?: number }>,
): GuideChapter[] {
  const out: GuideChapter[] = [];
  let cur: GuideChapter | null = null;
  for (const iss of issues) {
    const era = crossoverEraFor(iss, currentEventId);
    const eventId = era?.eventId ?? null;
    const kind: GuideChapter['kind'] = eventId ? 'event' : 'standalone';

    if (!cur || cur.kind !== kind || cur.eventId !== (eventId ?? undefined)) {
      cur = kind === 'event'
        ? {
            kind: 'event',
            eventId: era!.eventId,
            eventName: era!.eventName,
            eventSlug: era!.eventSlug,
            eventYear: eventsById?.get(era!.eventId)?.year,
            issues: [],
          }
        : { kind: 'standalone', issues: [] };
      out.push(cur);
    }
    cur.issues.push(iss);
  }
  return out;
}
