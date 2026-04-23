/**
 * React context that carries the resolved extension bundle through the tree.
 *
 * `main.tsx` resolves the bundle at boot (see `extensions-loader.ts`) and
 * wraps `<App />` with `<ExtensionsProvider value={resolved}>`. Any component
 * that needs an extension slot calls `useExtensions()`.
 *
 * Splitting the hook by slot keeps type inference obvious at call sites and
 * avoids accidental coupling (e.g. a component that only cares about
 * `deeplink` doesn't re-render when auth state changes, because the host
 * value object is stable across renders).
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { ResolvedExtensions } from './extensions';

const Ctx = createContext<ResolvedExtensions | null>(null);

export function ExtensionsProvider({
  value,
  children,
}: {
  value: ResolvedExtensions;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExtensions(): ResolvedExtensions {
  const v = useContext(Ctx);
  if (!v) throw new Error('useExtensions outside ExtensionsProvider');
  return v;
}
