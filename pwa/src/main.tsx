import * as React from 'react';
import * as JSXRuntime from 'react/jsx-runtime';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ExtensionsProvider } from './lib/extensions-context';
import { loadExtensions } from './lib/extensions-loader';
import { I18nProvider } from './lib/i18n';
import { LevelProvider } from './lib/level-context';
import './styles.css';

/**
 * Stash the host's React instances on globalThis *before* the extension
 * loader runs. Overlay bundles import bare `react` / `react/jsx-runtime`; an
 * import map in index.html redirects those specifiers to shim files under
 * `/vendor/` which read off these globals. This keeps both sides on one
 * React instance (otherwise hooks throw "Invalid hook call").
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__MRG_REACT__ = React;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__MRG_REACT_JSX_RUNTIME__ = JSXRuntime;

/**
 * App bootstrap.
 *
 * The extension bundle is resolved before the first React render so
 * downstream components can assume a populated context on mount. The loader
 * returns defaults synchronously-ish (dynamic import roundtrip is <100ms on
 * most setups) so the overhead is imperceptible.
 */
async function boot() {
  const extensions = await loadExtensions();
  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <I18nProvider>
        <ExtensionsProvider value={extensions}>
          <BrowserRouter>
            <LevelProvider>
              <App />
            </LevelProvider>
          </BrowserRouter>
        </ExtensionsProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

boot();
