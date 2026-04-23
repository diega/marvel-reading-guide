import type { Issue, Role } from './schema';

export type Level = 'alpha' | 'epsilon' | 'omega';

export const LEVELS: Level[] = ['alpha', 'epsilon', 'omega'];

interface LevelMeta {
  id: Level;
  glyph: string;
  name: string;
  description: string;
  roles: ReadonlySet<Role>;
}

export const LEVEL_META: Record<Level, LevelMeta> = {
  alpha: {
    id: 'alpha',
    glyph: 'α',
    name: 'Alpha',
    description: 'Solo la mini principal. El mínimo para entender el evento.',
    roles: new Set<Role>(['core']),
  },
  epsilon: {
    id: 'epsilon',
    glyph: 'ε',
    name: 'Epsilon',
    description: 'Core + tie-ins requeridos. La versión recomendada.',
    roles: new Set<Role>(['core', 'tie-in-required']),
  },
  omega: {
    id: 'omega',
    glyph: 'Ω',
    name: 'Omega',
    description: 'Todo: prelude, tie-ins opcionales y epilogue.',
    roles: new Set<Role>(['core', 'tie-in-required', 'tie-in-optional', 'context']),
  },
};

export function issuesAtLevel(issues: Issue[], level: Level): Issue[] {
  const roles = LEVEL_META[level].roles;
  return issues.filter((i) => roles.has(i.role));
}

export function countsByLevel(issues: Issue[]): Record<Level, number> {
  return {
    alpha: issuesAtLevel(issues, 'alpha').length,
    epsilon: issuesAtLevel(issues, 'epsilon').length,
    omega: issuesAtLevel(issues, 'omega').length,
  };
}

const STORAGE_KEY = 'mrg:level';

export function loadLevel(): Level {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'alpha' || v === 'epsilon' || v === 'omega') return v;
  } catch {}
  return 'epsilon'; // sensible default — the "recommended" experience
}

export function saveLevel(level: Level): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {}
}
