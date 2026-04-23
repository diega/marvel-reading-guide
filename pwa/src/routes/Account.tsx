import { useExtensions } from '../lib/extensions-context';
import { useT, type Lang } from '../lib/i18n';

const LANGS: { code: Lang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];

/**
 * Account page — hosts the language picker + an optional `AccountExtras` slot
 * for overlay-provided UI (e.g. session info, sign-out). In the default bundle
 * `AccountExtras` is null and only the language picker renders.
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

      {AccountExtras && <AccountExtras />}

      <div className="card" style={{ marginTop: AccountExtras ? 14 : 0 }}>
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
