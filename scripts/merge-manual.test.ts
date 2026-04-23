import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventsFile } from '../pwa/src/lib/schema';
import { applyTeamEventsMappings } from './merge-manual.js';

// ---------------------------------------------------------------------------
// Unit coverage of the pure function
// ---------------------------------------------------------------------------

function fixture(): EventsFile {
  return {
    generatedAt: '2026-04-23T00:00:00.000Z',
    catalog: {},
    events: [
      { id: 'x-force', name: 'X-Force', slug: 'x-force', year: 1991,
        category: 'team', issues: [] },
      { id: 'house-of-m', name: 'House of M', slug: 'house-of-m', year: 2005,
        category: 'crossover', issues: [] },
      { id: 'axis', name: 'Avengers & X-Men: AXIS', slug: 'axis', year: 2014,
        category: 'crossover', issues: [] },
      { id: 'brubaker-uncanny-x-men', name: 'Ed Brubaker — Uncanny X-Men',
        slug: 'brubaker-uncanny-x-men', year: 2006, category: 'run', issues: [] },
    ],
  } as unknown as EventsFile;
}

describe('applyTeamEventsMappings', () => {
  it('writes teamEvents onto matching team entries', () => {
    const f = fixture();
    const result = applyTeamEventsMappings(f, {
      'x-force': ['house-of-m', 'axis'],
    });
    expect(result.applied).toBe(1);
    const xforce = f.events.find((e) => e.id === 'x-force')!;
    expect(xforce.teamEvents).toEqual(['house-of-m', 'axis']);
  });

  it('drops unknown event ids from a mapping but keeps valid ones', () => {
    const f = fixture();
    const result = applyTeamEventsMappings(f, {
      'x-force': ['house-of-m', 'does-not-exist', 'axis'],
    });
    expect(result.unknownEvents).toEqual(['x-force→does-not-exist']);
    const xforce = f.events.find((e) => e.id === 'x-force')!;
    expect(xforce.teamEvents).toEqual(['house-of-m', 'axis']);
  });

  it('skips unknown team ids and reports them', () => {
    const f = fixture();
    const result = applyTeamEventsMappings(f, {
      'ghost-team': ['house-of-m'],
    });
    expect(result.applied).toBe(0);
    expect(result.unknownTeams).toEqual(['ghost-team']);
  });

  it("refuses to write teamEvents onto a non-team entry (e.g. a 'run')", () => {
    const f = fixture();
    const result = applyTeamEventsMappings(f, {
      'brubaker-uncanny-x-men': ['house-of-m'], // category='run', should be rejected
    });
    expect(result.applied).toBe(0);
    const brubaker = f.events.find((e) => e.id === 'brubaker-uncanny-x-men')!;
    expect(brubaker.teamEvents).toBeUndefined();
  });

  it('overwrites (not appends) existing teamEvents on a re-apply', () => {
    const f = fixture();
    const xforce = f.events.find((e) => e.id === 'x-force')!;
    xforce.teamEvents = ['stale-from-previous-run'];
    applyTeamEventsMappings(f, { 'x-force': ['house-of-m'] });
    expect(xforce.teamEvents).toEqual(['house-of-m']);
  });
});

// ---------------------------------------------------------------------------
// Regression guard on the committed data
//
// The Atlas route filters teams by `teamEvents?.length > 0`, so if the
// pipeline ever drops the field from events.json (as happened in
// 5a67dc3 — scrape-cbh rewrote events.json from scratch and the
// enrichment-cache only snapshots issue-level fields), the Atlas
// renders as an empty card and every team silently disappears from it.
//
// These assertions load the actual committed files and verify that
// the curation in manual-guides.json is internally consistent with
// events.json, AND that applying the mappings actually produces the
// non-empty teamEvents the Atlas depends on.
// ---------------------------------------------------------------------------

describe('committed data integrity — manual-guides.json ⇄ events.json', () => {
  const manual = JSON.parse(
    readFileSync(new URL('./manual-guides.json', import.meta.url), 'utf8'),
  ) as {
    guides: unknown[];
    teamEventsMappings?: Record<string, string[]>;
  };
  const events = JSON.parse(
    readFileSync(new URL('../pwa/src/data/events.json', import.meta.url), 'utf8'),
  ) as EventsFile;

  it('has a teamEventsMappings block with at least one team', () => {
    expect(manual.teamEventsMappings).toBeTruthy();
    expect(Object.keys(manual.teamEventsMappings ?? {}).length).toBeGreaterThan(0);
  });

  it('every mapped team id exists in events.json with category=team', () => {
    const byId = new Map(events.events.map((e) => [e.id, e]));
    for (const teamId of Object.keys(manual.teamEventsMappings ?? {})) {
      const ev = byId.get(teamId);
      expect(ev, `team '${teamId}' missing from events.json`).toBeDefined();
      expect(
        ev!.category,
        `'${teamId}' must be category='team', got '${ev!.category}'`,
      ).toBe('team');
    }
  });

  it('every mapped event id exists in events.json', () => {
    const byId = new Map(events.events.map((e) => [e.id, e]));
    const missing: string[] = [];
    for (const [teamId, eventIds] of Object.entries(manual.teamEventsMappings ?? {})) {
      for (const eid of eventIds) {
        if (!byId.has(eid)) missing.push(`${teamId}→${eid}`);
      }
    }
    expect(missing, 'curated team→event references point at non-existent events').toEqual([]);
  });

  it('applying the committed mappings produces non-empty teamEvents for each mapped team', () => {
    // Deep-clone events.json so we don't mutate the cached module.
    const clone = JSON.parse(JSON.stringify(events)) as EventsFile;
    applyTeamEventsMappings(clone, manual.teamEventsMappings ?? {});
    for (const teamId of Object.keys(manual.teamEventsMappings ?? {})) {
      const team = clone.events.find((e) => e.id === teamId)!;
      expect(
        team.teamEvents?.length ?? 0,
        `team '${teamId}' ended up with empty teamEvents after merge — Atlas would hide it`,
      ).toBeGreaterThan(0);
    }
  });

  it('events.json AT REST has non-empty teamEvents for every mapped team', () => {
    // The previous test verifies the MERGE would be correct. This one
    // verifies the CURRENTLY-COMMITTED events.json already contains the
    // output of that merge. Without this, the broken state that caused
    // the original bug (commit 5a67dc3 — teamEvents wiped by scrape-cbh,
    // merge:manual never re-applied them because the mappings weren't
    // in manual-guides.json yet) would slip through the suite: the
    // merge-in-memory would succeed against the current clone, but the
    // on-disk file the PWA actually loads would still be empty.
    //
    // Fails the gate if the pipeline skips merge:manual, or if a
    // commit lands without the pipeline running, or if anything else
    // ships an events.json with a team in the mappings but no
    // corresponding teamEvents already populated.
    const byId = new Map(events.events.map((e) => [e.id, e]));
    for (const teamId of Object.keys(manual.teamEventsMappings ?? {})) {
      const team = byId.get(teamId)!;
      expect(
        team.teamEvents?.length ?? 0,
        `events.json has empty teamEvents on '${teamId}' — did the pipeline skip merge:manual? Atlas will render empty.`,
      ).toBeGreaterThan(0);
    }
  });
});
