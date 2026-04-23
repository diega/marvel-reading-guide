/**
 * Boot-time discovery of overlay extensions.
 *
 * Attempts a dynamic `import()` against `/extensions/index.js`. If the file
 * is served (HTTP 200), its exports merge on top of defaults. If the URL
 * 404s or the module throws, defaults are used as-is.
 *
 * The dynamic URL is absolute on purpose: Vite treats it as a runtime fetch
 * rather than a bundled import, so the production bundle never ships the
 * overlay module. The overlay is a separate, independently-deployed asset.
 *
 * Two overlay shapes are supported:
 *
 *   // (a) static: overlay exports a fully-built AppExtensions
 *   export const extensions: AppExtensions = { auth, progress, ... };
 *   export default extensions;
 *
 *   // (b) factory: overlay exports a function that builds AppExtensions
 *   //     from a host-provided context, which at minimum includes the
 *   //     flattened issue dataset — useful for overlays that need to
 *   //     build identifier indexes (DRN → issueId, etc.) at boot.
 *   export function createExtensions(ctx: ExtensionsHostContext): AppExtensions;
 *
 * The factory shape is preferred when the overlay needs the dataset;
 * the static shape is fine for overlays that don't.
 */

import { getAllEvents } from './data';
import type { AppExtensions, ExtensionsHostContext, ResolvedExtensions } from './extensions';
import { defaultAuth, defaultDeeplink, defaultProgress } from './extensions-defaults';

const OVERLAY_URL = '/extensions/index.js';

function merge(overrides: AppExtensions): ResolvedExtensions {
  return {
    auth: overrides.auth ?? defaultAuth,
    progress: overrides.progress ?? defaultProgress,
    deeplink: overrides.deeplink ?? defaultDeeplink,
    AccountExtras: overrides.AccountExtras ?? null,
    AppBanner: overrides.AppBanner ?? null,
  };
}

function buildHostContext(): ExtensionsHostContext {
  const allIssues = getAllEvents().flatMap((e) => e.issues);
  return { issues: allIssues };
}

type OverlayModule = {
  extensions?: AppExtensions;
  default?: AppExtensions;
  createExtensions?: (ctx: ExtensionsHostContext) => AppExtensions;
};

export async function loadExtensions(): Promise<ResolvedExtensions> {
  try {
    // `@vite-ignore` keeps Vite from attempting to resolve this at build time
    // — the request is made by the browser at runtime against whatever host
    // the PWA is deployed on.
    const mod: OverlayModule = await import(/* @vite-ignore */ OVERLAY_URL);
    if (typeof mod.createExtensions === 'function') {
      return merge(mod.createExtensions(buildHostContext()));
    }
    return merge(mod.extensions ?? mod.default ?? {});
  } catch {
    return merge({});
  }
}
