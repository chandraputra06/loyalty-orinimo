import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { notifyAdmin, notifyCard } from '../../lib/realtime.js';
import { idr, dfmt, fmtPhone, maskPhone, label, waLink, normPhone } from '../../lib/format.js';
import { cardMsg, oname } from '../../lib/messages.js';
import { useAdmin } from './AdminLayout.jsx';
import { useAppData } from '../../context/AppData.jsx';
import { useUi } from '../../context/Ui.jsx';
import CardStage from '../../components/CardStage.jsx';
import { Empty } from '../../components/Bits.jsx';

const T = (s) => (s ? Date.parse(s) : 0);

export default function Customers() {
  const { snap, reload } = useAdmin();
  const { settings, theme } = useAppData();
  const { toast } = useUi();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [add, setAdd] = useState({ phone: '', nick: '' });
  const [addMsg, setAddMsg] = useState(null);
  const [confirmReissue, setConfirmReissue] = useState(false);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return snap.customers.map((cu) => {
      const card = snap.cardByCus.get(cu.id);
      const os = snap.orders.filter((o) => o.customerId === cu.id && o.status === 'paid');
      return { cu, card, os, last: os.reduce((m, o) => Math.max(m, T(o.createdAt)), 0) };
    }).filter((r) => r.card)
      .filter((r) => !qq || [r.cu.nickname, r.cu.code, r.cu.phone, fmtPhone(r.cu.phone), '0' + r.cu.phone.slice(2), r.card.code].some((v) => String(v || '').toLowerCase().includes(qq)))
      .sort((a, b) => (b.card.status === 'pending') - (a.card.status === 'pending') || b.last - a.last);
  }, [snap, q]);
  const np = snap.cards.filter((c) => c.status === 'pending').length;

  async function addCustomer(e) {
    e.preventDefault();
    try {
      const r = await api.createCustomer(add.phone, add.nick);
      notifyAdmin({}); await reload();
      setSel(r.customerId); setAdd({ phone: '', nick: '' });
      setAddMsg({ cls: 'ok', t: 'Kartu dibuat. Kirim link-nya lewat tombol "Kirim link via WA".' }); toast('Kartu jadi!', false, 'success');
    } catch (er) {
      setAddMsg({ cls: 'bad', t: er.message }); toast(er.message, true);
      if (er.code === 'DUPLICATE_MEMBER') { const ph = normPhone(add.phone); const ex = snap.customers.find((c) => c.phone === ph); if (ex) setSel(ex.id); }
    }
  }

  const cu = sel && snap.cusById.get(sel);
  const card = cu && snap.cardByCus.get(cu.id);
  let detail = <Empty img="hello">Pilih pelanggan untuk melihat kartu dan riwayatnya.</Empty>;
  if (cu && card) {
    const os = snap.orders.filter((o) => o.customerId === cu.id).sort((a, b) => T(b.createdAt) - T(a.createdAt));
    const valid = os.filter((o) => o.status === 'paid');
    const life = snap.ledger.filter((l) => l.cardId === card.id).reduce((s, l) => s + (l.type === 'EARN' || l.type === 'REVERSAL' ? l.delta : 0), 0);
    const fav = {};
    valid.forEach((o) => o.items.forEach((i) => { fav[i.name] = (fav[i.name] || 0) + i.qty; }));
    const top = Object.entries(fav).sort((a, b) => b[1] - a[1])[0];
    const pend = card.status === 'pending';
    const activate = async () => {
      try { const r = await api.activateCard(card.id); notifyCard(r.oldToken, { kind: 'activated' }); notifyAdmin({}); await reload(); toast('Kartu aktif! Kirim link-nya ke pelanggan.', false, 'success'); }
      catch (er) { toast(er.message, true); }
    };
    const reissue = async () => {
      if (!confirmReissue) { setConfirmReissue(true); return; }
      try { const r = await api.reissueToken(card.id); notifyCard(r.oldToken, { kind: 'reissued' }); notifyAdmin({}); await reload(); setConfirmReissue(false); toast('Link & QR baru terbit. Yang lama sudah tidak berlaku; saldo tetap. Kirim link barunya via WA.', false, 'hello'); }
      catch (er) { toast(er.message, true); }
    };
    detail = (
      <>
        <div className="who"><b>{label(cu)}</b><span className="small muted">{cu.code}</span></div>
        <p className="small muted" style={{ margin: '2px 0 0' }}>{fmtPhone(cu.phone)} · {cu.source === 'self' ? 'daftar sendiri' : 'dibuat admin'} {dfmt(cu.createdAt)}</p>
        <div className="cardwrap"><CardStage card={card} customer={{ ...cu, phoneMasked: maskPhone(cu.phone) }} settings={settings} theme={theme} sm flipped /></div>
        <div className="facts"><div><span>Stamp seumur hidup</span><b>{life}</b></div><div><span>Belanja</span><b>{idr(valid.reduce((s, o) => s + o.paid, 0))}</b></div><div><span>Favorit</span><b style={{ fontSize: 14 }}>{top ? top[0] : '—'}</b></div></div>
        {pend && <div className="undo" style={{ borderColor: '#f5d68e', background: '#fff8e3', margin: '0 0 12px' }}><b>Menunggu aktivasi · {card.actCode}</b><p className="small" style={{ margin: '4px 0 0' }}>Aktifkan jika pesan berisi kode ini datang dari nomor {fmtPhone(cu.phone)}.</p></div>}
        <div className="row" style={{ marginBottom: 12 }}>
          {pend ? <button className="btn pri" onClick={activate}>Aktifkan kartu</button> : (
            <>
              <a className="btn pri" href={waLink(cu.phone, cardMsg(cu, card.token, settings))} target="_blank" rel="noopener noreferrer">Kirim link via WA</a>
              <button className="btn" onClick={() => nav('/admin/scanner', { state: { cardId: card.id } })}>Buka di scanner</button>
            </>
          )}
          <a className="btn" href={`/k/${card.token}`} target="_blank" rel="noopener noreferrer">Lihat sebagai pelanggan</a>
          {!pend && <button className={'btn ' + (confirmReissue ? 'mar' : 'ghost')} onClick={reissue}>{confirmReissue ? 'Yakin? Link lama jadi tidak berlaku' : 'Terbitkan link baru'}</button>}
        </div>
        <h2>Riwayat</h2>
        <div className="list">{os.length ? os.slice(0, 12).map((o) => (
          <div className="item" key={o.id}><div><b>{oname(o)}</b><span className="small muted">{dfmt(o.createdAt)} · {o.ref} · {o.type === 'renewal' ? 'Renewal' : 'Pembelian'}</span></div>
            <div className="r"><b>{idr(o.paid)}</b><span className={'pill ' + (o.status === 'reversed' ? 'x' : 'ok')}>{o.status === 'reversed' ? 'Undo' : '+' + (snap.opByOrder.get(o.id)?.earned ?? 0)}</span></div></div>
        )) : <div className="empty">Belum ada transaksi.</div>}</div>
      </>
    );
  }
  return (
    <section className="view">
      <h1>Database pelanggan</h1>
      <p className="lead">{snap.customers.length} member terdaftar{np ? `, ${np} menunggu aktivasi` : ''}. Klik baris untuk melihat kartu, riwayat, dan mengirim link via WhatsApp.</p>
      <div className="cust">
        <div className="panel">
          <form className="row" style={{ marginBottom: 6 }} onSubmit={addCustomer} noValidate>
            <input type="tel" inputMode="tel" placeholder="Nomor WA pelanggan baru" style={{ flex: '2 1 180px', width: 'auto' }} aria-label="Nomor WA pelanggan baru" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} />
            <input type="text" maxLength={30} placeholder="Nama panggilan (opsional)" style={{ flex: '1 1 150px', width: 'auto' }} aria-label="Nama panggilan" value={add.nick} onChange={(e) => setAdd({ ...add, nick: e.target.value })} />
            <button className="btn pri">Buat kartu</button>
          </form>
          {addMsg && <p className={'msg ' + addMsg.cls} style={{ margin: '0 0 10px' }}>{addMsg.t}</p>}
          <input type="text" className="search" placeholder="Cari nomor WA, nama panggilan, kode member atau card code" aria-label="Cari pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="scroll"><table className="stack"><thead><tr><th>Pelanggan</th><th className="n">Stamp</th><th className="n">Voucher</th><th className="n">Order</th><th>Terakhir beli</th></tr></thead>
            <tbody>{rows.length ? rows.map((r) => {
              const go = () => { setSel(r.cu.id); setConfirmReissue(false); };
              return (
                <tr key={r.cu.id} className={'click' + (r.cu.id === sel ? ' sel' : '')} tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
                  <td><b>{label(r.cu)}</b> {r.card.status === 'pending' && <span className="pill av">Menunggu aktivasi</span>}<br /><span className="small muted">{fmtPhone(r.cu.phone)} · {r.cu.code}</span></td>
                  <td className="n">{r.card.stamps}/10</td><td className="n">{snap.avail(r.card.id).length}</td><td className="n">{r.os.length}</td><td>{r.last ? dfmt(r.last) : '—'}</td>
                </tr>);
            }) : <tr><td colSpan={5} className="empty">Tidak ada pelanggan yang cocok.</td></tr>}</tbody></table></div>
        </div>
        <div className="panel y detail">{detail}</div>
      </div>
    </section>
  );
}
