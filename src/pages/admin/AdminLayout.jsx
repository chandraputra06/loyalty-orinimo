// Penjaga halaman admin + data admin (pelanggan, kartu, order, voucher) yang dipakai bersama.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { subscribeAdmin } from '../../lib/realtime.js';
import { useAuth } from '../../context/Auth.jsx';
import { useUi } from '../../context/Ui.jsx';
import { Loading } from '../../components/Bits.jsx';
import { IS_DEMO } from '../../config.js';
import { reloadDemo } from '../../lib/demoApi.js';

const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);

function index(s) {
  const cusById = new Map(s.customers.map((c) => [c.id, c]));
  const cardById = new Map(s.cards.map((c) => [c.id, c]));
  const cardByCus = new Map(s.cards.map((c) => [c.customerId, c]));
  const avail = (cardId) => s.rewards.filter((r) => r.cardId === cardId && r.status === 'AVAILABLE');
  const opByOrder = new Map(s.ops.map((o) => [o.orderId, o]));
  return { ...s, cusById, cardById, cardByCus, avail, opByOrder };
}

export function AdminData() {
  const { toast } = useUi();
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  const busy = useRef(null);

  const reload = useCallback(async () => {
    if (busy.current) return busy.current;
    busy.current = (async () => {
      try { const s = await api.adminSnapshot(); setSnap(index(s)); setErr(null); return index(s); }
      catch (e) { setErr(e); toast(e.message, true); return null; }
      finally { busy.current = null; }
    })();
    return busy.current;
  }, [toast]);

  useEffect(() => {
    reload();
    const off = subscribeAdmin(() => { reloadDemo(); reload(); });
    const onVis = () => { if (!document.hidden) reload(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { off(); document.removeEventListener('visibilitychange', onVis); };
  }, [reload]);

  const value = useMemo(() => ({ snap, reload }), [snap, reload]);
  if (!snap) return err ? <div className="panel center"><p className="msg bad">{err.message}</p><button className="btn pri" onClick={reload}>Coba lagi</button></div> : <Loading text="Memuat data pelanggan…" />;
  return <Ctx.Provider value={value}><Outlet /></Ctx.Provider>;
}

export default function AdminGuard() {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!session?.isStaff) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  return <AdminData />;
}

export const demoNote = IS_DEMO;
