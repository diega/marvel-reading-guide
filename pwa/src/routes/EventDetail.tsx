import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { getEventBySlug } from '../lib/data';
import { sizedCover } from '../lib/deeplink';
import { useExtensions } from '../lib/extensions-context';
import { useLevel } from '../lib/level-context';
import { LEVELS, LEVEL_META, countsByLevel, issuesAtLevel } from '../lib/levels';
import { useT } from '../lib/i18n';
import { crossRefsFor } from '../lib/crossref';
import { GuideDetail } from './GuideDetail';
import type { IssueSyncState } from '../lib/extensions';
import type { Role } from '../lib/schema';

export function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const ev = slug ? getEventBySlug(slug) : undefined;
  const { level, setLevel } = useLevel();
  const { t } = useT();
  const { progress, deeplink } = useExtensions();

  // Teams with a `teamEvents` mapping render as a chronological list of event cards.
  // Characters, small teams, and raw events all render the issue list below.
  if (ev?.teamEvents && ev.teamEvents.length > 0) {
    return <GuideDetail ev={ev} />;
  }

  const ROLE_LABEL: Record<Role, string> = {
    core: t('role.core'),
    'tie-in-required': t('role.tie-in-required'),
    'tie-in-optional': t('role.tie-in-optional'),
    context: t('role.context'),
  };

  const readSet = progress.useReadSet();
  const syncStates = progress.useSyncStates();

  const counts = useMemo(() => (ev ? countsByLevel(ev.issues) : { alpha: 0, epsilon: 0, omega: 0 }), [ev]);
  const visible = useMemo(() => (ev ? issuesAtLevel(ev.issues, level) : []), [ev, level]);


  if (!ev) {
    return (
      <div className="app">
        <p className="muted">{t('event.notfound')} <Link to="/">{t('event.back')}</Link></p>
      </div>
    );
  }

  const total = visible.length;
  const read = visible.filter((i) => readSet.has(i.id)).length;
  const pct = total ? Math.round((read / total) * 100) : 0;

  const toggle = (issueId: string) => {
    if (readSet.has(issueId)) progress.markUnread(issueId);
    else progress.markRead(issueId);
  };

  return (
    <div className="app">
      {ev.cover && (
        <div
          className="event-hero"
          style={{ backgroundImage: `url(${sizedCover(ev.cover, 800)})` }}
        >
          <div className="event-hero-scrim" />
          <Link to="/" className="event-hero-back" aria-label="volver">←</Link>
          <div className="event-hero-body">
            <h1>{ev.name}</h1>
            <div className="year">
              {ev.year}{ev.endYear && ev.endYear !== ev.year ? `–${ev.endYear}` : ''} · {ev.issues.length} {t('event.issues')}
            </div>
          </div>
        </div>
      )}
      {!ev.cover && (
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
          <div className="progress-label">{t('event.read_pct', { read, total, pct })}</div>
        </div>
        <div className="sources">
          <span className="sources-label">{t('event.sources')}</span>
          {(ev.sources ?? [{ label: t('event.source'), url: ev.sourceUrl }]).map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="btn link source-link">
              {s.label} ↗
            </a>
          ))}
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
              <span className="level-count">{counts[lv]}</span>
            </button>
          );
        })}
      </div>
      <p className="level-desc">{t(`level.${level}.desc` as 'level.alpha.desc')}</p>

      <ul className="issues">
        {visible.map((issue) => {
              const isRead = readSet.has(issue.id);
              const href = deeplink.webHref(issue);
              const thumb = sizedCover(issue.cover, 200);
              const refs = crossRefsFor(issue, ev.id);
              const syncState = syncStates.get(issue.id);
              return (
                <li key={issue.id} className={`issue${isRead ? ' read' : ''}`}>
                  <div
                    className={`chk${isRead ? ' checked' : ''}`}
                    onClick={() => toggle(issue.id)}
                    role="checkbox"
                    aria-checked={isRead}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(issue.id); }
                    }}
                  />
                  {thumb ? (
                    <img className="issue-thumb" src={thumb} alt="" loading="lazy" />
                  ) : (
                    <div className="issue-thumb placeholder" aria-hidden />
                  )}
                  <div className="meta">
                    <div className="title">{issue.title} #{issue.number}</div>
                    <div className="sub">
                      <span className={`role ${issue.role}`}>{ROLE_LABEL[issue.role]}</span>{' '}
                      <span>{issue.year}</span>
                    </div>
                    {issue.note && <div className="note">{issue.note}</div>}
                    {refs.length > 0 && (
                      <div className="xrefs">
                        {refs.slice(0, 4).map((r) => (
                          <Link key={r.eventId} to={`/event/${r.eventSlug}`} className="xref-chip">
                            {r.eventName}
                          </Link>
                        ))}
                        {refs.length > 4 && <span className="xref-more">+{refs.length - 4}</span>}
                      </div>
                    )}
                  </div>
                  <div className="issue-actions">
                    {syncState && (
                      <SyncButton
                        state={syncState}
                        onClick={() => progress.pushSync(issue)}
                      />
                    )}
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        deeplink.open(issue);
                      }}
                      className="btn small primary"
                    >
                      {t('issue.read')}
                    </a>
                  </div>
                </li>
              );
            })}
      </ul>
    </div>
  );
}

/**
 * Per-issue cloud button. Visible only when the progress adapter reports a
 * sync state for this issue (i.e. remote sync is possible). The action is
 * always user-initiated — never a bulk push.
 */
function SyncButton({
  state,
  onClick,
}: {
  state: IssueSyncState;
  onClick: () => Promise<void> | void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const effectiveState: IssueSyncState = busy ? 'syncing' : state;

  const label = SYNC_LABEL[effectiveState];
  const disabled = effectiveState === 'syncing' || effectiveState === 'synced';

  const handle = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      await onClick();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`sync-btn sync-${effectiveState}`}
      onClick={handle}
      disabled={disabled}
      aria-label={t(label)}
      title={t(label)}
    >
      <SyncIcon state={effectiveState} />
    </button>
  );
}

const SYNC_LABEL: Record<IssueSyncState, 'sync.synced' | 'sync.push' | 'sync.busy' | 'sync.retry'> = {
  synced: 'sync.synced',
  'not-synced': 'sync.push',
  syncing: 'sync.busy',
  failed: 'sync.retry',
};

function SyncIcon({ state }: { state: IssueSyncState }) {
  if (state === 'syncing') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="12 40" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (state === 'synced') {
    // Cloud with check
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1A4 4 0 0 0 7 18z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m9 13.5 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'failed') {
    // Cloud with "!"
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1A4 4 0 0 0 7 18z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 10.5v3m0 2v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  // not-synced → cloud with up arrow (call to action)
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1A4 4 0 0 0 7 18z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15V9m0 0-2.5 2.5M12 9l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
