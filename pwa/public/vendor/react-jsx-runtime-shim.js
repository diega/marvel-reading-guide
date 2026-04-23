/**
 * React JSX runtime shim — mirrors react-shim.js but for the `react/jsx-runtime`
 * module that the automatic JSX transform imports.
 *
 * `main.tsx` stashes the imported jsx-runtime under
 * `globalThis.__MRG_REACT_JSX_RUNTIME__` before the overlay loads.
 */

const R = globalThis.__MRG_REACT_JSX_RUNTIME__;
if (!R) {
  throw new Error(
    'react-jsx-runtime-shim: globalThis.__MRG_REACT_JSX_RUNTIME__ is not set',
  );
}

export const Fragment = R.Fragment;
export const jsx = R.jsx;
export const jsxs = R.jsxs;
export const jsxDEV = R.jsxDEV;
