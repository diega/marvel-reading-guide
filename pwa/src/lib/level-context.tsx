import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadLevel, saveLevel, type Level } from './levels';

interface LevelCtx {
  level: Level;
  setLevel: (l: Level) => void;
}

const Ctx = createContext<LevelCtx | null>(null);

export function LevelProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState<Level>(() => loadLevel());
  useEffect(() => { saveLevel(level); }, [level]);
  return <Ctx.Provider value={{ level, setLevel: setLevelState }}>{children}</Ctx.Provider>;
}

export function useLevel(): LevelCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLevel outside LevelProvider');
  return v;
}
