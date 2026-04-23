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

export function App() {
  const { auth } = useExtensions();
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

  // If the auth extension demands sign-in and the user is signed out, the
  // extension is expected to provide its own screen. Otherwise the app is
  // always navigable (anon or signed-in).
  if (state.status === 'signed-out' && auth.requireSignIn && auth.LoginScreen) {
    const LoginScreen = auth.LoginScreen;
    return <LoginScreen />;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/event/:slug" element={<EventDetail />} />
        {/* /timeline kept as an alias → Atlas subsumes the chronological view */}
        <Route path="/timeline" element={<Navigate to="/atlas" replace />} />
        <Route path="/atlas" element={<Atlas />} />
        <Route path="/me" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}
