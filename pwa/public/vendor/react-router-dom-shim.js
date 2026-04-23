/**
 * react-router-dom shim for runtime-loaded overlay bundles.
 *
 * Same rationale as `react-shim.js`: the overlay needs to share the host's
 * react-router-dom instance so `<Link>` + `useNavigate` + `<Navigate>`
 * resolve against the host's `<BrowserRouter>` context. A second copy
 * would have its own Router context and every router hook would throw
 * "useNavigate() may be used only in the context of a <Router> component".
 *
 * `main.tsx` stashes the imported module under
 * `globalThis.__MRG_REACT_ROUTER__` before the overlay loads, and the
 * import map in index.html redirects bare `react-router-dom` specifiers
 * to this file.
 */

const R = globalThis.__MRG_REACT_ROUTER__;
if (!R) {
  throw new Error(
    'react-router-dom-shim: globalThis.__MRG_REACT_ROUTER__ is not set — host did not expose react-router-dom before loading the overlay',
  );
}

export const BrowserRouter = R.BrowserRouter;
export const HashRouter = R.HashRouter;
export const MemoryRouter = R.MemoryRouter;
export const Route = R.Route;
export const Routes = R.Routes;
export const Link = R.Link;
export const NavLink = R.NavLink;
export const Navigate = R.Navigate;
export const Outlet = R.Outlet;
export const useLocation = R.useLocation;
export const useNavigate = R.useNavigate;
export const useNavigationType = R.useNavigationType;
export const useParams = R.useParams;
export const useMatch = R.useMatch;
export const useMatches = R.useMatches;
export const useRoutes = R.useRoutes;
export const useSearchParams = R.useSearchParams;
export const useResolvedPath = R.useResolvedPath;
export const useInRouterContext = R.useInRouterContext;
export const useBlocker = R.useBlocker;
export const createBrowserRouter = R.createBrowserRouter;
export const RouterProvider = R.RouterProvider;
export const matchPath = R.matchPath;
export const matchRoutes = R.matchRoutes;
export const generatePath = R.generatePath;
export default R;
