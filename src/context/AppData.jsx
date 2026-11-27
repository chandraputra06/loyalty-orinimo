import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { activeTheme } from '../lib/theme.js';
import { subscribeProgram } from '../lib/realtime.js';
import { IS_DEMO } from '../config.js';
import { reloadDemo } from '../lib/demoApi.js';

// Data publik: pengaturan program, pricelist, tema kartu.
const Ctx = createContext(null);
const DEFAULTS = { settings: { pct: 15, unit: 10000, minOrder: 0, cap: 0 }, products: [], themes: [], design: { activeId: 'default', history: [] } };

export function AppDataProvider({ children }) {
  const [data, setData] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try { setData(await api.getPublic()); setError(null); } catch (e) { setError(e); }
    setReady(true);
  }, []);

  useEffect(() => {
    reload();
    const off = subscribeProgram(() => reload());
    const onStorage = (e) => { if (IS_DEMO && e.key === 'orinimo-react-demo-v1') { reloadDemo(); reload(); } };
    addEventListener('storage', onStorage);
    return () => { off(); removeEventListener('storage', onStorage); };
  }, [reload]);

  const value = useMemo(() => ({ ...data, theme: activeTheme(data.themes, data.design), ready, error, reload }), [data, ready, error, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAppData = () => useContext(Ctx);
