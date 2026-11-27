import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { SPRITE } from './sprite.js';
import { Loading } from './Bits.jsx';
import { BgFx, Decor, Peek, Curtain, FilmStrip } from './Fx.jsx';
import { useAuth } from '../context/Auth.jsx';
import { IS_DEMO } from '../config.js';
import { getLastToken } from '../lib/messages.js';

export default function Layout() {
  const { session, signOut } = useAuth();
  const loc = useLocation();
  const [last, setLast] = useState(getLastToken());
  useEffect(() => { setLast(getLastToken()); window.scrollTo(0, 0); }, [loc.pathname]);
  const admin = session?.isStaff;

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: SPRITE }} />
      <Curtain />
      <BgFx />
      <Peek />
      <Decor />
      <header className="top">
        <div className="topbar">
          <Link className="brand" to={last ? `/k/${last}` : '/'}><img src="/assets/logo.webp" alt="" /><span><b>Orinimo</b><small>Loyalty Club</small></span></Link>
          <nav aria-label="Navigasi">
            {last && <NavLink to={`/k/${last}`}>Kartu saya</NavLink>}
            <NavLink to="/" end>Gabung</NavLink>
            {admin ? (
              <>
                <span className="sep">Admin</span>
                <NavLink to="/admin/scanner">Scanner</NavLink>
                <NavLink to="/admin" end>Dashboard</NavLink>
                <NavLink to="/admin/pelanggan">Pelanggan</NavLink>
                <NavLink to="/admin/program">Program</NavLink>
                <NavLink to="/admin/desain">Desain kartu</NavLink>
                <a href="#keluar" onClick={(e) => { e.preventDefault(); signOut(); }}>Keluar</a>
              </>
            ) : (
              <NavLink to="/admin/login">Admin</NavLink>
            )}
          </nav>
        </div>
        <div className="awning" />
      </header>
      {IS_DEMO && (
        <p className="demo"><span>Mode demo: Supabase belum dihubungkan, jadi data tersimpan di browser ini saja dan berisi pelanggan contoh. Buka Scanner di tab lain lalu beri stamp; kartu di tab ini ikut ter-cap secara realtime.</span></p>
      )}
      <main className="wrap">
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>
      <footer>
        <div>Orinimo Prem Apps · Selamat menonton!</div>
        <FilmStrip />
        <div className="seats" aria-hidden="true" />
      </footer>
    </>
  );
}
