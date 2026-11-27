// Kartu member pelanggan: /k/:token
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { subscribeCard } from '../lib/realtime.js';
import { idr, dfmt, reduceMotion, sleep } from '../lib/format.js';
import { qrSvg, qrPayload } from '../lib/qr.js';
import { activationLink, oname, progressText, saveLastToken, getLastToken, clearLastToken } from '../lib/messages.js';
import { useAppData } from '../context/AppData.jsx';
import { useUi } from '../context/Ui.jsx';
import CardStage from '../components/CardStage.jsx';
import { Empty, Loading, Modal, Mascot, Pow } from '../components/Bits.jsx';
import { HowItWorks } from './Home.jsx';

export default function CardPage() {
  const { token } = useParams();
  const { settings, theme } = useAppData();
  const { toast, party } = useUi();
  const [data, setData] = useState(undefined); // undefined = memuat, null = tidak ada
  const [notice, setNotice] = useState(null);
  const [anim, setAnim] = useState(null); // {from, earned, issued}
  const [lines, setLines] = useState(null); // teks progress saat animasi
  const [img, setImg] = useState('hello');
  const [bump, setBump] = useState(0);
  const [pow, setPow] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState('rewards');
  const [qr, setQr] = useState(false);
  const [nm, setNm] = useState(null); // {v, err}
  const [skipShow, setSkipShow] = useState(false);
  const stageRef = useRef();
  const skip = useRef(false);
  const lineI = useRef(0);
  const revRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await api.getCard(token);
      setData(d);
      if (d?.card) { saveLastToken(token); revRef.current = d.card.revision; }
      else if (getLastToken() === token) clearLastToken();
      return d;
    } catch (e) { toast(e.message, true); setData((x) => (x === undefined ? null : x)); return null; }
  }, [token, toast]);

  useEffect(() => { setData(undefined); setNotice(null); load(); }, [load]);

  // stamp baru dari admin → ambil ulang data lalu mainkan animasinya
  useEffect(() => {
    const off = subscribeCard(token, async (ev) => {
      if (!ev) return;
      if (ev.kind === 'activated' || ev.kind === 'reissued') {
        setNotice(ev.kind === 'activated'
          ? 'Kartumu sudah aktif! Admin mengirim link kartu barumu lewat WhatsApp. Buka link itu ya, link ini sudah tidak dipakai lagi.'
          : 'Link kartu ini sudah diganti admin. Buka link terbaru yang dikirim lewat WhatsApp. Stamp dan voucher kamu tetap aman.');
        await load();
        return;
      }
      const before = revRef.current;
      const d = await load();
      if (!d?.card || d.card.revision <= before) return;
      const from = Number(ev.from), earned = Number(ev.earned), issued = Number(ev.issued) || 0;
      // cocokkan isi pesan dengan data asli sebelum menganimasikan
      const valid = (ev.kind === 'stamp' || ev.kind === 'redeem') && Number.isInteger(from) && Number.isInteger(earned) && earned > 0 && earned <= 1000 &&
        (from + earned) % 10 === d.card.stamps && Math.floor((from + earned) / 10) === issued;
      if (valid) setAnim({ from, earned, issued, n: Date.now() });
      else if (ev.kind === 'undo') toast('Ada koreksi stamp dari admin.', false, 'hello');
    });
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { off(); document.removeEventListener('visibilitychange', onVis); };
  }, [token, load, toast]);

  // jalankan animasi cap stamp
  useEffect(() => {
    if (!anim || !data?.card) return;
    let dead = false;
    const { from, earned, issued } = anim;
    const pct = settings.pct;
    skip.current = false;
    setSkipShow(earned >= 3);
    setImg('thinking');
    setLines({ ...progressText(from, 0, pct), r: `Eh, ada ${earned} stamp baru datang...` });
    setPow((p) => p + 1);
    (async () => {
      await sleep(reduceMotion() ? 0 : 500);
      if (dead) return;
      await stageRef.current?.play(from, earned, {
        skip: () => skip.current || dead,
        onTick: (pos, k) => {
          if (dead) return;
          if (k === 1) { setImg('success'); setBump((b) => b + 1); }
          if (pos >= 10) { setLines({ p: '10/10 stamps — reward unlocked!', r: `Yeay! Voucher diskon ${pct}% kebuka!` }); setPow((p) => p + 1); }
          else setLines({ p: progressText(pos, 0, pct).p, r: `Pop! +${earned} stamp masuk!` });
        },
      });
      if (dead) return;
      setSkipShow(false); setLines(null); setAnim(null);
      if (issued > 0) {
        const rs = data.rewards.filter((r) => r.status === 'AVAILABLE').sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)).slice(0, issued);
        setTimeout(() => party({ pct: (rs[0]?.discountBps || pct * 100) / 100, codes: rs.map((r) => r.code), name: data.customer.nickname }), 250);
      }
    })();
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);

  if (data === undefined) return <Loading text="Membuka kartu…" />;
  if (!data || data.revoked) {
    return (
      <section className="view">
        <div className="panel center" style={{ maxWidth: 560, margin: '30px auto' }}>
          <Empty img={data?.revoked ? 'thinking' : 'error'}>
            {data?.revoked
              ? <>Link kartu ini sudah diganti. {notice || 'Buka link terbaru yang dikirim admin lewat WhatsApp.'}</>
              : 'Kartu tidak ditemukan. Pastikan link yang kamu buka lengkap.'}
          </Empty>
          <Link className="btn pri" to="/">Minta link baru</Link>
        </div>
      </section>
    );
  }

  const { card, customer, rewards, orders } = data;
  const pending = card.status === 'pending';
  const av = rewards.filter((r) => r.status === 'AVAILABLE').length;
  const shown = anim ? anim.from : card.stamps;
  const base = pending
    ? { p: 'Kartu menunggu aktivasi', r: `Kirim kode ${card.actCode} ke WhatsApp Orinimo, lalu admin akan mengaktifkan kartumu.` }
    : progressText(card.stamps, av, settings.pct);
  const L = lines || base;
  const meter = /^(\d+)\/10/.exec(L.p);
  const mascotImg = anim ? img : pending ? 'thinking' : av ? 'success' : img === 'thinking' ? 'hello' : img;

  const talk = () => {
    const T = [`Pop! Tinggal ${10 - card.stamps} stamp lagi menuju diskon ${settings.pct}%.`, 'Ketuk kartunya, QR-mu ada di belakang!', `Setiap ${idr(settings.unit)} = 1 stamp. Gampang kan?`, 'Halo! Aku maskot Orinimo. Senang ketemu kamu!', 'Habis bayar QRIS, admin langsung kasih stamp lewat nomor WA-mu.'];
    if (!anim) setLines({ p: base.p, r: T[lineI.current++ % T.length] });
    setBump((b) => b + 1);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(card.code); toast('Card code disalin: ' + card.code); } catch { toast('Card code: ' + card.code); } };
  const saveName = async (e) => {
    e.preventDefault();
    const v = nm.v.replace(/\s+/g, ' ').trim();
    if (v && !/^[\p{L}\p{N} .,'-]{1,30}$/u.test(v)) { setNm({ ...nm, err: "Pakai huruf, angka, spasi, atau tanda . , ' - saja (maks. 30)." }); return; }
    try { await api.setNickname(token, v); setNm(null); await load(); toast(v ? `Halo, ${v}! Nama di kartu sudah diganti.` : 'Kartu kembali tampil sebagai Member Orinimo.', false, 'success'); }
    catch (er) { setNm({ ...nm, err: er.message }); }
  };

  return (
    <section className="view">
      <div className="marquee">
        <small>NOW SHOWING</small>
        <h1>Kartu Member {customer.nickname || 'Orinimo'}</h1>
        <button className="btn namebtn" type="button" onClick={() => setNm({ v: customer.nickname || '', err: '' })}>Ubah nama di kartu</button>
        <p>Belanja {idr(settings.unit)} = 1 stamp. Kumpulkan 10 stamp, dapat diskon {settings.pct}%!</p>
      </div>
      {notice && <p className="msg ok onbg" style={{ width: 'fit-content', margin: '0 auto 14px' }}>{notice}</p>}
      <div className="panel stagepanel">
        <Pow key={pow} id="powCard" go={pow > 0} />
        <div className={'cardwrap' + (flipped ? ' flipped' : '')}>
          <CardStage ref={stageRef} card={card} customer={customer} settings={settings} theme={theme} idle stamps={shown} onFlip={setFlipped} />
          <button className="btn ghost" type="button" onClick={() => stageRef.current?.flip()}>{flipped ? 'Lihat sisi depan' : 'Balik kartu'}</button>
          <p className="hint">atau ketuk kartunya</p>
          <div className="talk">
            <Mascot img={mascotImg} bump={bump} onClick={talk} label="Maskot Orinimo, ketuk untuk menyapa" />
            <div className="bubble" aria-live="polite">
              <div className="progress">{L.p}</div>
              <div className="meter"><i style={{ width: (meter ? Math.min(100, +meter[1] * 10) : 0) + '%' }} /></div>
              <div className="rewardline">{L.r}</div>
            </div>
          </div>
          {skipShow && <button className="btn ghost skip" type="button" onClick={() => { skip.current = true; }}>Lewati animasi</button>}
          <div className="wallet" aria-label="Opsi kartu">
            <button className="btn" disabled>Add to Apple Wallet<small>Segera hadir</small></button>
            <button className="btn" disabled>Add to Google Wallet<small>Segera hadir</small></button>
            <button className="btn" disabled>Email card backup<small>Email belum terhubung</small></button>
          </div>
          <div className="tools">
            {pending && <a className="btn pri" target="_blank" rel="noopener noreferrer" href={activationLink(card.actCode)}>Aktifkan via WhatsApp</a>}
            <button className="btn ghost" type="button" onClick={copy}>Salin card code</button>
            <button className="btn ghost" type="button" onClick={() => setQr(true)}>Perbesar QR</button>
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {[['rewards', 'Tiket voucher'], ['history', 'Riwayat'], ['terms', 'Ketentuan']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div id="tabBody">
        {tab === 'rewards' && (rewards.length ? (
          <>
            <p className="small muted onbg" style={{ width: 'fit-content' }}>Sebutkan kode voucher ke admin saat order berikutnya. Maksimal 1 voucher per transaksi; voucher tidak bisa diuangkan.</p>
            <div className="list">{rewards.map((r) => (
              <div className="item tix" key={r.id}>
                <div><b>Tiket diskon {(r.discountBps || 1500) / 100}% · {r.code}</b><span className="small muted">Terbit {dfmt(r.issuedAt)}{r.redeemedAt ? ' · dipakai ' + dfmt(r.redeemedAt) : ''}</span></div>
                <span className={'pill' + (r.status === 'AVAILABLE' ? ' av' : '')}>{r.status === 'AVAILABLE' ? 'Tersedia' : 'Sudah dipakai'}</span>
              </div>
            ))}</div>
          </>
        ) : <Empty>Belum ada voucher. Kumpulkan 10 stamp untuk diskon {settings.pct}%.</Empty>)}
        {tab === 'history' && (orders.length ? (
          <div className="list">{orders.map((o) => (
            <div className="item" key={o.id}>
              <div><b>{oname(o)}</b><span className="small muted">{dfmt(o.createdAt)} · {o.items.length ? (o.type === 'renewal' ? 'Renewal' : 'Pembelian') : 'Lainnya'} · {o.ref}{o.discount ? ' · voucher −' + idr(o.discount) : ''}</span></div>
              <div className="r"><b>{idr(o.paid)}</b><span className={'pill ' + (o.status === 'reversed' ? 'x' : 'ok')}>{o.status === 'reversed' ? 'Dibatalkan' : '+' + o.earned + ' stamp'}</span></div>
            </div>
          ))}</div>
        ) : <Empty>Belum ada transaksi.</Empty>)}
        {tab === 'terms' && (
          <div className="panel"><h2>Ketentuan program</h2>
            <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
              <li>Setiap kelipatan {idr(settings.unit)} dari nominal eligible yang dibayar dalam satu transaksi = 1 stamp (dibulatkan ke bawah).</li>
              <li>Sisa nominal di bawah {idr(settings.unit)} tidak dibawa ke transaksi berikutnya.</li>
              <li>Setiap 10 stamp menghasilkan 1 voucher diskon {settings.pct}%{settings.cap ? ` (maks. potongan ${idr(settings.cap)})` : ''}. Kelebihan stamp lanjut ke siklus berikutnya.</li>
              <li>Voucher dipakai di transaksi berikutnya{settings.minOrder ? ` dengan belanja minimal ${idr(settings.minOrder)}` : ''}, maksimal 1 voucher per transaksi, tidak digabung promo lain, dan tidak bisa diuangkan.</li>
              <li>Transaksi yang memakai voucher tetap mendapat stamp dari nominal akhir yang dibayar.</li>
              <li>Stamp hanya diberikan untuk pembelian/renewal yang dananya sudah masuk dan dicek admin.</li>
              <li>Satu nomor WhatsApp = satu kartu. Link kartu bersifat pribadi; jika tersebar, minta admin menerbitkan link baru.</li>
            </ul>
            <p className="small muted" style={{ marginBottom: 0 }}>Voucher yang sudah terbit tetap memakai persentase diskon saat voucher itu diterbitkan.</p>
          </div>
        )}
      </div>
      <HowItWorks />

      <Modal open={qr} onClose={() => setQr(false)}>
        <div dangerouslySetInnerHTML={{ __html: qrSvg(qrPayload(card.token)) }} />
        <p style={{ fontFamily: 'Fredoka,sans-serif', fontWeight: 600, fontSize: 22, margin: '12px 0 4px' }}>{card.code}</p>
        <p className="small muted" style={{ margin: '0 0 14px' }}>Mode QR stabil: screenshot layar ini dan kirim ke admin Orinimo.</p>
        <button className="btn pri" style={{ width: '100%' }} onClick={() => setQr(false)}>Tutup</button>
      </Modal>
      <Modal open={!!nm} onClose={() => setNm(null)}>
        {nm && (
          <form onSubmit={saveName} noValidate>
            <img src="/assets/hello.webp" alt="" style={{ width: 110, margin: '-70px auto 0', display: 'block' }} />
            <h2 style={{ margin: '6px 0 4px' }}>Mau dipanggil siapa?</h2>
            <p className="small muted" style={{ margin: '0 0 14px' }}>Nama ini tampil di kartumu. Opsional, kosongkan untuk tampil sebagai "Member Orinimo".</p>
            <label className="f" style={{ textAlign: 'left' }}><span>Nama panggilan</span>
              <input type="text" maxLength={30} autoComplete="nickname" placeholder="mis. Rina" value={nm.v} onChange={(e) => setNm({ v: e.target.value, err: '' })} />
            </label>
            <p className="msg bad" style={{ margin: '-6px 0 10px' }}>{nm.err}</p>
            <div className="acts"><button className="btn pri">Simpan</button><button className="btn ghost" type="button" onClick={() => setNm(null)}>Batal</button></div>
          </form>
        )}
      </Modal>
    </section>
  );
}
