import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { getAllEvents } from '../lib/data';
import { sizedCover } from '../lib/deeplink';
import { useExtensions } from '../lib/extensions-context';
import { useT } from '../lib/i18n';
import { useLevel } from '../lib/level-context';
import { LEVELS, LEVEL_META, issuesAtLevel } from '../lib/levels';
import type { Event } from '../lib/schema';

/**
 * Team detail — a curated list of crossover events that belong to this team, in chrono order.
 * Teams opt in via `teamEvents: string[]` in the event JSON. Teams without that field fall
 * back to rendering the issue list (handled by EventDetail directly — this component is
 * only invoked for teams with `teamEvents`).
 */
export function GuideDetail({ ev }: { ev: Event }) {
  const { t } = useT();
  const { level, setLevel } = useLevel();
  const { progress } = useExtensions();

  const events = useMemo(() => {
    if (!ev.teamEvents || ev.teamEvents.length === 0) return [];
    const all = getAllEvents();
    const byId = new Map(all.map((e) => [e.id, e]));
    return ev.teamEvents
      .map((id) => byId.get(id))
      .filter((e): e is Event => !!e)
      .sort((a, b) => a.year - b.year);
  }, [ev]);

  const readSet = progress.useReadSet();

  // Derive year range and coverage from the mapped events, filtered by level.
  const yearRange = useMemo(() => {
    if (events.length === 0) return { start: ev.year, end: ev.endYear ?? ev.year };
    const starts = events.map((e) => e.year);
    const ends = events.map((e) => e.endYear ?? e.year);
    return { start: Math.min(...starts), end: Math.max(...ends) };
  }, [events, ev]);

  const totalIssues = events.reduce((s, e) => s + issuesAtLevel(e.issues, level).length, 0);
  const readCount = events.reduce(
    (s, e) => s + issuesAtLevel(e.issues, level).filter((i) => readSet.has(i.id)).length,
    0,
  );
  const pct = totalIssues ? Math.round((readCount / totalIssues) * 100) : 0;

  return (
    <div className="app">
      {ev.cover ? (
        <div
          className="event-hero"
          style={{ backgroundImage: `url(${sizedCover(ev.cover, 800)})` }}
        >
          <div className="event-hero-scrim" />
          <Link to="/" className="event-hero-back" aria-label="volver">←</Link>
          <div className="event-hero-body">
            <h1>{ev.name}</h1>
            <div className="year">
              {yearRange.start}{yearRange.end !== yearRange.start ? `–${yearRange.end}` : ''} · {events.length} {events.length === 1 ? t('chapter.eventSingular') : t('chapter.eventPlural')}
            </div>
          </div>
        </div>
      ) : (
        <header className="topbar">
          <div className="brand">
            <Link to="/" className="btn link" style={{ padding: 0 }} aria-label="volver">←</Link>
            <h1>{ev.name}</h1>
          </div>
        </header>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <p style={{ marginTop: 0 }}>{ev.summary}</p>
        <div className="progress">
          <div className="progress-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="progress-label">{t('event.read_pct', { read: readCount, total: totalIssues, pct })}</div>
        </div>
      </div>

      <div className="level-picker" role="tablist" aria-label={t('level.picker.aria')}>
        {LEVELS.map((lv) => {
          const meta = LEVEL_META[lv];
          const active = lv === level;
          return (
            <button
              key={lv}
              role="tab"
              aria-selected={active}
              className={`level-chip${active ? ' active' : ''}`}
              onClick={() => setLevel(lv)}
            >
              <span className="level-glyph">{meta.glyph}</span>
              <span className="level-name">{t(`level.${lv}.name` as 'level.alpha.name')}</span>
            </button>
          );
        })}
      </div>
      <p className="level-desc">{t(`level.${level}.desc` as 'level.alpha.desc')}</p>

      <div className="events">
        {events.map((e) => {
          const levelIssues = issuesAtLevel(e.issues, level);
          const total = levelIssues.length;
          const read = levelIssues.filter((i) => readSet.has(i.id)).length;
          const ePct = total ? Math.round((read / total) * 100) : 0;
          const cover = sizedCover(e.cover, 400);
          return (
            <Link key={e.id} to={`/event/${e.slug}`} className="event-card">
              {cover && (
                <div className="event-card-cover" style={{ backgroundImage: `url(${cover})` }}>
                  <div className="event-card-cover-scrim" />
                </div>
              )}
              <div className="event-card-body">
                <h3>{e.name}</h3>
                <div className="year">
                  {e.year}{e.endYear && e.endYear !== e.year ? `–${e.endYear}` : ''} · {total} issues
                </div>
                <div className="summary">{e.summary}</div>
                <div className="progress">
                  <div className="progress-bar"><span style={{ width: `${ePct}%` }} /></div>
                  <div className="progress-label">{t('event.read_pct', { read, total, pct: ePct })}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
