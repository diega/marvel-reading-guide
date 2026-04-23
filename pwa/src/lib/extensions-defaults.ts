/**
 * Default implementations for every extension slot — what the PWA uses when
 * no overlay module is present at `/extensions/index.js`.
 *
 * The defaults make the app a fully functional anonymous reader:
 *  - Auth: always "anon", no login UI
 *  - Progress: local-only, IndexedDB-backed
 *  - Deeplink: opens marvel.com in a new tab
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, markIssueRead, markIssueUnread } from './db';
import type {
  AuthProvider,
  AuthState,
  DeeplinkResolver,
  IssueSyncState,
  ProgressAdapter,
} from './extensions';
import type { Issue } from './schema';

// ---------------------------------------------------------------------------
// Auth — anonymous
// ---------------------------------------------------------------------------

const ANON_STATE: AuthState = { status: 'anon' };

export const defaultAuth: AuthProvider = {
  useAuthState: () => ANON_STATE,
  requireSignIn: false,
};

// ---------------------------------------------------------------------------
// Progress — local-only via Dexie
// ---------------------------------------------------------------------------

// Empty sync map reused across renders — returning a new Map on every call
// would break `useMemo` deps and cause consumers to re-render forever.
const EMPTY_SYNC_MAP: ReadonlyMap<string, IssueSyncState> = new Map();

export const defaultProgress: ProgressAdapter = {
  useReadSet() {
    const rows = useLiveQuery(() => db.progress.toArray(), [], []);
    return useMemo(() => new Set((rows ?? []).map((r) => r.issueId)), [rows]);
  },
  markRead: (issueId) => markIssueRead(issueId),
  markUnread: (issueId) => markIssueUnread(issueId),
  // Local-only adapter has nothing to sync: empty map suppresses all cloud UI.
  useSyncStates: () => EMPTY_SYNC_MAP,
  pushSync: async () => {
    /* no-op: no remote to sync against */
  },
};

// ---------------------------------------------------------------------------
// Deeplink — marvel.com catalog page
// ---------------------------------------------------------------------------

export function webFallbackUrl(issue: Issue): string {
  if (issue.marvelId && issue.slug) {
    return `https://www.marvel.com/comics/issue/${issue.marvelId}/${issue.slug}`;
  }
  if (issue.digitalId) {
    return `https://read.marvel.com/#/book/${issue.digitalId}`;
  }
  const q = encodeURIComponent(`${issue.title} ${issue.number}`);
  return `https://www.marvel.com/search?q=${q}&limit=30&offset=0`;
}

export const defaultDeeplink: DeeplinkResolver = {
  webHref: (issue) => webFallbackUrl(issue),
  open: (issue) => {
    window.open(webFallbackUrl(issue), '_blank', 'noopener');
  },
};
