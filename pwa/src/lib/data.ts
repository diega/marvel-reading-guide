import type {
  CatalogEntry,
  Event,
  EventIssueRef,
  EventsFile,
  Issue,
  NormalisedEventsFile,
  RawEventsFile,
} from './schema';
import eventsJson from '../data/events.json';

/**
 * Detect whether the on-disk file is in the normalised shape (top-level
 * `catalog` map + per-event refs) or the legacy flat shape (every issue
 * inline under each event). Purely a structural check — no need to
 * version the file.
 */
function isNormalised(raw: RawEventsFile): raw is NormalisedEventsFile {
  const asNorm = raw as NormalisedEventsFile;
  return typeof asNorm.catalog === 'object' && asNorm.catalog != null;
}

/**
 * Merge a catalog entry with a per-event ref into a hydrated Issue.
 * Inline fields on the ref win over catalog values — used for issues
 * that don't have a catalog entry (no marvelId, manual guides) or when
 * an event intentionally overrides a catalog field per-appearance.
 */
function hydrateRef(ref: EventIssueRef, catalog: Record<string, CatalogEntry>): Issue {
  const cat: Partial<CatalogEntry> =
    ref.ref != null ? (catalog[String(ref.ref)] ?? {}) : {};

  return {
    id: ref.id,
    role: ref.role,
    note: ref.note,
    marvelId: cat.marvelId ?? ref.ref,
    title: ref.title ?? cat.title ?? '',
    number: ref.number ?? cat.number ?? 0,
    year: ref.year ?? cat.year ?? 0,
    publishedAt: ref.publishedAt ?? cat.publishedAt,
    slug: ref.slug ?? cat.slug,
    digitalId: ref.digitalId ?? cat.digitalId,
    drn: ref.drn ?? cat.drn,
    cover: ref.cover ?? cat.cover,
  };
}

function hydrate(raw: RawEventsFile): EventsFile {
  if (!isNormalised(raw)) return raw; // legacy shape — already hydrated

  const events: Event[] = raw.events.map((ev) => ({
    ...ev,
    issues: ev.issues.map((r) => hydrateRef(r, raw.catalog)),
  }));
  return { generatedAt: raw.generatedAt, events };
}

const file: EventsFile = hydrate(eventsJson as unknown as RawEventsFile);

export function getAllEvents(): Event[] {
  return [...file.events].sort((a, b) => a.year - b.year);
}

export function getEventBySlug(slug: string): Event | undefined {
  return file.events.find((e) => e.slug === slug);
}

export function getEventById(id: string): Event | undefined {
  return file.events.find((e) => e.id === id);
}

export function getEventsByIds(ids: string[]): Event[] {
  const set = new Set(ids);
  return file.events.filter((e) => set.has(e.id));
}
