/**
 * Extension contracts for the PWA.
 *
 * The core app ships with default implementations that make the PWA fully
 * functional as a standalone anonymous reader (no backend, no login, local-only
 * progress, web deeplinks). Downstream deployers can ship a runtime-loaded
 * module at `/extensions/index.js` that provides alternative implementations
 * — e.g. a backend-backed auth provider, a synced progress adapter, or a
 * native URL-scheme resolver.
 *
 * The loader (`extensions-loader.ts`) attempts a dynamic import at boot and
 * gracefully falls back to defaults when the module is absent.
 *
 * Contract stability: any breaking change to the interfaces below is a major
 * version bump. Add fields as optional; add methods as optional; default every
 * slot to a safe no-op.
 */

import type { ComponentType } from 'react';
import type { Issue } from './schema';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AuthState =
  | { status: 'anon' }
  | { status: 'loading' }
  | { status: 'signed-in'; displayName?: string }
  | { status: 'signed-out' };

/**
 * Authentication provider.
 *
 * The default implementation always returns `{ status: 'anon' }` and never
 * renders a login UI — the app is fully navigable without signing in.
 *
 * An override can implement a real auth flow:
 * - Return `{ status: 'signed-out' }` and set `requireSignIn: true` +
 *   `LoginScreen` to force a login wall.
 * - Return `{ status: 'signed-in' }` after authentication, optionally with a
 *   `displayName` for the account page.
 */
export interface AuthProvider {
  /** React hook reading the current auth state. Called from many components — must be stable. */
  useAuthState(): AuthState;
  /** Optional sign-out action. Wire into UI slots like `AccountExtras`. */
  signOut?(): Promise<void>;
  /** Component rendered in place of the app routes when state is `signed-out` AND `requireSignIn` is true. */
  LoginScreen?: ComponentType;
  /** Whether `signed-out` should gate access to the app. Default `false`. */
  requireSignIn?: boolean;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Per-issue remote sync status. Surfaced by `useSyncStates()` so the UI can
 * render a cloud icon per issue with feedback about whether the local state
 * has been pushed to the remote.
 *
 * - `synced`      local and remote agree — nothing to push
 * - `not-synced`  local differs from remote, user hasn't asked to push yet
 * - `syncing`     push in flight
 * - `failed`      last push attempt threw — button becomes a retry
 *
 * An adapter that doesn't do remote sync (like the default local-only one)
 * returns an empty map from `useSyncStates()` — the UI then doesn't render
 * any cloud affordance.
 */
export type IssueSyncState = 'synced' | 'not-synced' | 'syncing' | 'failed';

/**
 * Reading-progress adapter.
 *
 * The default implementation persists marks in the browser's IndexedDB via
 * Dexie. Data never leaves the device. An override can wrap the defaults to
 * add remote sync (e.g. writing through to a backend while still serving
 * reads from the local store).
 *
 * Remote sync in this contract is **opt-in per issue, never in bulk**: the UI
 * renders a cloud button per issue (when `useSyncStates()` has an entry for
 * it), and only a direct user tap triggers `pushSync(issue)`. This protects
 * users against mass mutations on an upstream API that might look like
 * scripted abuse.
 */
export interface ProgressAdapter {
  /** Live set of issue IDs marked as read. Must re-render on change. */
  useReadSet(): ReadonlySet<string>;
  /** Persist `issueId` as read (local only — does not push to any remote). */
  markRead(issueId: string): Promise<void>;
  /** Remove the local read mark for `issueId` (local only). */
  markUnread(issueId: string): Promise<void>;
  /**
   * Live map of `issueId → IssueSyncState` for adapters that sync with a
   * remote. Returning an empty map (the default) suppresses all cloud UI.
   *
   * Only include entries for issues that *could* be synced — e.g. skip
   * issues that lack the identifier the remote needs (no DRN ⇒ no entry).
   */
  useSyncStates(): ReadonlyMap<string, IssueSyncState>;
  /**
   * Push this one issue's local state to the remote. Called by a
   * user-initiated tap on the per-issue cloud button. Safe to call
   * concurrently for different issues. Throws on failure — the caller
   * moves the issue's sync state to `failed` and surfaces a retry
   * affordance. The default implementation is a no-op.
   */
  pushSync(issue: Issue): Promise<void>;
}

// ---------------------------------------------------------------------------
// Deeplink
// ---------------------------------------------------------------------------

/**
 * Issue deeplink resolver.
 *
 * Given an issue, produce either (a) an anchor `href` for the accessibility
 * tree / keyboard nav / right-click affordance, or (b) perform the actual
 * navigation action on tap.
 *
 * The default resolver opens `marvel.com/comics/issue/{id}/{slug}` in a new
 * tab — Marvel's own catalog page for that issue. An override can bypass the
 * web landing and jump straight to a native URL scheme.
 */
export interface DeeplinkResolver {
  webHref(issue: Issue): string;
  open(issue: Issue): void;
}

// ---------------------------------------------------------------------------
// App extensions bundle
// ---------------------------------------------------------------------------

/**
 * The shape of the module expected at `/extensions/index.js`.
 *
 * All fields optional — partial overrides merge on top of defaults. A missing
 * module (404 at the expected URL) resolves to the full default bundle.
 */
export interface AppExtensions {
  auth?: AuthProvider;
  progress?: ProgressAdapter;
  deeplink?: DeeplinkResolver;
  /** Component rendered inside the Account page to host overlay-specific UI
   *  (e.g. a "Sign out" button, account details). Null in the default bundle. */
  AccountExtras?: ComponentType;
}

/** Runtime value with all slots populated (defaults fill missing overrides). */
export type ResolvedExtensions = Required<{
  auth: AuthProvider;
  progress: ProgressAdapter;
  deeplink: DeeplinkResolver;
}> & {
  AccountExtras: ComponentType | null;
};
