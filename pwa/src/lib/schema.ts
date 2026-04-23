export type Role = 'core' | 'tie-in-required' | 'tie-in-optional' | 'context';

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
