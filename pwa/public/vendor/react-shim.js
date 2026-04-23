/**
 * React shim for runtime-loaded overlay bundles.
 *
 * The host's build bundles its own React; plugins loaded via
 * `/extensions/index.js` must reuse the *same* React instance or hooks break
 * (dual-React corruption).
 *
 * `main.tsx` stashes the host's React under `globalThis.__MRG_REACT__` before
 * mounting, and the index.html import map redirects bare `react` imports from
 * the overlay to this file.
 */

const R = globalThis.__MRG_REACT__;
if (!R) {
  throw new Error(
    'react-shim: globalThis.__MRG_REACT__ is not set — host did not expose React before loading the overlay',
  );
}

export default R;
export const Children = R.Children;
export const Component = R.Component;
export const Fragment = R.Fragment;
export const Profiler = R.Profiler;
export const PureComponent = R.PureComponent;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const cloneElement = R.cloneElement;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const createRef = R.createRef;
export const forwardRef = R.forwardRef;
export const isValidElement = R.isValidElement;
export const lazy = R.lazy;
export const memo = R.memo;
export const startTransition = R.startTransition;
export const useCallback = R.useCallback;
export const useContext = R.useContext;
export const useDebugValue = R.useDebugValue;
export const useDeferredValue = R.useDeferredValue;
export const useEffect = R.useEffect;
export const useId = R.useId;
export const useImperativeHandle = R.useImperativeHandle;
export const useInsertionEffect = R.useInsertionEffect;
export const useLayoutEffect = R.useLayoutEffect;
export const useMemo = R.useMemo;
export const useReducer = R.useReducer;
export const useRef = R.useRef;
export const useState = R.useState;
export const useSyncExternalStore = R.useSyncExternalStore;
export const useTransition = R.useTransition;
export const version = R.version;
