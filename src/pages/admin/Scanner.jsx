// Scanner admin: cari kartu (kamera / foto / kode), catat order QRIS, beri stamp, redeem, undo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import jsQR from 'jsqr';
import { api } from '../../lib/api.js';
import { notifyCard, notifyAdmin } from '../../lib/realtime.js';
import { idr, kfmt, dtfmt, fmtPhone, maskPhone, label, newRef, waLink, reduceMotion } from '../../lib/format.js';
import { cardMsg } from '../../lib/messages.js';
import { sparkle } from '../../lib/stage.js';
import { useAppData } from '../../context/AppData.jsx';
import { useUi } from '../../context/Ui.jsx';
import { useAdmin } from './AdminLayout.jsx';
import { resolveCard, suffixMatches } from './resolve.js';
import CardStage from '../../components/CardStage.jsx';
import { Empty, Pow } from '../../components/Bits.jsx';
import { IS_DEMO } from '../../config.js';

const UNDO_MS = 5 * 60 * 1000;
const blankOrder = () => ({ ref: newRef(), amount: null, manual: false, items: [], brand: null, method: 'QRIS GoPay', note: '', paid: false, redeem: false, rewardId: '', bigOk: false, twinOk: false });

function Hl({ phone, d }) {
  const l = maskPhone(phone);
  return <>{l.slice(0, l.length - d.length)}<mark>{l.slice(-d.length)}</mark></>;
}

export default function Scanner() {
  const { snap, reload } = useAdmin();
  const { settings, products, theme } = useAppData();
  const { toast } = useUi();
  const loc = useLocation();
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState('');
  const [scanMsg, setScanMsg] = useState(null);
  const [view, setView] = useState(() => (loc.state?.cardId ? { kind: 'card', cardId: loc.state.cardId } : { kind: 'none' }));
  const [o, setO] = useState(blankOrder);
  const [oMsg, setOMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null); // {op, text, reason}
  const [mood, setMood] = useState({ img: null, n: 0, shake: false });
  const [pow, setPow] = useState(0);
  const [live, setLive] = useState(null); // stamp yang sedang dianimasikan
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const stageRef = useRef();
  const resultRef = useRef();
  const codeRef = useRef();

  const card = view.kind === 'card' ? snap.cardById.get(view.cardId) : null;
  const cu = card ? snap.cusById.get(card.customerId) : null;
  const av = card ? snap.avail(card.id) : [];
  const prodById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand))], [products]);

  const showResult = () => { if (innerWidth < 900) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }), 30); };
  const openCard = (c, extra = {}) => {
    setView({ kind: 'card', cardId: c.id, ...extra }); setO(blankOrder()); setOMsg(null); setUndo(null); setLive(null); setMood({ img: null, n: 0 });
    setScanMsg({ cls: 'ok', t: c.status === 'pending' ? 'Kartu ditemukan, menunggu aktivasi.' : 'Kartu ditemukan.' });
    showResult();
  };

  const doResolve = useCallback(async (text, retry = true) => {
    const t = (text || '').trim();
    if (/^\d{4,8}$/.test(t)) {
      const ms = suffixMatches(snap, t);
      if (ms.length === 1) return openCard(ms[0].card);
      if (ms.length > 1) { setScanMsg({ cls: '', t: `Ada ${ms.length} pelanggan dengan nomor berakhiran ${t}.` }); setView({ kind: 'pick', ms, d: t }); return; }
      if (retry) { const s = await reload(); if (s && suffixMatches(s, t).length) return doResolveRef.current(text, false); }
      setScanMsg({ cls: 'bad', t: `Tidak ada nomor yang berakhiran ${t}. Coba ketik nomor lengkapnya.` });
      toast('Nomornya belum ketemu. Coba nomor lengkap ya.', true, 'thinking');
      return;
    }
    try { openCard(resolveCard(snap, text)); }
    catch (e) {
      // data mungkin belum termuat (mis. pelanggan baru daftar sendiri): muat ulang sekali
      if (retry && (e.code === 'INVALID_CARD' || e.code === 'NOT_MEMBER')) { const s = await reload(); if (s) { try { resolveCard(s, text); return doResolveRef.current(text, false); } catch { /* lanjut */ } } }
      if (e.code === 'NOT_MEMBER') { setView({ kind: 'create', phone: e.phone, nick: '' }); setScanMsg({ cls: '', t: 'Nomor ini belum punya kartu.' }); toast('Nomor baru! Buatkan kartunya yuk.', false, 'thinking'); return; }
      setScanMsg({ cls: 'bad', t: e.message }); toast(e.message, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, reload, toast]);
  const doResolveRef = useRef(doResolve);
  doResolveRef.current = doResolve;

  // ---------- kamera ----------
  const vid = useRef(), stream = useRef(null), raf = useRef(0);
  const [cam, setCam] = useState('off'); // off | on | err
  const stopCam = () => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setCam((c) => (c === 'on' ? 'off' : c)); };
  async function startCam() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = vid.current; v.srcObject = stream.current; setCam('on'); await v.play();
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!stream.current) return;
        if (v.videoWidth) {
          cv.width = v.videoWidth; cv.height = v.videoHeight; cx.drawImage(v, 0, 0);
          const r = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
          if (r?.data) { stopCam(); doResolveRef.current(r.data); return; }
        }
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { setCam('err'); }
  }
  useEffect(() => () => stopCam(), []);
  useEffect(() => { if (mode !== 'camera') stopCam(); setScanMsg(null); setCam('off'); }, [mode]);

  function decodeFile(file) {
    setScanMsg({ cls: '', t: 'Membaca QR...' });
    if (!/^image\//.test(file.type) || file.size > 12e6) { setScanMsg({ cls: 'bad', t: 'File harus gambar, maksimal 12 MB.' }); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 1400 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      const r = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
      if (r?.data) doResolveRef.current(r.data);
      else { setScanMsg({ cls: 'bad', t: 'QR tidak terbaca. Minta pelanggan memakai "Perbesar QR" lalu screenshot ulang, atau ketik card code.' }); toast('Hmm, QR-nya tidak terbaca.', true, 'thinking'); }
    };
    img.onerror = () => setScanMsg({ cls: 'bad', t: 'Gambar tidak bisa dibuka.' });
    img.src = url;
  }
  const [over, setOver] = useState(false);

  // ---------- perhitungan order ----------
  const listTotal = o.items.reduce((s, it) => s + (prodById.get(it.productId)?.price || 0) * it.qty, 0);
  const amount = o.manual ? o.amount : o.items.length ? listTotal : o.amount;
  const rwSel = o.redeem ? av.find((r) => r.id === o.rewardId) || av[0] : null;
  const rbps = rwSel ? rwSel.discountBps : settings.pct * 100;
  let disc = 0;
  if (o.redeem && amount) { disc = Math.floor((amount * rbps) / 10000); if (settings.cap > 0) disc = Math.min(disc, settings.cap); }
  const paidNow = (amount || 0) - disc;
  const earned = Math.floor(paidNow / settings.unit);
  const curStamps = live ? live.from : card?.stamps || 0;
  const tot = (card?.stamps || 0) + earned;
  const renew = card && o.items.length && snap.orders.some((x) => x.cardId === card.id && x.status === 'paid' && x.items.some((i) => o.items.some((y) => y.productId === i.productId)));
  const gap = settings.unit - (paidNow % settings.unit);
  const valid = amount && amount >= 1000 && amount <= 10000000;
  const setOrder = (patch) => setO((p) => ({ ...p, ...patch, bigOk: false, twinOk: false }));

  const addItem = (e, p) => {
    sparkle(e.clientX, e.clientY, 5);
    setO((s) => {
      const items = s.items.some((x) => x.productId === p.id) ? s.items.map((x) => (x.productId === p.id ? { ...x, qty: Math.min(50, x.qty + 1) } : x)) : [...s.items, { productId: p.id, qty: 1 }];
      return { ...s, items, manual: false, amount: null, bigOk: false, twinOk: false };
    });
  };
  const changeQty = (i, d) => setO((s) => {
    const items = s.items.map((x, k) => (k === i ? { ...x, qty: x.qty + d } : x)).filter((x) => x.qty > 0);
    return { ...s, items, manual: items.length ? s.manual : true, amount: items.length ? s.amount : s.manual ? s.amount : null, bigOk: false, twinOk: false };
  });

  async function submit(e) {
    e.preventDefault();
    if (!valid || !o.paid || busy) return;
    if (amount > 500000 && !o.bigOk) {
      setO((p) => ({ ...p, bigOk: true }));
      setOMsg({ cls: 'bad', t: `Nominal cukup besar (${idr(amount)}). Pastikan angkanya sesuai QRIS yang masuk, lalu tekan sekali lagi.` });
      toast('Nominal besar, cek lagi ya!', true, 'thinking'); return;
    }
    const twin = snap.orders.find((x) => x.cardId === card.id && x.status === 'paid' && x.paid === paidNow && Date.now() - Date.parse(x.createdAt) < 15 * 60e3);
    if (twin && !o.twinOk) {
      setO((p) => ({ ...p, twinOk: true, bigOk: true }));
      setOMsg({ cls: 'bad', t: `Pelanggan ini sudah dapat stamp untuk ${idr(paidNow)} pada ${dtfmt(twin.createdAt)} (${twin.ref}). Kalau ini pembayaran QRIS yang berbeda, tekan tombol sekali lagi.` });
      toast('Mirip transaksi barusan. Cek dulu ya!', true, 'thinking'); return;
    }
    setBusy(true); setOMsg(null);
    try {
      const res = await api.awardOrder({ cardId: card.id, ref: o.ref, amount, items: o.items.map((x) => ({ ...x })), verified: o.paid, rewardId: o.redeem ? rwSel?.id : null, method: o.method, note: o.note });
      const wasRedeem = o.redeem;
      notifyCard(card.token, { kind: wasRedeem ? 'redeem' : 'stamp', from: res.from, earned: res.earned, issued: res.issued, revision: res.revision });
      notifyAdmin({ kind: 'changed' });
      setO(blankOrder()); setUndo(null);
      setOMsg({ cls: 'ok', t: (wasRedeem ? 'Diskon voucher berhasil digunakan. ' : '') + (res.earned ? `+${res.earned} stamp berhasil ditambahkan.` : 'Order tercatat, 0 stamp.') + (res.issued ? ` ${res.issued} voucher baru terbit.` : '') });
      setMood((m) => ({ img: 'success', n: m.n + 1 }));
      if (res.earned) {
        setPow((p) => p + 1);
        setLive({ from: res.from, pos: res.from });
        await stageRef.current?.play(res.from, res.earned, { onTick: (pos) => setLive((l) => l && { ...l, pos: pos === 10 ? 10 : pos }) });
        setLive({ from: res.to, pos: res.to });
      }
      await reload();
      setLive(null);
    } catch (er) {
      setOMsg({ cls: 'bad', t: er.message }); setMood((m) => ({ img: 'error', n: m.n + 1, shake: true })); toast(er.message, true);
      if (er.code === 'DUPLICATE_AWARD') setO((p) => ({ ...p, ref: newRef() }));
    }
    setBusy(false);
  }

  function openUndo() {
    const now = Date.now();
    const op = snap.ops.filter((x) => x.cardId === card.id && !x.reversed && now - Date.parse(x.createdAt) <= UNDO_MS).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    if (!op) { setOMsg({ cls: 'bad', t: 'Tidak ada stamp dalam 5 menit terakhir yang bisa di-undo. Koreksi yang lebih lama perlu review owner.' }); toast('Belum ada stamp yang bisa di-undo.', true, 'thinking'); return; }
    const ord = snap.orders.find((x) => x.id === op.orderId);
    setUndo({ op, text: `Batalkan ${ord?.ref || 'order'}: −${op.earned} stamp${op.rewardIds.length ? ` dan ${op.rewardIds.length} voucher` : ''}?`, reason: '' });
  }
  async function doUndo() {
    try {
      const r = await api.undoOp(undo.op.id, undo.reason);
      notifyCard(card.token, { kind: 'undo', revision: r.revision });
      notifyAdmin({ kind: 'changed' });
      setUndo(null); await reload();
      setOMsg({ cls: 'ok', t: `Undo berhasil: −${r.removed} stamp. Ledger koreksi tercatat.` }); toast('Undo beres, stamp dikoreksi.', false, 'hello');
    } catch (er) { setOMsg({ cls: 'bad', t: er.message }); toast(er.message, true); }
  }

  async function create(e) {
    e.preventDefault();
    try {
      const r = await api.createCustomer(view.phone, view.nick);
      notifyAdmin({ kind: 'changed' });
      const s = await reload();
      const c = s?.cardById.get(r.cardId);
      if (c) openCard(c, { justCreated: true });
      toast('Kartu jadi! Kirim link-nya ke pelanggan ya.', false, 'success');
    } catch (er) { toast(er.message, true); }
  }
  async function activate() {
    try {
      const r = await api.activateCard(card.id);
      notifyCard(r.oldToken, { kind: 'activated' });
      notifyAdmin({ kind: 'changed' });
      await reload(); setView((v) => ({ ...v, justCreated: true }));
      toast('Kartu aktif! Kirim link-nya ke pelanggan.', false, 'success');
    } catch (er) { toast(er.message, true); }
  }
  function next() {
    setView({ kind: 'none' }); setO(blankOrder()); setOMsg(null); setUndo(null); setScanMsg(null); setCode('');
    if (mode === 'camera') startCam(); else if (mode === 'code') setTimeout(() => codeRef.current?.focus(), 30);
  }
  async function unlock(e) {
    e.preventDefault();
    try { await api.verifyPassword(pin); setLocked(false); setPinMsg(''); setPin(''); }
    catch (er) { setPinMsg(er.message); toast(er.message, true); }
  }
  useEffect(() => { if (locked) stopCam(); }, [locked]);

  const sugg = /^\d{4,8}$/.test(code.trim()) ? suffixMatches(snap, code.trim()) : null;
  const sample = snap.cards.slice(-10).reverse();

  // ---------- tampilan ----------
  let result;
  if (view.kind === 'pick') {
    result = (
      <>
        <div className="who"><div><b>{view.ms.length} nomor berakhiran {view.d}</b><div className="muted small">Pilih pelanggan yang benar</div></div><img className="mini" src="/assets/thinking.webp" alt="" /></div>
        <div className="list" style={{ marginTop: 12 }}>{view.ms.map((x) => (
          <button key={x.card.id} type="button" className="item pick" onClick={() => openCard(snap.cardById.get(x.card.id) || x.card)}>
            <div style={{ textAlign: 'left' }}><b>{label(x.cu)}</b><span className="small muted"><Hl phone={x.cu.phone} d={view.d} /> · {x.cu.code}</span></div>
            <span className={'pill ' + (x.card.status === 'pending' ? 'av' : 'ok')}>{x.card.status === 'pending' ? 'Menunggu aktivasi' : x.card.stamps + '/10 stamp'}</span>
          </button>
        ))}</div>
      </>
    );
  } else if (view.kind === 'create') {
    result = (
      <>
        <div className="who"><div><b>Member baru</b><div className="muted small">{fmtPhone(view.phone)}</div></div><img className="mini" src="/assets/hello.webp" alt="" /></div>
        <p className="muted" style={{ fontWeight: 700 }}>Nomor ini belum punya kartu. Buat kartunya, lalu kirim link kartu ke pelanggan lewat WhatsApp.</p>
        <form onSubmit={create}>
          <label className="f"><span>Nama panggilan (opsional)</span><input type="text" maxLength={30} placeholder="mis. Rina" value={view.nick} onChange={(e) => setView({ ...view, nick: e.target.value })} /></label>
          <div className="acts"><button className="btn pri">Buat kartu</button><button className="btn ghost" type="button" onClick={() => setView({ kind: 'none' })}>Batal</button></div>
        </form>
      </>
    );
  } else if (card && card.status === 'pending') {
    result = (
      <>
        <div className="who"><div><b>{label(cu)}</b><div className="muted small">{fmtPhone(cu.phone)} · {card.code}</div></div><img className="mini" src="/assets/thinking.webp" alt="" /></div>
        <div className="cardwrap"><CardStage card={card} customer={{ ...cu, phoneMasked: maskPhone(cu.phone) }} settings={settings} theme={theme} sm /></div>
        <div className="undo" style={{ borderColor: '#f5d68e', background: '#fff8e3' }}><b>Menunggu aktivasi · {card.actCode}</b><p className="small" style={{ margin: '4px 0 0' }}>Pelanggan daftar sendiri dari website. Aktifkan hanya jika pesan berisi kode ini benar-benar datang dari nomor {fmtPhone(cu.phone)} di WhatsApp Orinimo.</p></div>
        <div className="acts" style={{ marginTop: 14 }}><button className="btn pri" onClick={activate}>Aktifkan kartu</button><button className="btn ghost" onClick={next}>Scan next</button></div>
      </>
    );
  } else if (card) {
    const mimg = mood.img || (av.length || view.justCreated ? 'success' : 'hello');
    const ordersPaid = snap.orders.filter((x) => x.cardId === card.id && x.status === 'paid').length;
    result = (
      <>
        <Pow key={pow} id="powScan" go={pow > 0} style={{ opacity: pow ? 1 : 0 }} />
        <div className="who"><div><b>{label(cu)}</b><div className="muted small">{fmtPhone(cu.phone)} · {card.code}</div></div>
          <img key={mood.n} className={'mini' + (mood.n ? (mood.shake ? ' shake' : ' boing') : '')} src={`/assets/${mimg}.webp`} alt="" /></div>
        {view.justCreated && <p className="msg ok" style={{ margin: '6px 0' }}>Kartu siap! Kirim link-nya sekarang supaya pelanggan bisa melihat kartunya.</p>}
        <a className={'btn ' + (view.justCreated ? 'pri' : 'mar')} style={{ width: '100%', marginTop: 8 }} href={waLink(cu.phone, cardMsg(cu, card.token, settings))} target="_blank" rel="noopener noreferrer">Kirim link kartu via WhatsApp</a>
        <div className="cardwrap"><CardStage ref={stageRef} card={card} customer={{ ...cu, phoneMasked: maskPhone(cu.phone) }} settings={settings} theme={theme} sm flipped stamps={live ? live.from : undefined} /></div>
        <div className="facts">
          <div><span>Stamp aktif</span><b>{live ? live.pos : curStamps}/10</b></div>
          <div><span>Voucher</span><b>{av.length}</b></div>
          <div><span>Order</span><b>{ordersPaid}</b></div>
        </div>
        <form onSubmit={submit} noValidate>
          <p className="small muted" style={{ margin: '0 0 10px' }}>No. order otomatis: <b>{o.ref}</b></p>
          <label className="f"><span>Total dibayar (sesuai nominal QRIS yang masuk)</span>
            <div className="money"><i>Rp</i><input type="text" inputMode="numeric" autoComplete="off" placeholder="0" value={amount ? amount.toLocaleString('id-ID') : ''}
              onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 8); setOrder({ amount: d ? +d : null, manual: d ? true : !o.items.length }); }} /></div>
          </label>
          <div className="qp"><span className="small muted" style={{ fontWeight: 800 }}>Isi cepat dari pricelist (opsional)</span>
            <div className="brands">{brands.map((b) => <button key={b} type="button" className={o.brand === b ? 'on' : ''} onClick={() => setO((p) => ({ ...p, brand: p.brand === b ? null : b }))}>{b}</button>)}</div>
            <div className="vars">{o.brand && products.filter((p) => p.brand === o.brand).map((p) => <button key={p.id} type="button" onClick={(e) => addItem(e, p)}>{p.name} <b>{kfmt(p.price)}</b></button>)}</div>
            <div className="cart">
              {o.items.map((it, i) => { const p = prodById.get(it.productId); return (
                <div className="crow" key={it.productId}><span>{p.brand} {p.name}</span>
                  <span className="qty"><button type="button" aria-label="Kurangi" onClick={() => changeQty(i, -1)}>−</button><b>{it.qty}</b><button type="button" aria-label="Tambah" onClick={() => changeQty(i, 1)}>+</button></span>
                  <b className="n">{idr(p.price * it.qty)}</b></div>
              ); })}
              {o.items.length > 0 && o.manual && o.amount !== listTotal && (
                <div className="crow warn"><span>Total diisi manual (pricelist {idr(listTotal)})</span><button type="button" className="linkb" onClick={() => setOrder({ manual: false, amount: null })}>Pakai total pricelist</button></div>
              )}
            </div>
          </div>
          {o.redeem && (
            <label className="f"><span>Voucher</span>
              <select value={rwSel?.id || ''} onChange={(e) => setOrder({ rewardId: e.target.value })}>{av.map((x) => <option key={x.id} value={x.id}>{x.code} · diskon {(x.discountBps || 1500) / 100}%</option>)}</select>
            </label>
          )}
          <label className="f"><span>Metode bayar</span>
            <select value={o.method} onChange={(e) => setOrder({ method: e.target.value })}><option>QRIS GoPay</option><option>Transfer bank</option><option>Lainnya</option></select>
          </label>
          <label className="f"><span>Catatan pembayaran (opsional)</span><input type="text" maxLength={80} placeholder="mis. masuk 14:05 di GoBiz" autoComplete="off" value={o.note} onChange={(e) => setOrder({ note: e.target.value })} /></label>
          <label className="chk"><input type="checkbox" checked={o.paid} onChange={(e) => setOrder({ paid: e.target.checked })} /> Dana sudah masuk (sudah dicek di GoBiz / mutasi)</label>
          <div className="preview">
            {!amount || amount < 1000 ? <div><span>Ketik total dibayar, atau pilih paket dari pricelist.</span></div>
              : amount > 10000000 ? <div><span>Maksimal Rp10.000.000 per transaksi.</span></div>
              : (<>
                {o.redeem && <><div><span>Harga sebelum diskon</span><b>{idr(amount)}</b></div><div><span>Diskon voucher {rbps / 100}%{settings.cap && disc === settings.cap ? ' (maks.)' : ''}</span><b>−{idr(disc)}</b></div></>}
                <div><span>{o.redeem ? 'Yang harus dibayar' : 'Total dibayar'}</span><b>{idr(paidNow)}</b></div>
                <div className="big"><span>Stamp preview</span><b>+{earned} stamp{earned === 1 ? '' : 's'}</b></div>
                <div><span>Progress</span><b>{card.stamps} → {tot % 10}/10{Math.floor(tot / 10) ? ` · ${Math.floor(tot / 10)} voucher baru` : ''}</b></div>
                <div className="small muted"><span>{o.items.length ? (renew ? 'Terdeteksi: renewal' : 'Terdeteksi: pembelian baru') : 'Tanpa paket: dicatat sebagai order lainnya'}</span><span>{gap < settings.unit ? `+${idr(gap)} lagi = +1 stamp` : ''}</span></div>
                {o.redeem && settings.minOrder > 0 && amount < settings.minOrder && <div className="small" style={{ color: 'var(--bad)' }}><span>Voucher perlu belanja minimal {idr(settings.minOrder)}.</span></div>}
              </>)}
          </div>
          <div className="acts">
            <button className="btn pri" type="submit" disabled={!valid || !o.paid || busy} title={!o.paid ? 'Centang dulu setelah dana masuk' : ''}>
              {busy ? 'Memproses...' : o.twinOk ? 'Ya, ini pembayaran lain — lanjut' : o.bigOk ? 'Ya, nominal sudah benar' : !valid ? 'Stamp' : o.redeem ? `Redeem & bayar ${idr(paidNow)}` : earned ? `Stamp ×${earned}` : 'Catat order (0 stamp)'}
            </button>
            <button className="btn" type="button" onClick={openUndo}>Undo stamp</button>
            <button className="btn mar" type="button" disabled={!av.length && !o.redeem} onClick={() => setOrder({ redeem: !o.redeem, rewardId: '' })}>{o.redeem ? 'Batal redeem' : 'Redeem'}</button>
            <button className="btn ghost" type="button" onClick={next}>Scan next</button>
          </div>
          {undo && (
            <div className="undo">
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{undo.text}</p>
              <label className="f"><span>Alasan koreksi</span><input type="text" autoFocus placeholder="mis. salah pilih pelanggan" value={undo.reason} onChange={(e) => setUndo({ ...undo, reason: e.target.value })} /></label>
              <div className="row"><button className="btn mar" type="button" onClick={doUndo}>Konfirmasi undo</button><button className="btn ghost" type="button" onClick={() => setUndo(null)}>Batal</button></div>
            </div>
          )}
          {oMsg && <p className={'msg ' + oMsg.cls}>{oMsg.t}</p>}
        </form>
      </>
    );
  } else {
    result = <Empty>Ketik nomor WA pelanggan, scan QR, atau masukkan card code.</Empty>;
  }

  return (
    <section className="view">
      <div className="who" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 12 }}><svg width="54" height="54" aria-hidden="true"><use href="#i-clap" /></svg><div><h1 style={{ margin: 0 }}>Scanner</h1><p className="lead" style={{ margin: 0 }}>Scan, cek, cap. Action!</p></div></div>
        <button className="btn ghost" type="button" onClick={() => setLocked(true)}>Lock</button>
      </div>
      <div className="scan">
        <div>
          <div className="modes" role="tablist">
            {[['camera', 'Camera'], ['photo', 'Photo'], ['code', 'Code']].map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
          </div>
          <div className={'scanarea' + (mode === 'photo' ? ' drop' : '') + (over ? ' over' : '')}
            onDragOver={(e) => { if (mode === 'photo') { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { if (mode !== 'photo') return; e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; f && decodeFile(f); }}>
            {mode === 'code' && (
              <>
                <form style={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); doResolve(code); }}>
                  <label className="f" style={{ textAlign: 'left' }}><span>4 angka terakhir nomor WA, nomor lengkap, card code, atau kode aktivasi</span>
                    <input ref={codeRef} type="text" placeholder="mis. 7801" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} /></label>
                  <div className="sugg">
                    {sugg && (sugg.length ? sugg.slice(0, 6).map((x) => (
                      <button key={x.card.id} type="button" onClick={() => openCard(x.card)}><b>{label(x.cu)}</b><span><Hl phone={x.cu.phone} d={code.trim()} /></span></button>
                    )) : <p>Belum ada nomor berakhiran {code.trim()}.</p>)}
                  </div>
                  <button className="btn pri" style={{ width: '100%' }}>Cari / buat kartu</button>
                </form>
                {sample.length > 0 && (
                  <div style={{ width: '100%' }}>
                    <p className="small muted" style={{ margin: '14px 0 0' }}>{IS_DEMO ? 'Pelanggan contoh:' : 'Kartu terbaru:'}</p>
                    <div className="chips">{sample.map((c) => { const x = snap.cusById.get(c.customerId); return x && <button key={c.id} type="button" onClick={() => { setCode(fmtPhone(x.phone)); openCard(c); }}>{x.nickname || maskPhone(x.phone)}</button>; })}</div>
                  </div>
                )}
              </>
            )}
            {mode === 'photo' && (
              <div><p style={{ margin: '0 0 12px', fontWeight: 700 }}>Upload screenshot QR dari pelanggan</p>
                <label className="btn pri">Pilih gambar<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; f && decodeFile(f); }} /></label>
                <p className="small muted">atau tarik gambar ke sini. Gambar dibaca di perangkat ini dan tidak disimpan.</p></div>
            )}
            {mode === 'camera' && (
              <div>
                <video ref={vid} playsInline muted hidden={cam !== 'on'} />
                {cam !== 'on' && (cam === 'err'
                  ? <p className="msg bad">Kamera tidak bisa dipakai di sini (izin ditolak atau tidak tersedia). Gunakan mode Photo atau Code.</p>
                  : <div><p className="muted">Kamera belakang dipakai jika tersedia.</p><button className="btn pri" type="button" onClick={startCam}>Nyalakan kamera</button></div>)}
              </div>
            )}
          </div>
          {scanMsg && <p className={'msg onbg ' + scanMsg.cls} style={{ width: 'fit-content' }}>{scanMsg.t}</p>}
        </div>
        <div className="panel b" ref={resultRef} style={locked ? { visibility: 'hidden' } : undefined}>{result}</div>
        {locked && (
          <div className="lock">
            <form className="panel" onSubmit={unlock}>
              <img src="/assets/thinking.webp" alt="" />
              <h2>Scanner terkunci</h2>
              <p className="small muted">Data pelanggan disembunyikan. {IS_DEMO ? 'PIN demo: 1234' : 'Masukkan password akun admin untuk membuka.'}</p>
              <label className="f"><span>{IS_DEMO ? 'PIN' : 'Password'}</span><input type="password" autoFocus inputMode={IS_DEMO ? 'numeric' : undefined} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
              <button className="btn pri" style={{ width: '100%' }}>Buka</button>
              <p className="msg bad">{pinMsg}</p>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
