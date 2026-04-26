import { useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { getAllEvents } from '../lib/data';
import { useT } from '../lib/i18n';
import type { Event } from '../lib/schema';

/**
 * Events × Teams transit-map.
 *
 * Model:
 *  - Each column is a team (X-Force, X-Men Complete, New Mutants, West Coast Avengers, ...).
 *  - Each row is a crossover event (chronological).
 *  - A dot at (team, event) means: this team's reading order includes at least one issue
 *    that also appears in that event (matched by DRN).
 *  - An "interchange" = a row where MULTIPLE team columns have dots. That's a real crossover —
 *    multiple team lines meet at the same station.
 *  - Big gaps between events collapse into "⋯" rows with the year span.
 */

const TEAM_COLORS = [
  '#ed1d24', // x-men — primary red
  '#7c9cff', // x-force — blue
  '#31c48d', // new mutants — green
  '#ff8a00', // wca — orange
  '#e64a82', // pink
  '#6fb8ff', // light blue
];

type Row =
  | { kind: 'event'; event: Event }
  | { kind: 'gap'; fromYear: number; toYear: number };

export function Atlas() {
  const { t } = useT();
  const all = useMemo(() => getAllEvents(), []);
  // Only teams that have a curated teamEvents mapping — others (like WCA) aren't meaningful
  // on an X-Men event transit map since they share no crossovers.
  const teams = useMemo(
    () => all.filter((e) => e.category === 'team' && (e.teamEvents?.length ?? 0) > 0),
    [all],
  );
  const events = useMemo(
    () => all.filter((e) => (e.category ?? 'crossover') === 'crossover').sort((a, b) => a.year - b.year),
    [all],
  );

  const [enabledTeams, setEnabledTeams] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(teams.map((t) => [t.id, true])),
  );
  const [focusedTeamId, setFocusedTeamId] = useState<string | null>(null);

  const colorOf = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((team, i) => { map[team.id] = TEAM_COLORS[i % TEAM_COLORS.length]; });
    return map;
  }, [teams]);

  // For each event: which enabled teams declare it in their teamEvents mapping?
  // This uses curated data (no fuzzy DRN matching) so the picture is deterministic.
  const eventTeamsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ev of events) {
      const hits: string[] = [];
      for (const team of teams) {
        if (!enabledTeams[team.id]) continue;
        if (team.teamEvents?.includes(ev.id)) hits.push(team.id);
      }
      map.set(ev.id, hits);
    }
    return map;
  }, [events, teams, enabledTeams]);

  // Filter events to only those with at least one team match
  const visibleEvents = useMemo(
    () => events.filter((ev) => (eventTeamsMap.get(ev.id) ?? []).length > 0),
    [events, eventTeamsMap],
  );

  // Compress year gaps between events
  const rows: Row[] = useMemo(() => {
    if (visibleEvents.length === 0) return [];
    const out: Row[] = [];
    let lastYear = visibleEvents[0].year - 1;
    for (const ev of visibleEvents) {
      const gap = ev.year - lastYear;
      if (gap > 3) out.push({ kind: 'gap', fromYear: lastYear + 1, toYear: ev.year - 1 });
      out.push({ kind: 'event', event: ev });
      lastYear = ev.endYear ?? ev.year;
    }
    return out;
  }, [visibleEvents]);

  // Layout
  const HEADER_H = 88;
  const ROW_H = 46;
  const GAP_H = 30;
  const LABEL_W = 24;       // left gutter (year marks) — tight
  const COL_W = 48;
  const EVENT_NAME_W = 260; // room on the right for event titles (fits "A.X.E.: Judgment Day")
  const svgWidth = LABEL_W + teams.length * COL_W + 10 + EVENT_NAME_W;
  const svgHeight = HEADER_H + rows.reduce((h, r) => h + (r.kind === 'gap' ? GAP_H : ROW_H), 0) + 12;

  const rowY: number[] = [];
  let yCursor = HEADER_H;
  for (const r of rows) {
    rowY.push(yCursor);
    yCursor += r.kind === 'gap' ? GAP_H : ROW_H;
  }

  const xForTeam = (teamIdx: number) => LABEL_W + teamIdx * COL_W + COL_W / 2;
  const isDimmed = (teamId: string) => focusedTeamId !== null && focusedTeamId !== teamId;

  // Track bounds per team: first and last event row where it appears
  const trackBounds = teams.map((team) => {
    if (!enabledTeams[team.id]) return { first: -1, last: -1 };
    let first = -1, last = -1;
    rows.forEach((r, i) => {
      if (r.kind !== 'event') return;
      const hits = eventTeamsMap.get(r.event.id) ?? [];
      if (hits.includes(team.id)) {
        if (first === -1) first = i;
        last = i;
      }
    });
    return { first, last };
  });

  return (
    <div className="app atlas-page">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <h1>{t('atlas.title')}</h1>
        </div>
      </header>

      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
        {t('atlas.blurb')}
      </p>

      <div className="atlas-filters">
        {teams.map((team) => (
          <label key={team.id} className="atlas-filter" style={{ '--team-color': colorOf[team.id] } as React.CSSProperties}>
            <input
              type="checkbox"
              checked={enabledTeams[team.id]}
              onChange={(e) => setEnabledTeams({ ...enabledTeams, [team.id]: e.target.checked })}
            />
            <span className="team-swatch" style={{ background: colorOf[team.id] }} />
            {team.name}
          </label>
        ))}
      </div>

      <div className="atlas-vscroll">
        <svg width={svgWidth} height={svgHeight} className="atlas-svg">
          {/* Row backgrounds (event labels + gap markers) */}
          {rows.map((r, i) => {
            const y = rowY[i];
            if (r.kind === 'gap') {
              return (
                <g key={`gap-${i}`}>
                  <text
                    x={svgWidth / 2} y={y + GAP_H / 2 + 5}
                    textAnchor="middle" fontSize={14} fill="var(--fg-muted)" letterSpacing="4"
                  >⋯</text>
                  <text
                    x={svgWidth - 10} y={y + GAP_H / 2 + 4}
                    textAnchor="end" fontSize={10} fill="var(--fg-muted)"
                    fontFamily="SF Mono, Menlo, monospace"
                  >{r.toYear - r.fromYear + 1}y</text>
                </g>
              );
            }
            const ev = r.event;
            return (
              <g key={`ev-${ev.id}`}>
                <rect
                  x={0} y={y} width={svgWidth} height={ROW_H}
                  fill={i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
                />
                <text
                  x={LABEL_W - 4} y={y + ROW_H / 2 + 3}
                  textAnchor="end" fontSize={9} fill="var(--fg-muted)"
                  fontFamily="SF Mono, Menlo, monospace"
                >{ev.year}</text>
                <Link to={`/event/${ev.slug}`}>
                  <text
                    x={LABEL_W + teams.length * COL_W + 10} y={y + ROW_H / 2 + 4}
                    textAnchor="start" fontSize={12} fill="var(--fg)" fontWeight={600}
                    style={{ cursor: 'pointer' }}
                  >{ev.name}</text>
                </Link>
              </g>
            );
          })}

          {/* Team column lines (background tracks) */}
          {teams.map((team, colIdx) => {
            if (!enabledTeams[team.id]) return null;
            const { first, last } = trackBounds[colIdx];
            if (first < 0) return null;
            const x = xForTeam(colIdx);
            const y1 = rowY[first] + ROW_H / 2;
            const lastRow = rows[last];
            const y2 = rowY[last] + (lastRow.kind === 'gap' ? GAP_H : ROW_H) / 2;
            return (
              <line
                key={`track-${team.id}`}
                x1={x} x2={x} y1={y1} y2={y2}
                stroke={colorOf[team.id]} strokeWidth={3} strokeLinecap="round"
                opacity={isDimmed(team.id) ? 0.12 : 0.9}
              />
            );
          })}

          {/* Stations: one dot per (team, event) hit */}
          {rows.flatMap((r, rowIdx) => {
            if (r.kind !== 'event') return [];
            const hits = eventTeamsMap.get(r.event.id) ?? [];
            if (hits.length === 0) return [];
            const y = rowY[rowIdx] + ROW_H / 2;
            // Connector between leftmost and rightmost team that's in this event (interchange)
            const hitCols = hits.map((tid) => teams.findIndex((t) => t.id === tid)).filter((c) => c >= 0).sort((a, b) => a - b);
            const nodes: JSX.Element[] = [];
            if (hitCols.length > 1) {
              nodes.push(
                <line
                  key={`ix-${r.event.id}`}
                  x1={xForTeam(hitCols[0])} x2={xForTeam(hitCols[hitCols.length - 1])}
                  y1={y} y2={y}
                  stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} strokeDasharray="3,3"
                />,
              );
            }
            for (const teamId of hits) {
              const colIdx = teams.findIndex((t) => t.id === teamId);
              if (colIdx < 0) continue;
              const isIx = hitCols.length > 1;
              nodes.push(
                <circle
                  key={`st-${r.event.id}-${teamId}`}
                  cx={xForTeam(colIdx)} cy={y}
                  r={isIx ? 7 : 5}
                  fill={isIx ? 'var(--bg)' : colorOf[teamId]}
                  stroke={colorOf[teamId]}
                  strokeWidth={isIx ? 2.5 : 0}
                  opacity={isDimmed(teamId) ? 0.15 : 1}
                />,
              );
            }
            return nodes;
          })}

          {/* Column headers (rotated team names) */}
          {teams.map((team, colIdx) => {
            if (!enabledTeams[team.id]) return null;
            const x = xForTeam(colIdx);
            const color = colorOf[team.id];
            return (
              <g key={`h-${team.id}`} transform={`translate(${x}, ${HEADER_H - 10}) rotate(-50)`}>
                <text
                  fill={color} fontSize={11} fontWeight={600}
                  textAnchor="start" alignmentBaseline="middle"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFocusedTeamId(focusedTeamId === team.id ? null : team.id)}
                  opacity={isDimmed(team.id) ? 0.4 : 1}
                >
                  {team.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {focusedTeamId && (
        <div className="atlas-focus-card">
          {(() => {
            const team = teams.find((x) => x.id === focusedTeamId)!;
            const hitCount = events.filter((ev) => (eventTeamsMap.get(ev.id) ?? []).includes(team.id)).length;
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="atlas-dot" style={{ background: colorOf[team.id] }} />
                  <strong>{team.name}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>· {hitCount} {t('atlas.events')}</span>
                </div>
                <p className="muted" style={{ margin: '6px 0 8px' }}>{team.summary}</p>
                <Link to={`/event/${team.slug}`} className="btn small primary">{t('atlas.open')}</Link>
                <button className="btn link" onClick={() => setFocusedTeamId(null)} style={{ marginLeft: 6 }}>
                  {t('atlas.clearFocus')}
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
