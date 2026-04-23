import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useExtensions } from './lib/extensions-context';
import { useT } from './lib/i18n';
import { Home } from './routes/Home';
import { EventDetail } from './routes/EventDetail';
import { Atlas } from './routes/Atlas';
import { Account } from './routes/Account';

function BottomNav() {
  const { t } = useT();
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.events')}</NavLink>
      <NavLink to="/atlas" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.atlas')}</NavLink>
      <NavLink to="/me" className={({ isActive }) => (isActive ? 'active' : '')}>{t('nav.account')}</NavLink>
    </nav>
  );
}

/**
 * Login route. Only renders when the active auth provider ships a
 * `LoginScreen` component. Otherwise redirects home — there's no login flow
 * to present.
 */
function LoginRoute() {
  const { auth } = useExtensions();
  if (!auth.LoginScreen) return <Navigate to="/" replace />;
  const LoginScreen = auth.LoginScreen;
  return <LoginScreen />;
}

export function App() {
  const { auth, AppBanner } = useExtensions();
  const state = auth.useAuthState();
  const { t } = useT();

  if (state.status === 'loading') {
    return (
      <div className="center-screen">
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Hard-gating overlay: if the extension demands sign-in AND the user is
  // signed-out AND there's a LoginScreen available, render it in place of
  // routes. Overlays that don't set `requireSignIn: true` let the user
  // navigate the app anonymously, with the login flow reachable via
  // `/login` (typically triggered from Account).
  if (state.status === 'signed-out' && auth.requireSignIn && auth.LoginScreen) {
    const LoginScreen = auth.LoginScreen;
    return <LoginScreen />;
  }

  return (
    <>
      {AppBanner && <AppBanner />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/event/:slug" element={<EventDetail />} />
        {/* /timeline kept as an alias → Atlas subsumes the chronological view */}
        <Route path="/timeline" element={<Navigate to="/atlas" replace />} />
        <Route path="/atlas" element={<Atlas />} />
        <Route path="/me" element={<Account />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}
