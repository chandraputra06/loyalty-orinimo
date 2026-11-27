// Halaman depan: gabung pakai nomor WA, minta link ulang, cara kerja.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { normPhone, idr } from '../lib/format.js';
import { activationLink, recoveryLink, getLastToken, saveLastToken } from '../lib/messages.js';
import { useAppData } from '../context/AppData.jsx';
import { useUi } from '../context/Ui.jsx';
import { Mascot } from '../components/Bits.jsx';
import { IS_DEMO } from '../config.js';

export function HowItWorks() {
  const { settings } = useAppData();
  return (
    <div className="how">
      <h2>Cara kerjanya</h2>
      <div className="steps">
        <div className="step"><i><svg><use href="#i-pop" /></svg></i><b>1. Order & bayar QRIS</b><p>Order lewat WhatsApp dan bayar pakai QRIS seperti biasa.</p></div>
        <div className="step"><i><svg><use href="#i-phone" /></svg></i><b>2. Stamp masuk otomatis</b><p>Admin kasih stamp lewat nomor WA-mu. Link kartu dikirim lewat WA saat order pertama.</p></div>
        <div className="step"><i><svg><use href="#i-gift" /></svg></i><b>3. 10 stamp = diskon {settings.pct}%</b><p>Tiket voucher terbit otomatis untuk order berikutnya.</p></div>
      </div>
    </div>
  );
}

export default function Home() {
  const { settings } = useAppData();
  const { toast } = useUi();
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rPhone, setRPhone] = useState('');
  const [bump, setBump] = useState(0);
  const last = getLastToken();
  const rph = normPhone(rPhone);

  async function join(e) {
    e.preventDefault();
    setDone(null);
    if (!consent) { setMsg({ bad: true, t: 'Centang persetujuannya dulu ya.' }); toast('Centang persetujuannya dulu ya.', true, 'thinking'); return; }
    setBusy(true);
    try {
      const r = await api.selfJoin(phone);
      saveLastToken(r.token);
      setMsg(null); setDone(r); setBump((b) => b + 1);
      toast('Hore! Tinggal aktivasi via WhatsApp.', false, 'success');
    } catch (er) {
      const t = er.code === 'DUPLICATE_MEMBER' ? 'Nomor ini sudah punya kartu. Kalau link kartunya hilang, minta link baru di bawah.' : er.message;
      setMsg({ bad: true, t });
      if (er.code === 'DUPLICATE_MEMBER') setRPhone(phone);
      toast(t, true); setBump((b) => b + 1);
    }
    setBusy(false);
  }

  return (
    <section className="view">
      <div className="joinbox">
        <div className="joinhero">
          <Mascot bump={bump} onClick={() => setBump((b) => b + 1)} />
          <div>
            <h1>Gabung Loyalty Club!</h1>
            <p className="lead" style={{ margin: 0 }}>Cukup pakai nomor WhatsApp. Setiap kelipatan {idr(settings.unit)} dalam satu transaksi = 1 stamp, 10 stamp = diskon {settings.pct}%.</p>
          </div>
        </div>

        {last && (
          <div className="panel y" style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <b>Kartu kamu tersimpan di perangkat ini.</b>
            <Link className="btn pri" to={`/k/${last}`}>Buka kartu saya</Link>
          </div>
        )}

        <form className="panel" onSubmit={join} noValidate>
          <label className="f"><span>Nomor WhatsApp</span>
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="chk"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Saya setuju nomor WhatsApp saya disimpan untuk program loyalty Orinimo sesuai ketentuan program.</label>
          <button className="btn pri" style={{ width: '100%' }} disabled={busy}>{busy ? <><i className="spin" /> Memproses…</> : 'Ambil kartu saya'}</button>
          {msg && <p className={'msg' + (msg.bad ? ' bad' : ' ok')}>{msg.t}</p>}
          {done && (
            <div className="bubble" style={{ marginTop: 6 }}>
              <div className="progress">Satu langkah lagi!</div>
              <p style={{ margin: '4px 0 10px', fontWeight: 700 }}>Kirim kode <b>{done.actCode}</b> ke WhatsApp Orinimo dari nomor ini. Setelah admin mengaktifkan, link kartu dikirim ke WA-mu.</p>
              <a className="btn pri" style={{ width: '100%' }} target="_blank" rel="noopener noreferrer" href={activationLink(done.actCode)}>Aktifkan via WhatsApp</a>
              <p className="small muted" style={{ margin: '8px 0 0' }}><Link to={`/k/${done.token}`}>Lihat kartu yang menunggu aktivasi</Link></p>
            </div>
          )}
          <p className="small muted" style={{ marginBottom: 0 }}>Sudah pernah order? Biasanya admin sudah mengirim link kartumu lewat WhatsApp, jadi kamu tidak perlu daftar lagi.</p>
        </form>

        <h2 style={{ marginTop: 34 }}>Link kartu hilang atau ganti HP?</h2>
        <form className="panel b" onSubmit={(e) => e.preventDefault()} noValidate>
          <label className="f"><span>Nomor WhatsApp yang terdaftar</span>
            <input type="tel" inputMode="tel" placeholder="0812 3456 7890" value={rPhone} onChange={(e) => setRPhone(e.target.value)} />
          </label>
          <a className="btn mar" style={{ width: '100%', ...(rph ? {} : { opacity: 0.5, pointerEvents: 'none' }) }} aria-disabled={!rph}
            href={rph ? recoveryLink(rph) : undefined} target="_blank" rel="noopener noreferrer">Minta link baru via WhatsApp</a>
          <p className="small muted" style={{ marginBottom: 0 }}>Admin akan mengirim ulang link kartumu. Saldo stamp dan voucher tetap sama.</p>
        </form>
        {IS_DEMO && <p className="small muted onbg" style={{ width: 'fit-content', marginTop: 18 }}>Demo: <Link to="/admin/login">masuk sebagai admin</Link> untuk melihat kartu pelanggan contoh.</p>}
      </div>
      <HowItWorks />
    </section>
  );
}
