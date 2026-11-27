// Desain kartu: tema bawaan, gambar sendiri, tinta & bentuk cap, tema musiman, template untuk desainer.
import { useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { notifyProgram } from '../../lib/realtime.js';
import { dfmt, rnd, maskPhone } from '../../lib/format.js';
import { BASE_SW, INKS, SHAPES, SHAPE_PATH, okImg, allThemes, themeById, activeTheme } from '../../lib/theme.js';
import { useAppData } from '../../context/AppData.jsx';
import { useUi } from '../../context/Ui.jsx';
import { useAdmin } from './AdminLayout.jsx';
import CardStage from '../../components/CardStage.jsx';
import { Modal } from '../../components/Bits.jsx';

const KEYS = ['base', 'frontImg', 'backImg', 'ink', 'shape'];
const sameAs = (a, b) => KEYS.every((k) => (a[k] || '') === (b[k] || ''));

// potong & kecilkan gambar ke ukuran kartu 1586×1000 (JPEG)
function cropToCard(file) {
  return new Promise((res, rej) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 12e6) return rej(new Error('Pakai JPG/PNG/WEBP maksimal 12 MB.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const W = 1586, H = 1000, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d'), sc = Math.max(W / img.width, H / img.height), w = img.width * sc, h = img.height * sc;
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H); cx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => res({ blob: b, cropped: Math.abs(img.width / img.height - 1.586) > 0.05 }), 'image/jpeg', 0.85);
    };
    img.onerror = () => rej(new Error('Gambar tidak bisa dibuka.'));
    img.src = url;
  });
}

function templatePNG(side) {
  const W = 1586, H = 1000, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff6ea'; c.fillRect(0, 0, W, H); c.strokeStyle = '#f3c6b4'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
  c.strokeStyle = '#c9343a'; c.lineWidth = 3;
  [[0, H / 2], [W, H / 2]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 40, 0, 7); c.stroke(); });
  const zone = (x, y, w, h, label, col) => { c.fillStyle = col + '22'; c.fillRect(x, y, w, h); c.setLineDash([16, 10]); c.strokeStyle = col; c.lineWidth = 4; c.strokeRect(x, y, w, h); c.setLineDash([]); c.fillStyle = col; c.font = 'bold 34px Nunito, sans-serif'; c.fillText(label, x + 18, y + 48); };
  if (side === 'front') { zone(63, 634, 888, 310, 'Area nama, nomor & kode member', '#2f5fd0'); zone(63, 40, 1460, 560, 'Bebas untuk desain', '#2f9c6f'); }
  else {
    zone(63, 50, 1047, 380, 'Bebas untuk desain (judul, ilustrasi)', '#2f9c6f'); zone(63, 470, 1047, 480, 'Area 10 slot stamp', '#2f5fd0'); zone(1158, 0, 428, H, 'Area QR', '#2f5fd0');
    c.strokeStyle = '#2f5fd0'; c.lineWidth = 3;
    for (let i = 0; i < 10; i++) { const x = 95 + 84 + (i % 5) * ((967 - 168) / 4), y = H - 90 - 84 - (i < 5 ? 168 + 41 : 0); c.beginPath(); c.arc(x, y, 84, 0, 7); c.stroke(); }
    c.fillStyle = '#fff'; c.fillRect(1222, 350, 301, 301); c.strokeRect(1222, 350, 301, 301); c.fillStyle = '#2f5fd0'; c.font = 'bold 30px Nunito, sans-serif'; c.fillText('QR (latar terang)', 1236, 510);
  }
  c.fillStyle = '#8d6b63'; c.font = 'bold 26px Nunito, sans-serif'; c.fillText(`Template kartu ${side === 'front' ? 'depan' : 'belakang'} Orinimo · 1586 × 1000 px`, 63, H - 24);
  return cv.toDataURL('image/png');
}

export default function Design() {
  const { themes, design, settings, reload } = useAppData();
  const { snap } = useAdmin();
  const { toast } = useUi();
  const [ds, setDs] = useState(() => ({ ...themeById(themes, design.activeId) }));
  const [guides, setGuides] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [tpl, setTpl] = useState(null);
  const stageRef = useRef();
  const act = activeTheme(themes, design);

  // kartu contoh untuk pratinjau
  const sample = useMemo(() => {
    const c = snap.cards.find((x) => x.status === 'active') || snap.cards[0];
    const cu = c && snap.cusById.get(c.customerId);
    if (!c || !cu) return { card: { id: 'x', code: 'ORI-DEMO-CARD', token: 'contoh', stamps: 6, revision: 1 }, customer: { code: 'ORI-CUS-000000', nickname: 'Member Orinimo', phoneMasked: '0812••••0000' } };
    return { card: { ...c, stamps: Math.max(c.stamps, 6) }, customer: { ...cu, phoneMasked: maskPhone(cu.phone) } };
  }, [snap]);

  const edit = (patch) => setDs((d) => ({ ...(d.builtin ? { ...d, id: null, builtin: false, name: '', from: null, to: null } : d), ...patch }));

  async function upload(side, file) {
    if (!file) return;
    setBusy(side); setMsg(null);
    try {
      const { blob, cropped } = await cropToCard(file);
      const url = await api.uploadDesignImage(blob);
      edit(side === 'front' ? { frontImg: url } : { backImg: url });
      if (side === 'back' && !stageRef.current?.isFlipped()) setTimeout(() => stageRef.current?.flip(), 50);
      setMsg({ cls: 'ok', t: cropped ? 'Gambar dipotong otomatis ke rasio kartu. Cek pratinjaunya ya.' : 'Gambar terpasang di pratinjau.' });
    } catch (er) { setMsg({ cls: 'bad', t: er.message }); }
    setBusy('');
  }

  async function apply() {
    const from = ds.from || '', to = ds.to || '', name = (ds.name || '').trim();
    if ((from && !to) || (!from && to) || (from && to && from > to)) { setMsg({ cls: 'bad', t: 'Isi tanggal mulai dan selesai dengan benar, atau kosongkan keduanya.' }); return; }
    setBusy('apply');
    try {
      let th;
      const base = ds.id && themeById(themes, ds.id);
      if (base && base.builtin && sameAs(ds, base) && !from) th = base;
      else {
        if (themes.length >= 6 && !(ds.id && themes.some((t) => t.id === ds.id))) { setMsg({ cls: 'bad', t: 'Maksimal 6 tema kustom. Hapus salah satu dulu.' }); setBusy(''); return; }
        const rec = { id: ds.id && !ds.builtin ? ds.id : 'th_' + rnd(6), name: name || (from ? 'Tema musiman' : 'Tema kustom'), base: ds.base || 'default', frontImg: ds.frontImg || '', backImg: ds.backImg || '', ink: ds.ink, shape: ds.shape, from: from || null, to: to || null };
        // jadwal yang bertabrakan dilepas, supaya hanya satu tema musiman aktif
        if (from) for (const t of themes) if (t.id !== rec.id && t.from && !(to < t.from || from > t.to)) await api.saveTheme({ ...t, from: null, to: null });
        await api.saveTheme(rec);
        th = rec;
      }
      if (!from && design.activeId !== th.id) await api.setDesign({ activeId: th.id, history: [...design.history, design.activeId].slice(-10) });
      notifyProgram({ kind: 'design' }); await reload();
      setDs({ ...th });
      setMsg({ cls: 'ok', t: from ? `Tema "${th.name}" terjadwal ${dfmt(from)} sampai ${dfmt(to)}.` : `Semua kartu sekarang memakai "${th.name}".` });
      toast(from ? 'Tema musiman terjadwal!' : 'Desain baru terpasang di semua kartu!', false, 'success');
    } catch (er) { setMsg({ cls: 'bad', t: er.message }); toast(er.message, true); }
    setBusy('');
  }

  async function undo() {
    if (!design.history.length) return;
    const h = [...design.history];
    let id = h.pop();
    if (!allThemes(themes).some((t) => t.id === id)) id = 'default';
    try {
      await api.setDesign({ activeId: id, history: h });
      notifyProgram({ kind: 'design' }); await reload();
      setDs({ ...themeById(themes, id) });
      setMsg({ cls: 'ok', t: 'Desain sebelumnya dipulihkan.' });
    } catch (er) { setMsg({ cls: 'bad', t: er.message }); }
  }

  async function remove(id) {
    try {
      await api.deleteTheme(id); notifyProgram({ kind: 'design' }); await reload();
      if (ds.id === id) setDs({ ...themeById(themes, design.activeId) });
      toast('Tema dihapus.', false, 'hello');
    } catch (er) { toast(er.message, true); }
  }

  const preview = { ...ds, id: ds.id || 'draft' };

  return (
    <section className="view">
      <h1>Desain kartu</h1>
      <p className="lead">Ganti tampilan semua kartu kapan saja. Stamp, voucher, QR, dan link pelanggan tidak berubah.</p>
      <div className="dz">
        <div className="panel dprev">
          <CardStage ref={stageRef} card={sample.card} customer={sample.customer} settings={settings} theme={preview} idle guides={guides} />
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn ghost" type="button" onClick={() => stageRef.current?.flip()}>Balik kartu</button>
            <label className="chk" style={{ margin: 0 }}><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Tampilkan area aman</label>
          </div>
          <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Kartu pelanggan saat ini memakai: {act.name}</p>
        </div>
        <div className="panel b">
          <h2>Tema siap pakai</h2>
          <div className="themes">
            {allThemes(themes).map((t) => {
              const sw = okImg(t.frontImg) ? { backgroundImage: `url(${t.frontImg})` } : { background: BASE_SW[t.base] || BASE_SW.default };
              const tag = t.id === act.id ? 'Sedang aktif' : t.from ? `Terjadwal ${dfmt(t.from)}–${dfmt(t.to)}` : t.id === design.activeId ? 'Desain utama' : t.builtin ? 'Tema bawaan' : 'Tema kustom';
              const deletable = !t.builtin && t.id !== act.id && t.id !== design.activeId;
              return (
                <button key={t.id} type="button" className={'tile' + (ds.id === t.id ? ' on' : '')}
                  onClick={(e) => { if (e.target.closest('[data-x]')) { remove(t.id); return; } setDs({ ...t }); }}>
                  <i style={sw} /><b>{t.name}</b><small>{tag}</small>
                  {deletable && <span className="x" role="button" data-x="1" aria-label="Hapus tema">×</span>}
                </button>
              );
            })}
          </div>
          <h2>Pakai gambar sendiri</h2>
          {[['front', 'Sisi depan', 'frontImg'], ['back', 'Sisi belakang', 'backImg']].map(([side, l, k]) => (
            <div className="uprow" key={side}><span>{l}</span>
              <label className="btn ghost">{busy === side ? <><i className="spin" /> Mengunggah…</> : 'Upload gambar'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; upload(side, f); }} /></label>
              <button className="btn ghost" type="button" disabled={!ds[k]} onClick={() => edit({ [k]: '' })}>Hapus</button>
            </div>
          ))}
          <p className="small muted" style={{ margin: 0 }}>JPG/PNG/WEBP, idealnya 1586 × 1000 px. Gambar lain otomatis dipotong ke ukuran kartu.</p>
          <h2>Cap stamp</h2>
          <p className="small muted" style={{ margin: '-6px 0 8px', fontWeight: 800 }}>Warna tinta</p>
          <div className="inks">{INKS.map((c) => <button key={c} type="button" style={{ background: c }} className={ds.ink === c ? 'on' : ''} aria-label={'Tinta ' + c} onClick={() => edit({ ink: c })} />)}</div>
          <p className="small muted" style={{ margin: '14px 0 8px', fontWeight: 800 }}>Bentuk cap</p>
          <div className="shapes">{SHAPES.map(([k, l]) => (
            <button key={k} type="button" className={ds.shape === k ? 'on' : ''} style={{ '--stamp': ds.ink }} onClick={() => edit({ shape: k })}>
              {k === 'logo' ? <img src="/assets/logo.webp" alt="" style={{ width: 30, height: 30 }} /> : <svg viewBox="0 0 40 40"><path d={SHAPE_PATH[k]} fill="none" stroke="currentColor" strokeWidth="2.4" /></svg>}{l}
            </button>
          ))}</div>
          <h2>Simpan & terapkan</h2>
          <label className="f"><span>Nama tema</span><input type="text" maxLength={40} placeholder="mis. Ramadan 2027" value={ds.builtin ? '' : ds.name || ''} onChange={(e) => edit({ name: e.target.value })} /></label>
          <div className="grid2">
            <label className="f"><span>Mulai (opsional)</span><input type="date" value={ds.builtin ? '' : ds.from || ''} onChange={(e) => edit({ from: e.target.value || null })} /></label>
            <label className="f"><span>Selesai (opsional)</span><input type="date" value={ds.builtin ? '' : ds.to || ''} onChange={(e) => edit({ to: e.target.value || null })} /></label>
          </div>
          <p className="small muted" style={{ margin: '-6px 0 14px' }}>Isi tanggal untuk tema musiman. Tema otomatis aktif di tanggal itu, lalu kartu kembali ke desain utama.</p>
          <div className="acts">
            <button className="btn pri" type="button" disabled={!!busy} onClick={apply}>{busy === 'apply' ? 'Menerapkan…' : 'Terapkan ke semua kartu'}</button>
            <button className="btn ghost" type="button" disabled={!design.history.length} onClick={undo}>Kembalikan desain sebelumnya</button>
          </div>
          {msg && <p className={'msg ' + msg.cls}>{msg.t}</p>}
          <h2>Panduan untuk desainer</h2>
          <ul className="spec">
            <li>Ukuran 1586 × 1000 px (rasio kartu ATM), JPG atau PNG.</li>
            <li>Sisi depan: kosongkan kiri bawah untuk nama, nomor, dan kode member.</li>
            <li>Sisi belakang: kosongkan bagian kanan untuk QR, dan bagian bawah kiri untuk 10 slot stamp.</li>
            <li>Latar di belakang QR harus polos dan terang supaya mudah di-scan.</li>
            <li>Lekukan tiket di kiri dan kanan tengah akan memotong gambar sedikit.</li>
          </ul>
          <div className="row" style={{ marginTop: 12 }}>
            {[['front', 'depan'], ['back', 'belakang']].map(([s, l]) => (
              <button key={s} className="btn" type="button" onClick={() => setTpl({ url: templatePNG(s), name: `template-kartu-${l}-orinimo.png` })}>Download template {l}</button>
            ))}
          </div>
        </div>
      </div>
      <Modal open={!!tpl} onClose={() => setTpl(null)} width="min(640px,100%)">
        {tpl && (<>
          <img src={tpl.url} alt="Template kartu" style={{ width: '100%', borderRadius: 12 }} />
          <div className="acts" style={{ marginTop: 12 }}>
            <a className="btn pri" href={tpl.url} download={tpl.name}>Simpan PNG</a>
            <button className="btn ghost" type="button" onClick={() => setTpl(null)}>Tutup</button>
          </div>
        </>)}
      </Modal>
    </section>
  );
}

