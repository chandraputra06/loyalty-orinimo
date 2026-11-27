import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { reduceMotion } from '../lib/format.js';

// Toast (notifikasi kecil bermaskot) + layar pesta saat kartu penuh.
const Ctx = createContext(null);

export function UiProvider({ children }) {
  const [t, setT] = useState({ msg: '', bad: false, img: 'success', show: false, n: 0 });
  const timer = useRef();
  const toast = useCallback((msg, bad = false, img) => {
    clearTimeout(timer.current);
    setT((p) => ({ msg, bad, img: img || (bad ? 'error' : 'success'), show: true, n: p.n + 1 }));
    timer.current = setTimeout(() => setT((p) => ({ ...p, show: false })), 3000);
  }, []);

  const [party, setParty] = useState(null);
  const openParty = useCallback((opts) => setParty({ ...opts, n: Date.now() }), []);

  return (
    <Ctx.Provider value={{ toast, party: openParty }}>
      {children}
      <div key={t.n} className={'toast' + (t.show ? ' show' : '') + (t.bad ? ' bad' : '')} role="status">
        <img src={`/assets/${t.img}.webp`} alt="" />
        <span>{t.msg}</span>
      </div>
      {party && <Party {...party} onClose={() => setParty(null)} />}
    </Ctx.Provider>
  );
}
export const useUi = () => useContext(Ctx);

function Party({ pct, codes, name, onClose: close }) {
  const canvas = useRef(), btn = useRef();
  const closeRef = useRef(close);
  closeRef.current = close;
  const onClose = () => closeRef.current();
  const [on, setOn] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setOn(true));
    btn.current?.focus({ preventScroll: true });
    document.querySelector('.cardhost .stage')?.classList.add('dance');
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    if (reduceMotion()) return () => removeEventListener('keydown', onKey);
    const cv = canvas.current, cx = cv.getContext('2d'), W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = [], r2 = (a, b) => a + Math.random() * (b - a), COL = ['#ef4b4f', '#ffd166', '#ff8fa3', '#7fd8b5', '#fff'];
    const fountain = (x, n) => { for (let i = 0; i < n; i++) P.push({ k: Math.random() < 0.6 ? 'pop' : 'heart', x, y: H + 20, vx: r2(-4.5, 4.5), vy: r2(-17, -10), r: r2(8, 16), rot: r2(0, 6), vr: r2(-0.2, 0.2), c: COL[i % 5] }); };
    const rain = (n) => { for (let i = 0; i < n; i++) P.push({ k: ['star', 'rib', 'rib', 'heart'][i % 4], x: r2(0, W), y: r2(-H * 0.6, -10), vx: r2(-1, 1), vy: r2(2, 4), r: r2(5, 10), rot: r2(0, 6), vr: r2(-0.15, 0.15), c: COL[i % 5], sw: r2(0, 6) }); };
    fountain(W * 0.25, 30); fountain(W * 0.75, 30); rain(70);
    const t1 = setTimeout(() => fountain(W * 0.5, 45), 700);
    const t2 = setTimeout(() => { fountain(W * 0.15, 20); fountain(W * 0.85, 20); }, 1500);
    const blobs = [[-0.4, 0.1, 0.55], [0.4, 0.1, 0.55], [0, -0.32, 0.6], [0, 0.3, 0.5]];
    const t0 = performance.now(); let raf, alive = true;
    const f = (t) => {
      cx.clearRect(0, 0, W, H);
      for (const p of P) {
        p.vy += p.k === 'rib' || p.k === 'star' ? 0.02 : 0.32;
        p.x += p.vx + (p.sw !== undefined ? Math.sin(t / 300 + p.sw) * 0.8 : 0); p.y += p.vy; p.rot += p.vr;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
        if (p.k === 'pop') {
          blobs.forEach(([a, b, r]) => { cx.beginPath(); cx.arc(a * p.r, b * p.r, r * p.r + 1.4, 0, 6.29); cx.fillStyle = '#e9a94a'; cx.fill(); });
          blobs.forEach(([a, b, r]) => { cx.beginPath(); cx.arc(a * p.r, b * p.r, r * p.r, 0, 6.29); cx.fillStyle = '#fff7e6'; cx.fill(); });
        } else if (p.k === 'heart') {
          const r = p.r; cx.beginPath(); cx.moveTo(0, r * 0.9); cx.bezierCurveTo(-r * 1.4, 0, -r * 0.7, -r * 1.1, 0, -r * 0.35); cx.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.4, 0, 0, r * 0.9); cx.fillStyle = '#ff8fa3'; cx.fill();
        } else if (p.k === 'star') {
          cx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? p.r * 0.45 : p.r, an = (i * Math.PI) / 5 - Math.PI / 2; cx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } cx.closePath(); cx.fillStyle = '#ffd166'; cx.fill();
        } else { cx.fillStyle = p.c; cx.fillRect(-p.r * 0.4, -p.r, p.r * 0.8, p.r * 2); }
        cx.restore();
      }
      if (alive && t - t0 < 5200) raf = requestAnimationFrame(f); else cx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(f);
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); removeEventListener('keydown', onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={'party' + (on ? ' on' : '')} role="dialog" aria-modal="true" aria-label="Kartu penuh, voucher terbuka" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <canvas id="partyfx" ref={canvas} aria-hidden="true" />
      <div className="rays" aria-hidden="true" />
      <div className="pbox">
        <img className="pmas" src="/assets/success.webp" alt="" />
        <h2 className="yay" aria-label="Yeay!">{'Yeay!'.split('').map((c, i) => <span key={i}>{c}</span>)}</h2>
        <p className="psub">{(name ? name + ', k' : 'K') + `artumu penuh! ${codes.length > 1 ? codes.length + ' voucher' : 'Voucher'} diskon terbuka.`}</p>
        <div className="pticket"><small>TIKET VOUCHER ORINIMO</small><b>{pct}% OFF</b><span>{codes.join(' · ')}</span></div>
        <p className="small muted" style={{ margin: '14px 0 16px' }}>Sebutkan kode ini ke admin di order berikutnya.</p>
        <button ref={btn} className="btn pri" type="button" style={{ width: '100%' }} onClick={onClose}>Asik, makasih!</button>
      </div>
    </div>
  );
}
