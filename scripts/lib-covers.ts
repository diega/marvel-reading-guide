/**
 * Shared helpers for event-level and team-level cover inference.
 *
 * An `Event` in our schema represents either a crossover, a creative-team run, a
 * character spine, or a team. Every one of them wants a visual identity (`cover`
 * URL) for the Home grid and detail hero. Individual issues hold cover URLs from
 * the enrichers; these helpers derive the event-level cover from them.
 */

import type { EventsFile } from '../pwa/src/lib/schema';

/**
 * Fills `event.cover` for any event that doesn't already have one, by picking the
 * first cover found among its issues (preferring `core` role). Idempotent and safe
 * to call multiple times.
 *
 * @returns number of events that received a cover in this call.
 */
export function deriveEventCovers(file: EventsFile): number {
  let set = 0;
  for (const ev of file.events) {
    if (ev.cover) continue;
    const pick =
      ev.issues.find((i) => i.role === 'core' && i.cover) ??
      ev.issues.find((i) => i.cover);
    if (pick?.cover) {
      ev.cover = pick.cover;
      set++;
    }
  }
  return set;
}

/**
 * Teams with a `teamEvents` mapping (e.g. Uncanny X-Men, X-Men Complete) have no
 * issues of their own — their visual identity cascades from the first mapped event
 * that has a cover. Run after `deriveEventCovers`.
 *
 * @returns number of teams that inherited a cover.
 */
export function deriveTeamCovers(file: EventsFile): number {
  const byId = new Map(file.events.map((e) => [e.id, e]));
  let set = 0;
  for (const ev of file.events) {
    if (ev.category !== 'team' || !ev.teamEvents?.length || ev.cover) continue;
    for (const id of ev.teamEvents) {
      const src = byId.get(id);
      if (src?.cover) {
        ev.cover = src.cover;
        set++;
        break;
      }
    }
  }
  return set;
}
