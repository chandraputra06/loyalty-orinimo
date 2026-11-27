import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/Auth.jsx';
import { useUi } from '../../context/Ui.jsx';
import { IS_DEMO } from '../../config.js';

export default function Login() {
  const { session, signIn } = useAuth();
  const { toast } = useUi();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const next = loc.state?.from || '/admin/scanner';
  if (session?.isStaff) return <Navigate to={next} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { await signIn(email.trim(), pw); toast('Selamat bertugas!', false, 'success'); nav(next, { replace: true }); }
    catch (er) { setMsg(er.message); toast(er.message, true); }
    setBusy(false);
  }

  return (
    <section className="view">
      <form className="panel loginbox center" onSubmit={submit} noValidate>
        <img src="/assets/hello.webp" alt="" style={{ width: 130, margin: '-10px auto 4px', display: 'block' }} />
        <h1 style={{ margin: '0 0 4px' }}>Masuk admin</h1>
        {IS_DEMO ? (
          <p className="small muted">Mode demo: langsung tekan Masuk, tanpa email dan password.</p>
        ) : (
          <>
            <p className="small muted">Khusus admin dan owner Orinimo.</p>
            <label className="f" style={{ textAlign: 'left' }}><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="f" style={{ textAlign: 'left' }}><span>Password</span><input type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          </>
        )}
        <button className="btn pri" style={{ width: '100%' }} disabled={busy}>{busy ? <><i className="spin" /> Masuk…</> : 'Masuk'}</button>
        {msg && <p className="msg bad">{msg}</p>}
      </form>
    </section>
  );
}
