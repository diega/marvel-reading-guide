import { Link } from 'react-router-dom';
import { useExtensions } from '../lib/extensions-context';
import { useT, type Lang } from '../lib/i18n';

const LANGS: { code: Lang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];

/**
 * Generic sign-in CTA. Rendered automatically by the host whenever the active
 * auth provider ships a `LoginScreen` AND the current state is `signed-out`.
 * Copy lives here (in the host's i18n dict) so overlay-specific branding
 * never leaks into public-visible surfaces — a curious visitor sees a plain
 * "Sign in" button and only discovers what they're signing in to after
 * tapping through to `/login`.
 */
function AuthCta() {
  const { auth } = useExtensions();
  const { t } = useT();
  const state = auth.useAuthState();

  if (!auth.LoginScreen) return null;
  if (state.status !== 'signed-out') return null;

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <Link to="/login" className="btn primary" style={{ textAlign: 'center', display: 'block' }}>
        {t('account.signin')}
      </Link>
    </div>
  );
}

/**
 * Account page — hosts the generic sign-in affordance, the language picker,
 * and an optional `AccountExtras` slot for overlay-provided widgets
 * (typically signed-in-only: SWID display, sign-out button, etc.).
 *
 * In the default public bundle `AccountExtras` is null and `auth.LoginScreen`
 * is undefined, so only the language picker renders.
 */
export function Account() {
  const { AccountExtras } = useExtensions();
  const { t, lang, setLang } = useT();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <h1>{t('account.title')}</h1>
        </div>
      </header>

      <AuthCta />
      {AccountExtras && <AccountExtras />}

      <div className="card" style={{ marginTop: 14 }}>
        <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>{t('account.language')}</p>
        <div className="lang-picker" role="radiogroup" aria-label={t('account.language')}>
          {LANGS.map((l) => (
            <button
              key={l.code}
              role="radio"
              aria-checked={lang === l.code}
              className={`lang-chip${lang === l.code ? ' active' : ''}`}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
