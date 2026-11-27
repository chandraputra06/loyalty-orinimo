import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { idr, dfmt, label } from '../../lib/format.js';
import { oname } from '../../lib/messages.js';
import { useAdmin } from './AdminLayout.jsx';
import { useAppData } from '../../context/AppData.jsx';
import { useUi } from '../../context/Ui.jsx';
import { notifyAdmin } from '../../lib/realtime.js';
import { IS_DEMO } from '../../config.js';

const D = 864e5;
const T = (s) => Date.parse(s);

function analytics(S, R, prodName) {
  const now = Date.now(), start = now - R * D;
  const valid = S.orders.filter((o) => o.status === 'paid'), inR = valid.filter((o) => T(o.createdAt) >= start);
  const byCus = {};
  inR.forEach((o) => { byCus[o.customerId] = (byCus[o.customerId] || 0) + 1; });
  const counts = Object.values(byCus), active = counts.length, rep = counts.filter((n) => n >= 2).length;
  const freq = [['1 pembelian', (n) => n === 1], ['2–4 pembelian', (n) => n >= 2 && n <= 4], ['5–9 pembelian', (n) => n >= 5 && n <= 9], ['10+ pembelian', (n) => n >= 10]].map(([l, f]) => [l, counts.filter(f).length]);
  const reo = {}, seen = {};
  for (const o of [...valid].sort((a, b) => T(a.createdAt) - T(b.createdAt))) {
    const s = seen[o.customerId] || (seen[o.customerId] = new Set());
    const ps = new Set(o.items.map((i) => i.productId));
    if (T(o.createdAt) >= start) for (const p of ps) if (s.has(p)) reo[p] = (reo[p] || 0) + 1;
    ps.forEach((p) => s.add(p));
  }
  const names = {};
  valid.forEach((o) => o.items.forEach((i) => { names[i.productId] = i.name; }));
  return {
    R, start, inR, active, rep, freq,
    reo: Object.entries(reo).sort((a, b) => b[1] - a[1]).map(([p, n]) => [prodName(p) || names[p] || p, n]),
    earnIn: S.ledger.filter((l) => l.type === 'EARN' && T(l.createdAt) >= start).reduce((s, l) => s + l.delta, 0),
    rwI: S.rewards.filter((r) => T(r.issuedAt) >= start && r.status !== 'CANCELLED').length,
    rwR: S.rewards.filter((r) => r.status === 'REDEEMED' && r.redeemedAt && T(r.redeemedAt) >= start).length,
    members: S.customers.length, newM: S.customers.filter((c) => T(c.createdAt) >= start).length,
    renew: inR.filter((o) => o.type === 'renewal').length, disc: inR.reduce((s, o) => s + o.discount, 0), net: inR.reduce((s, o) => s + o.paid, 0),
  };
}

function ActChart({ A }) {
  const ref = useRef();
  const [[W, H], setSize] = useState([0, 260]);
  useEffect(() => {
    const ro = new ResizeObserver(() => setSize([ref.current?.clientWidth || 0, ref.current?.clientHeight || 260]));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  let body = null;
  if (W) {
    const step = A.R > 30 ? 7 : 1, nb = Math.ceil(A.R / step), bk = Array.from({ length: nb }, () => [0, 0]);
    A.inR.forEach((o) => { const i = Math.min(nb - 1, Math.max(0, Math.floor((T(o.createdAt) - A.start) / D / step))); bk[i][o.type === 'renewal' ? 1 : 0]++; });
    const mx = Math.max(2, ...bk.map((b) => b[0] + b[1])), pl = 28, pb = 26, cw = (W - pl) / nb, bw = Math.max(2, cw * 0.66), y = (v) => H - pb - (v / mx) * (H - pb - 10);
    const ticks = [];
    for (let t = 0; t <= mx; t += Math.max(1, Math.ceil(mx / 4))) ticks.push(t);
    const lab = W < 520 ? [0, nb - 1] : [0, Math.floor(nb / 3), Math.floor((nb * 2) / 3), nb - 1];
    body = (
      <>
        {ticks.map((t) => <g key={t}><line x1={pl} x2={W} y1={y(t)} y2={y(t)} stroke="#f3d9d6" strokeDasharray="4 4" /><text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#9c3b4e">{t}</text></g>)}
        {bk.map(([p, r], i) => { const x = pl + i * cw + (cw - bw) / 2; return (
          <g key={i}>
            {p > 0 && <rect x={x} y={y(p)} width={bw} height={H - pb - y(p)} rx="5" fill="#ffd166"><title>{p} pembelian baru</title></rect>}
            {r > 0 && <rect x={x} y={y(p + r)} width={bw} height={y(p) - y(p + r)} rx="5" fill="#ef4b4f"><title>{r} renewal</title></rect>}
          </g>); })}
        {lab.map((i, j) => <text key={j} x={j === lab.length - 1 ? W - 2 : pl + i * cw + cw / 2} y={H - 8} textAnchor={j === lab.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#9c3b4e">{dfmt(A.start + i * step * D)}</text>)}
      </>
    );
  }
  return <div className="fig" ref={ref}><svg>{body}</svg></div>;
}

const Bars = ({ rows, empty }) => {
  const mx = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <div className="empty">{empty}</div>;
  return rows.map(([l, n]) => <div className="bar" key={l}><span>{l}</span><b>{n}</b><div className="t"><i style={{ width: (n / mx) * 100 + '%' }} /></div></div>);
};

export default function Dashboard() {
  const { snap, reload } = useAdmin();
  const { settings, products } = useAppData();
  const { toast } = useUi();
  const [R, setR] = useState(30);
  const pmap = useMemo(() => new Map(products.map((p) => [p.id, p.brand + ' ' + p.name])), [products]);
  const A = useMemo(() => analytics(snap, R, (id) => pmap.get(id)), [snap, R, pmap]);
  const rate = A.active ? Math.round((A.rep / A.active) * 100) : null;
  const K = [
    ['Total member', A.members, `+${A.newM} baru`], ['Pembelian', A.inR.length, `${A.renew} renewal`],
    ['Tracked net revenue', idr(A.net), 'setelah diskon voucher'], ['Repeat purchase rate', rate === null ? 'N/A' : rate + '%', `${A.active} pelanggan aktif`],
    ['Stamp diberikan', A.earnIn, 'entry EARN'], ['Voucher terbit', A.rwI, `diskon ${settings.pct}%`],
    ['Voucher ditukar', A.rwR, `${snap.rewards.filter((r) => r.status === 'AVAILABLE').length} masih tersedia`], ['Biaya diskon', idr(A.disc), 'potongan aktual'],
  ];
  const recent = [...snap.orders].sort((a, b) => T(b.createdAt) - T(a.createdAt)).slice(0, 8);

  return (
    <section className="view">
      <div className="dhead">
        <div><h1>{A.inR.length} pembelian dalam {A.R} hari terakhir</h1>
          <p className="lead" style={{ margin: 0 }}>{rate === null ? 'Belum ada pembelian di periode ini.' : `${A.rep} dari ${A.active} pelanggan aktif membeli lebih dari sekali (repeat purchase rate ${rate}%).`}</p></div>
        <label className="row small muted onbg" style={{ fontWeight: 800, padding: '4px 6px 4px 14px' }}>Periode
          <select value={R} onChange={(e) => setR(+e.target.value)}><option value="7">7 hari</option><option value="30">30 hari</option><option value="90">90 hari</option></select></label>
      </div>
      <div className="kpis">{K.map(([l, v, s]) => <div className="kpi" key={l}><span>{l}</span><b>{v}</b><small>{s}</small></div>)}</div>
      <div className="dgrid">
        <div className="panel"><h2>Aktivitas pembelian</h2><div className="legend"><span><i style={{ background: 'var(--butter)' }} />Pembelian baru</span><span><i style={{ background: 'var(--red)' }} />Renewal</span></div><ActChart A={A} /></div>
        <div className="panel y"><h2>Purchase frequency</h2><p className="small muted" style={{ marginTop: -6 }}>Pelanggan aktif menurut jumlah pembelian di periode ini</p><div className="bars"><Bars rows={A.freq} /></div></div>
      </div>
      <div className="dgrid">
        <div className="panel b"><h2>Transaksi terbaru</h2>
          <div className="scroll"><table className="stack"><thead><tr><th>Tanggal</th><th>Ref</th><th>Pelanggan</th><th>Produk</th><th className="n">Dibayar</th><th className="n">Stamp</th></tr></thead>
            <tbody>{recent.map((o) => { const op = snap.opByOrder.get(o.id), cu = snap.cusById.get(o.customerId); return (
              <tr key={o.id}><td>{dfmt(o.createdAt)}</td><td>{o.ref}</td><td>{cu ? label(cu) : '—'}</td><td>{oname(o)}{o.discount ? <> <span className="pill av">voucher</span></> : null}</td><td className="n">{idr(o.paid)}</td>
                <td className="n">{o.status === 'reversed' ? <span className="pill x">undo</span> : '+' + (op?.earned ?? 0)}</td></tr>); })}</tbody></table></div></div>
        <div className="panel"><h2>Most reordered</h2><p className="small muted" style={{ marginTop: -6 }}>Order berisi produk yang pernah dibeli pelanggan yang sama</p><div className="bars"><Bars rows={A.reo} empty="Belum ada pembelian ulang di periode ini." /></div></div>
      </div>
      {IS_DEMO && (
        <p className="small muted onbg" style={{ width: 'fit-content' }}>Semua angka dihitung dari order, ledger dan voucher di data demo browser ini.{' '}
          <button className="btn ghost" style={{ minHeight: 38, padding: '4px 14px', fontSize: 13 }} onClick={async () => { api.resetDemo(); notifyAdmin({}); await reload(); toast('Data demo direset.', false, 'hello'); }}>Reset data demo</button></p>
      )}
    </section>
  );
}
