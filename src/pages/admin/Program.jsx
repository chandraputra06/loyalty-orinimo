// Pengaturan program: diskon %, nominal per stamp, minimal belanja voucher, maksimal potongan.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { notifyProgram } from '../../lib/realtime.js';
import { idr } from '../../lib/format.js';
import { useAppData } from '../../context/AppData.jsx';
import { useUi } from '../../context/Ui.jsx';

const fmt = (n) => (n ? Number(n).toLocaleString('id-ID') : '');
const num = (v) => { const d = String(v || '').replace(/\D/g, ''); return d ? +d : 0; };

export default function Program() {
  const { settings, reload } = useAppData();
  const { toast, party } = useUi();
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF({ pct: String(settings.pct), unit: fmt(settings.unit), min: fmt(settings.minOrder), cap: fmt(settings.cap) }); }, [settings]);
  if (!f) return null;

  const set = (k, max) => (e) => { const d = e.target.value.replace(/\D/g, '').slice(0, max); setF({ ...f, [k]: k === 'pct' ? d : fmt(+d) }); };
  const pct = num(f.pct), unit = num(f.unit), min = num(f.min), cap = num(f.cap);

  async function save(e) {
    e.preventDefault();
    if (pct < 1 || pct > 90) { setMsg({ cls: 'bad', t: 'Diskon harus 1–90%.' }); return; }
    if (unit < 1000 || unit > 1000000) { setMsg({ cls: 'bad', t: 'Nominal per stamp harus Rp1.000 sampai Rp1.000.000.' }); return; }
    if (min > 10000000 || cap > 10000000) { setMsg({ cls: 'bad', t: 'Nominal maksimal Rp10.000.000.' }); return; }
    setBusy(true);
    try {
      await api.saveSettings({ pct, unit, minOrder: min, cap });
      notifyProgram({ kind: 'settings' }); await reload();
      setMsg({ cls: 'ok', t: `Tersimpan: ${idr(unit)} = 1 stamp, 10 stamp = diskon ${pct}%.` }); toast('Pengaturan program tersimpan!', false, 'success');
    } catch (er) { setMsg({ cls: 'bad', t: er.message }); toast(er.message, true); }
    setBusy(false);
  }

  return (
    <section className="view">
      <h1>Pengaturan program</h1>
      <p className="lead">Atur besar diskon dan aturan stamp. Perubahan langsung berlaku untuk semua pelanggan.</p>
      <div className="dz">
        <form className="panel" onSubmit={save} noValidate>
          <h2>Reward</h2>
          <label className="f"><span>Diskon voucher (%)</span><div className="money"><input type="text" inputMode="numeric" maxLength={2} style={{ paddingLeft: 18 }} value={f.pct} onChange={set('pct', 2)} /><i style={{ left: 'auto', right: 18 }}>%</i></div></label>
          <label className="f"><span>Maksimal potongan per voucher (opsional)</span><div className="money"><i>Rp</i><input type="text" inputMode="numeric" placeholder="0 = tanpa batas" value={f.cap} onChange={set('cap', 8)} /></div></label>
          <label className="f"><span>Minimal belanja untuk pakai voucher (opsional)</span><div className="money"><i>Rp</i><input type="text" inputMode="numeric" placeholder="0 = tanpa minimal" value={f.min} onChange={set('min', 8)} /></div></label>
          <h2>Stamp</h2>
          <label className="f"><span>Nominal belanja untuk 1 stamp</span><div className="money"><i>Rp</i><input type="text" inputMode="numeric" value={f.unit} onChange={set('unit', 8)} /></div></label>
          <p className="small muted" style={{ margin: '-6px 0 14px' }}>Jumlah stamp untuk 1 voucher tetap 10, mengikuti 10 slot di kartu.</p>
          <div className="acts">
            <button className="btn pri" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</button>
            <button className="btn ghost" type="button" onClick={() => { setF({ pct: '15', unit: fmt(10000), min: '', cap: '' }); setMsg(null); }}>Kembalikan ke 15% · Rp10.000</button>
          </div>
          {msg && <p className={'msg ' + msg.cls}>{msg.t}</p>}
        </form>
        <div className="panel y" style={{ position: 'sticky', top: 110 }}>
          <h2>Contoh perhitungan</h2>
          <div className="preview" style={{ background: '#fff8e3' }}>
            {!pct || !unit ? <div><span>Isi diskon dan nominal per stamp dulu.</span></div> : (
              <>
                <div className="big"><span>Aturan baru</span><b>{idr(unit)} = 1 stamp</b></div>
                <div><span>10 stamp</span><b>diskon {pct}%{cap ? ` (maks. ${idr(cap)})` : ''}</b></div>
                {min > 0 && <div><span>Pakai voucher</span><b>min. belanja {idr(min)}</b></div>}
                {[37000, 45000, 120000].map((a) => { let d = Math.floor((a * pct) / 100); if (cap) d = Math.min(d, cap); const ok = !min || a >= min;
                  return <div key={a}><span>Belanja {idr(a)}</span><b>+{Math.floor(a / unit)} stamp · voucher {ok ? '−' + idr(d) : 'belum bisa'}</b></div>; })}
              </>
            )}
          </div>
          <p className="small muted">Voucher yang sudah terbit tetap memakai persentase lamanya, supaya adil untuk pelanggan yang sudah mengumpulkan stamp.</p>
          <h2>Animasi kartu penuh</h2>
          <p className="small muted" style={{ marginTop: -6 }}>Ini yang dilihat pelanggan saat stamp ke-10 masuk.</p>
          <button className="btn mar" type="button" style={{ width: '100%' }} onClick={() => party({ pct: pct || settings.pct, codes: ['RWD-CONTOH'], name: 'Kak' })}>Lihat animasinya</button>
        </div>
      </div>
    </section>
  );
}
