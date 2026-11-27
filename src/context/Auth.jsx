import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Login admin (Supabase Auth). Mode demo: masuk tanpa password.
const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSession().then((s) => { setSession(s); setLoading(false); }).catch(() => setLoading(false));
    return api.onAuthChange((s) => setSession(s));
  }, []);

  const value = {
    session, loading,
    async signIn(email, password) { const s = await api.signIn(email, password); setSession(s); return s; },
    async signOut() { await api.signOut(); setSession(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
