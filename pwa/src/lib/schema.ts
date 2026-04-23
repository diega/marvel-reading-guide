export type Role = 'core' | 'tie-in-required' | 'tie-in-optional' | 'context';

/**
 * Hydrated issue — what the PWA's UI layer consumes.
 *
 * Assembled by `data.ts` at import time by joining `CatalogEntry`
 * (shared across events) with `EventIssueRef` (per-event appearance
 * metadata). Consumers don't need to know which format the on-disk
 * `events.json` uses.
 */
export interface Issue {
  id: string;
  marvelId?: number;
  digitalId?: number;
  drn?: string;  // Disney Resource Name — used for native `marvelunlimited://issue/{drn}` deeplinks
  slug?: string;
  title: string;
  number: number;
  year: number;
  publishedAt?: string;
  cover?: string;
  role: Role;
  note?: string;
}

export interface Source {
  label: string;
  url: string;
}

export type Category = 'crossover' | 'character' | 'team' | 'run';

export interface Event {
  id: string;
  name: string;
  year: number;
  endYear?: number;
  slug: string;
  cover?: string;
  summary: string;
  /** 'crossover' (X-Men event), 'character' (Cyclops spine), 'team' (X-Force). */
  category?: Category;
  /**
   * For 'team' guides: explicit list of crossover event ids that belong to this team.
   * When present, the team detail page renders this as the content (a list of event
   * cards) instead of drilling into individual issues. If absent or empty, falls back
   * to rendering the team's issues list directly.
   */
  teamEvents?: string[];
  /** Primary source (kept for back-compat — prefer `sources` when available). */
  sourceUrl: string;
  /** All sources used to compile this event's reading list. */
  sources?: Source[];
  issues: Issue[];
}

export interface EventsFile {
  generatedAt: string;
  events: Event[];
}

// ---------------------------------------------------------------------------
// Normalised on-disk format
//
// `events.json` historically stored Issue objects inline under each event,
// duplicating catalog fields (title, marvelId, digitalId, drn, etc.) for
// every event an issue appeared in. With 3300+ issues and ~40% duplication
// across ~40 events, this wasted bundle size and introduced silent drift
// when the enrichment pipeline filled fields on some copies but not
// others.
//
// The normalised format splits:
//   - catalog      — issue-identity fields keyed by marvelId
//   - events[i].issues  — per-appearance refs (id, role, note) + ref to catalog
//
// data.ts detects either format and hydrates on import. Scrapers + the
// `normalize-catalog.ts` step emit the normalised form; consumers see
// Issue (the hydrated shape).
// ---------------------------------------------------------------------------

/** Catalog entry — identity fields for a specific published issue.
 *  Immutable across the events it appears in. */
export interface CatalogEntry {
  marvelId: number;
  title: string;
  number: number;
  year: number;
  publishedAt?: string;
  slug?: string;
  digitalId?: number;
  drn?: string;
  cover?: string;
}

/** One issue's appearance inside an event. Per-event metadata lives here,
 *  identity fields come from the catalog via `ref`. Inline fields act as
 *  overrides — used for issues that predate the catalog (manual guides,
 *  custom runs without a marvelId) or when an event wants to present a
 *  non-canonical title/cover for a specific appearance. */
export interface EventIssueRef {
  id: string;
  ref?: number;              // marvelId pointing into catalog
  role: Role;
  note?: string;
  // Inline overrides — only used when the catalog doesn't have the issue
  // or when overriding a catalog field per-appearance.
  title?: string;
  number?: number;
  year?: number;
  publishedAt?: string;
  slug?: string;
  digitalId?: number;
  drn?: string;
  cover?: string;
}

/** Normalised on-disk event — same shape as `Event` but with ref-based
 *  issues and no `issues: Issue[]`. */
export interface NormalisedEvent extends Omit<Event, 'issues'> {
  issues: EventIssueRef[];
}

export interface NormalisedEventsFile {
  generatedAt: string;
  catalog: Record<string, CatalogEntry>;
  events: NormalisedEvent[];
}

/** The raw shape `events.json` can take on disk — either flat (legacy) or
 *  normalised (new). `data.ts` accepts both. */
export type RawEventsFile =
  | EventsFile
  | NormalisedEventsFile;
