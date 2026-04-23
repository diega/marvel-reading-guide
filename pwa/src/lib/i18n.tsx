import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';

export type Lang = 'es' | 'en';

const STRINGS = {
  es: {
    'app.title': 'Marvel Reading Guide',
    'nav.events': 'Eventos',
    'nav.timeline': 'Timeline',
    'nav.atlas': 'Atlas',
    'nav.account': 'Cuenta',
    'atlas.title': 'Atlas',
    'atlas.blurb': 'Mapa tipo red de subte: cada línea es un team, cada estación es un evento. Las estaciones huecas con conexión punteada son crossovers donde varios teams se cruzan.',
    'atlas.open': 'Abrir team',
    'atlas.clearFocus': 'Quitar foco',
    'atlas.events': 'eventos',
    'chapter.issueSingular': 'issue',
    'chapter.issuePlural': 'issues',
    'chapter.read': 'leídos',
    'chapter.standalone': 'Sueltos',
    'chapter.more': 'más',
    'chapter.eventSingular': 'evento',
    'chapter.eventPlural': 'eventos',
    'home.title.crossover': 'Eventos crossover',
    'home.title.character': 'Personajes',
    'home.title.team': 'Equipos',
    'home.allEvents': 'Todos los eventos',
    'home.continueReading': 'Continuar leyendo',
    'home.continueReading.next': 'Próximo:',
    'home.continueReading.midIssue': 'Lectura en curso',
    'era.standalone': 'Entre eventos',
    'timeline.title': 'Timeline',
    'timeline.blurb': 'Cronología de eventos crossover de Marvel. Tap para ver el orden de lectura del evento.',
    'account.title': 'Cuenta',
    'account.language': 'Idioma',
    'account.language.es': 'Español',
    'account.language.en': 'English',
    'account.signin': 'Ingresar',
    'loading': 'Cargando…',
    'event.issues': 'issues totales',
    'event.read_pct': '{read}/{total} leídos ({pct}%)',
    'event.sources': 'Fuentes:',
    'event.source': 'Fuente',
    'event.notfound': 'Evento no encontrado.',
    'event.back': 'Volver',
    'issue.read': 'Leer',
    'sync.synced': 'Sincronizado',
    'sync.push': 'Sincronizar progreso',
    'sync.busy': 'Sincronizando…',
    'sync.retry': 'Falló — tocá para reintentar',
    'level.picker.aria': 'Nivel de profundidad',
    'level.alpha.name': 'Alpha',
    'level.alpha.desc': 'Solo la mini principal. El mínimo para entender el evento.',
    'level.epsilon.name': 'Epsilon',
    'level.epsilon.desc': 'Core + tie-ins requeridos. La versión recomendada.',
    'level.omega.name': 'Omega',
    'level.omega.desc': 'Todo: prelude, tie-ins opcionales y epilogue.',
    'role.core': 'core',
    'role.tie-in-required': 'tie-in req',
    'role.tie-in-optional': 'tie-in opt',
    'role.context': 'contexto',
    'showOptional': 'Tie-ins opcionales',
    'showContext': 'Contexto',
  },
  en: {
    'app.title': 'Marvel Reading Guide',
    'nav.events': 'Guides',
    'nav.timeline': 'Timeline',
    'nav.atlas': 'Atlas',
    'nav.account': 'Account',
    'atlas.title': 'Atlas',
    'atlas.blurb': 'Transit-map view: each colored line is a team, each station is a crossover event. Hollow stations with a dashed connector are crossovers where multiple team lines meet.',
    'atlas.open': 'Open team',
    'atlas.clearFocus': 'Clear focus',
    'atlas.events': 'events',
    'chapter.issueSingular': 'issue',
    'chapter.issuePlural': 'issues',
    'chapter.read': 'read',
    'chapter.standalone': 'Standalone',
    'chapter.more': 'more',
    'chapter.eventSingular': 'event',
    'chapter.eventPlural': 'events',
    'home.title.crossover': 'Crossover events',
    'home.title.character': 'Characters',
    'home.title.team': 'Teams',
    'home.allEvents': 'All events',
    'home.continueReading': 'Continue reading',
    'home.continueReading.next': 'Up next:',
    'home.continueReading.midIssue': 'Currently reading',
    'era.standalone': 'Between events',
    'timeline.title': 'Timeline',
    'timeline.blurb': 'Chronology of Marvel crossover events. Tap an event to see its reading order.',
    'account.title': 'Account',
    'account.language': 'Language',
    'account.language.es': 'Español',
    'account.language.en': 'English',
    'account.signin': 'Sign in',
    'loading': 'Loading…',
    'event.issues': 'total issues',
    'event.read_pct': '{read}/{total} read ({pct}%)',
    'event.sources': 'Sources:',
    'event.source': 'Source',
    'event.notfound': 'Event not found.',
    'event.back': 'Back',
    'issue.read': 'Read',
    'sync.synced': 'Synced',
    'sync.push': 'Sync progress',
    'sync.busy': 'Syncing…',
    'sync.retry': 'Failed — tap to retry',
    'level.picker.aria': 'Depth level',
    'level.alpha.name': 'Alpha',
    'level.alpha.desc': 'Just the main mini. The minimum to follow the event.',
    'level.epsilon.name': 'Epsilon',
    'level.epsilon.desc': 'Core + required tie-ins. The recommended path.',
    'level.omega.name': 'Omega',
    'level.omega.desc': 'Everything: prelude, optional tie-ins, and epilogue.',
    'role.core': 'core',
    'role.tie-in-required': 'tie-in req',
    'role.tie-in-optional': 'tie-in opt',
    'role.context': 'context',
    'showOptional': 'Optional tie-ins',
    'showContext': 'Context',
  },
} as const satisfies Record<Lang, Record<string, string>>;

type Key = keyof typeof STRINGS['es'];

const STORAGE_KEY = 'mrg:lang';

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'es' || v === 'en') return v;
    const browser = navigator.language?.toLowerCase() ?? '';
    if (browser.startsWith('en')) return 'en';
  } catch {}
  return 'es';
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => loadLang());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nCtx>(() => ({
    lang,
    setLang: setLangState,
    t: (key, vars) => {
      let s: string = (STRINGS[lang] as Record<string, string>)[key] ?? (STRINGS.es as Record<string, string>)[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      }
      return s;
    },
  }), [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useT outside I18nProvider');
  return ctx;
}

/**
 * Narrower alternative for consumers that only need the current language.
 * Re-renders on lang change just like `useT`. Exposed for overlays, which
 * can maintain their own string dictionaries but key off the same lang the
 * user picked in Account.
 */
export function useLang(): Lang {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang outside I18nProvider');
  return ctx.lang;
}
