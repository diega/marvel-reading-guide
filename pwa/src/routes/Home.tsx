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

const MAX_CONTINUE_READING = 5;

function groupByCategory(events: Event[]): Record<Category, Event[]> {
  const grouped: Record<Category, Event[]> = { crossover: [], character: [], team: [], run: [] };
  for (const ev of events) {
    const c = ev.category ?? 'crossover';
    grouped[c].push(ev);
  }
  return grouped;
}

/**
 * One entry in the "Continue reading" row: a guide the user has started but
 * not finished, with the `next` issue surfaced so the tap-target flows
 * straight into the next unread.
 */
interface ContinueEntry {
  event: Event;
  issuesAtLevel: Issue[];
  read: number;
  total: number;
  next: Issue | undefined;
  /** Max readAt of this guide's read issues — for recency sort. */
  lastReadAt: number;
  /** Issue the user is mid-reading per the remote, if any (overlay-only). */
  inProgressIssue?: Issue;
  inProgressPct?: number;
}

export function Home() {
  const events = getAllEvents();
  const { level, setLevel } = useLevel();
  const { t } = useT();
  const { progress } = useExtensions();
  const readSet = progress.useReadSet();
  const inProgress = progress.useInProgress();

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

  // --- Continue reading ----------------------------------------------------

  // A "guide in progress" is one where the user has marked 1+ issues at the
  // current level but not yet all of them. Sorted by recency (max readAt
  // among the guide's read issues), capped at MAX_CONTINUE_READING.
  //
  // Mid-issue position from the overlay (`useInProgress`) is treated as a
  // soft signal that bumps a guide into the row even if no issues were
  // marked locally, but doesn't change the primary read/total ratio shown.
  const continueReading: ContinueEntry[] = useMemo(() => {
    const entries: ContinueEntry[] = [];
    for (const ev of events) {
      const issues = issuesAtLevel(effectiveIssues(ev), level);
      if (issues.length === 0) continue;

      const readIssues = issues.filter((i) => readSet.has(i.id));
      const hasMidIssue = issues.some((i) => inProgress.has(i.id));
      // Only surface in-progress guides — not completed, not untouched.
      if (readIssues.length === 0 && !hasMidIssue) continue;
      if (readIssues.length === issues.length) continue;

      const next = issues.find((i) => !readSet.has(i.id));
      const lastReadAt = readIssues.reduce(
        (max, i) => Math.max(max, readSet.get(i.id) ?? 0),
        0,
      );

      // Pick the first mid-issue in list order — usually matches where the
      // user is actually reading, and gives a deterministic tie-break.
      const midIssue = issues.find((i) => inProgress.has(i.id));
      const midPos = midIssue ? inProgress.get(midIssue.id) : undefined;
      const inProgressPct =
        midPos && midPos.total > 0
          ? Math.max(0, Math.min(100, Math.round((midPos.position / midPos.total) * 100)))
          : undefined;

      entries.push({
        event: ev,
        issuesAtLevel: issues,
        read: readIssues.length,
        total: issues.length,
        next,
        lastReadAt,
        inProgressIssue: midIssue,
        inProgressPct,
      });
    }
    // Most-recent first, ties broken by more-progress first (nice-to-have).
    entries.sort((a, b) => {
      if (b.lastReadAt !== a.lastReadAt) return b.lastReadAt - a.lastReadAt;
      return b.read / b.total - a.read / a.total;
    });
    return entries.slice(0, MAX_CONTINUE_READING);
  }, [events, level, readSet, inProgress, eventsById]);

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

      {continueReading.length > 0 && (
        <section className="continue-reading">
          <h2 className="category-title">{t('home.continueReading')}</h2>
          <div className="continue-row">
            {continueReading.map((entry) => {
              const cover = sizedCover(entry.event.cover, 300);
              const pct = Math.round((entry.read / entry.total) * 100);
              return (
                <Link
                  key={entry.event.id}
                  to={`/event/${entry.event.slug}`}
                  className="continue-card"
                >
                  {cover ? (
                    <div
                      className="continue-card-cover"
                      style={{ backgroundImage: `url(${cover})` }}
                    >
                      <div className="continue-card-cover-scrim" />
                      {entry.inProgressIssue && (
                        <span
                          className="continue-reading-badge"
                          title={t('home.continueReading.midIssue')}
                        >
                          📖
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="continue-card-cover placeholder" aria-hidden />
                  )}
                  <div className="continue-card-body">
                    <h3 className="continue-card-title">{entry.event.name}</h3>
                    <div className="continue-card-progress">
                      <div className="progress-bar">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <div className="progress-label">
                        {t('event.read_pct', { read: entry.read, total: entry.total, pct })}
                      </div>
                    </div>
                    {entry.next && (
                      <div className="continue-card-next">
                        <span className="muted">{t('home.continueReading.next')} </span>
                        {entry.next.title} #{entry.next.number}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

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
