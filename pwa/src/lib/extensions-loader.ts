/**
 * Boot-time discovery of overlay extensions.
 *
 * Attempts a dynamic `import()` against `/extensions/index.js`. If the file is
 * served (HTTP 200), its exports merge on top of defaults. If the URL 404s or
 * the module throws, defaults are used as-is.
 *
 * The dynamic URL is absolute on purpose: Vite treats it as a runtime fetch
 * rather than a bundled import, so the production bundle never ships the
 * overlay module. The overlay is a separate, independently-deployed asset.
 */

import type { AppExtensions, ResolvedExtensions } from './extensions';
import { defaultAuth, defaultDeeplink, defaultProgress } from './extensions-defaults';

const OVERLAY_URL = '/extensions/index.js';

function merge(overrides: AppExtensions): ResolvedExtensions {
  return {
    auth: overrides.auth ?? defaultAuth,
    progress: overrides.progress ?? defaultProgress,
    deeplink: overrides.deeplink ?? defaultDeeplink,
    AccountExtras: overrides.AccountExtras ?? null,
  };
}

export async function loadExtensions(): Promise<ResolvedExtensions> {
  try {
    // `@vite-ignore` keeps Vite from attempting to resolve this at build time —
    // the request is made by the browser at runtime against whatever host the
    // PWA is deployed on.
    const mod: { extensions?: AppExtensions; default?: AppExtensions } = await import(
      /* @vite-ignore */ OVERLAY_URL
    );
    const overrides = mod.extensions ?? mod.default ?? {};
    return merge(overrides);
  } catch {
    return merge({});
  }
}
