import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { getAllEvents } from '../lib/data';
import { sizedCover } from '../lib/deeplink';
import { useExtensions } from '../lib/extensions-context';
import { useLevel } from '../lib/level-context';
import { LEVELS, LEVEL_META, issuesAtLevel } from '../lib/levels';
import { useT } from '../lib/i18n';
import type { Category, Event, Issue } from '../lib/schema';

// Home only surfaces Teams + Characters — those are the narrative threads.
// Crossover events are accessible via Timeline (chronological catalog) and show up
// inline inside each team/character guide as grouped sections.
const CATEGORY_ORDER: Category[] = ['team', 'character'];

function groupByCategory(events: Event[]): Record<Category, Event[]> {
  const grouped: Record<Category, Event[]> = { crossover: [], character: [], team: [], run: [] };
  for (const ev of events) {
    const c = ev.category ?? 'crossover';
    grouped[c].push(ev);
  }
  return grouped;
}

export function Home() {
  const events = getAllEvents();
  const { level, setLevel } = useLevel();
  const { t } = useT();
  const { progress } = useExtensions();
  const readSet = progress.useReadSet();

  const grouped = groupByCategory(events);
  const crossoverCount = events.filter((e) => (e.category ?? 'crossover') === 'crossover').length;

  // For teams with a `teamEvents` mapping, the card's "issues" are the flattened issues
  // of all events in that mapping — not the team's own `issues` field (which is empty
  // when the team is a pure curator like Uncanny X-Men).
  const eventsById = useMemo(() => {
    const map = new Map<string, Event>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);

  const effectiveIssues = (ev: Event): Issue[] => {
    if (ev.teamEvents?.length) {
      return ev.teamEvents.flatMap((id) => eventsById.get(id)?.issues ?? []);
    }
    return ev.issues;
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <h1>{t('app.title')}</h1>
        </div>
      </header>

      <Link to="/atlas" className="all-events-link">
        {t('home.allEvents')} <span className="muted">({crossoverCount})</span> →
      </Link>

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

      {CATEGORY_ORDER.map((cat) => {
        const list = grouped[cat];
        if (list.length === 0) return null;
        return (
          <section key={cat} className="category-section">
            <h2 className="category-title">{t(`home.title.${cat}` as 'home.title.crossover')}</h2>
            <div className="events">
              {list.map((ev) => {
                const issues = issuesAtLevel(effectiveIssues(ev), level);
                const total = issues.length;
                const read = issues.filter((i) => readSet.has(i.id)).length;
                const pct = total ? Math.round((read / total) * 100) : 0;
                const cover = sizedCover(ev.cover, 400);
                return (
                  <Link key={ev.id} to={`/event/${ev.slug}`} className="event-card">
                    {cover && (
                      <div className="event-card-cover" style={{ backgroundImage: `url(${cover})` }}>
                        <div className="event-card-cover-scrim" />
                      </div>
                    )}
                    <div className="event-card-body">
                      <h3>{ev.name}</h3>
                      <div className="year">
                        {ev.year}{ev.endYear && ev.endYear !== ev.year ? `–${ev.endYear}` : ''} · {total} issues
                      </div>
                      <div className="summary">{ev.summary}</div>
                      <div className="progress">
                        <div className="progress-bar"><span style={{ width: `${pct}%` }} /></div>
                        <div className="progress-label">{t('event.read_pct', { read, total, pct })}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
