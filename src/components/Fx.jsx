// Efek latar bertema bioskop: hujan popcorn, hiasan, pita film, maskot mengintip, tirai pembuka.
import { useEffect, useRef, useState } from 'react';
import { reduceMotion, idr } from '../lib/format.js';
import { sparkle } from '../lib/stage.js';
import { DECOR } from './sprite.js';
import { useUi } from '../context/Ui.jsx';
import { useAppData } from '../context/AppData.jsx';

export function BgFx() {
  const ref = useRef();
  useEffect(() => {
    const reduce = reduceMotion();
    const cv = ref.current, cx = cv.getContext('2d');
    let W = 0, H = 0, P = [], B = [], px = -999, py = -999, raf, alive = true;
    const rand = (a, b) => a + Math.random() * (b - a);
    const mk = (kind, x, y, pop) => ({ kind, x: x ?? rand(0, W), y: y ?? rand(-H, H), r: kind === 'pop' ? rand(11, 20) : kind === 'star' ? rand(4, 8) : rand(6, 9), vx: rand(-0.15, 0.15), vy: kind === 'star' ? rand(-0.05, 0.05) : rand(0.18, 0.5), rot: rand(0, 6.28), vr: rand(-0.01, 0.01), ph: rand(0, 6.28), s: pop ? 0 : 1, ox: 0, oy: 0 });
    const size = () => { const dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const init = () => { size(); P = []; for (let i = 0; i < (W < 600 ? 12 : 24); i++) P.push(mk('pop', null, rand(0, H))); for (let i = 0; i < (W < 600 ? 7 : 14); i++) P.push(mk('star', null, rand(0, H))); for (let i = 0; i < 4; i++) P.push(mk('heart', null, rand(0, H))); };
    const pop = (x, y, r) => { const c = ['#fff6e0', '#ffd166', '#ff8fa3', '#ef4b4f', '#fff']; for (let i = 0; i < 12; i++) { const a = rand(0, 6.28), v = rand(1.5, 4); B.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, r: rand(2, r / 3.5), c: c[i % 5], life: 1 }); } };
    const blobs = [[-0.42, 0.12, 0.56], [0.42, 0.12, 0.56], [0, -0.32, 0.62], [0, 0.32, 0.5], [-0.2, -0.1, 0.4]];
    const drawPop = (p) => {
      const r = p.r * p.s; cx.save(); cx.translate(p.x + p.ox, p.y + p.oy); cx.rotate(p.rot);
      cx.beginPath(); cx.ellipse(0, r * 1.05, r * 0.8, r * 0.22, 0, 0, 6.29); cx.fillStyle = 'rgba(201,52,58,.10)'; cx.fill();
      blobs.forEach(([dx, dy, rr]) => { cx.beginPath(); cx.arc(dx * r, dy * r, rr * r + 1.6, 0, 6.29); cx.fillStyle = '#e9a94a'; cx.fill(); });
      blobs.forEach(([dx, dy, rr]) => { const g = cx.createRadialGradient(dx * r - rr * r * 0.35, dy * r - rr * r * 0.35, rr * r * 0.1, dx * r, dy * r, rr * r); g.addColorStop(0, '#fffdf6'); g.addColorStop(0.7, '#ffefc8'); g.addColorStop(1, '#ffd98c'); cx.beginPath(); cx.arc(dx * r, dy * r, rr * r, 0, 6.29); cx.fillStyle = g; cx.fill(); });
      cx.beginPath(); cx.arc(0.18 * r, 0.1 * r, 0.16 * r, 0, 6.29); cx.fillStyle = '#ffc24d'; cx.fill(); cx.restore();
    };
    const drawStar = (p, t) => { const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + p.ph)), r = p.r * (0.7 + 0.3 * a); cx.save(); cx.globalAlpha = a; cx.translate(p.x, p.y); cx.rotate(p.rot); cx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.28 : r, an = (i * Math.PI) / 4; cx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } cx.closePath(); cx.fillStyle = '#ffc94a'; cx.fill(); cx.restore(); };
    const drawHeart = (p, t) => { const r = p.r; cx.save(); cx.globalAlpha = 0.75; cx.translate(p.x + p.ox, p.y + p.oy); cx.rotate(Math.sin(t / 700 + p.ph) * 0.25); cx.beginPath(); cx.moveTo(0, r * 0.9); cx.bezierCurveTo(-r * 1.4, 0, -r * 0.7, -r * 1.1, 0, -r * 0.35); cx.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.4, 0, 0, r * 0.9); cx.fillStyle = '#ff9fb4'; cx.fill(); cx.restore(); };
    const frame = (t) => {
      if (!document.hidden) {
        cx.clearRect(0, 0, W, H);
        for (const p of P) {
          if (p.kind !== 'star') {
            p.x += p.vx + Math.sin(t / 1400 + p.ph) * 0.25; p.y += p.vy; p.rot += p.vr; if (p.s < 1) p.s = Math.min(1, p.s + 0.08);
            const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy), R = 110;
            if (d < R && d > 0) { const f = ((R - d) / R) * 26; p.ox += ((dx / d) * f - p.ox) * 0.2; p.oy += ((dy / d) * f - p.oy) * 0.2; } else { p.ox *= 0.92; p.oy *= 0.92; }
            if (p.y - p.r > H + 20) Object.assign(p, mk(p.kind, rand(0, W), -30));
            if (p.x < -40) p.x = W + 30; if (p.x > W + 40) p.x = -30;
          }
          p.kind === 'pop' ? drawPop(p) : p.kind === 'star' ? drawStar(p, t) : drawHeart(p, t);
        }
        for (let i = B.length - 1; i >= 0; i--) { const b = B[i]; b.x += b.vx; b.y += b.vy; b.vy += 0.15; b.life -= 0.025; if (b.life <= 0) { B.splice(i, 1); continue; } cx.globalAlpha = b.life; cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, 6.29); cx.fillStyle = b.c; cx.fill(); cx.globalAlpha = 1; }
      }
      if (!reduce && alive) raf = requestAnimationFrame(frame);
    };
    init();
    const onResize = () => { const oW = W; size(); if (Math.abs(oW - W) > 200) init(); };
    const onMove = (e) => { px = e.clientX; py = e.clientY; const d = document.getElementById('decor'); if (d) { d.style.setProperty('--px', (e.clientX / W - 0.5).toFixed(3)); d.style.setProperty('--py', (e.clientY / H - 0.5).toFixed(3)); } };
    const onDown = (e) => {
      if (reduce) return;
      sparkle(e.clientX, e.clientY, 6);
      const bare = !e.target.closest('button,a,input,select,label,textarea,.panel,.marquee,.stage,.item,.kpi,.step,.modal,.curtain,header,.toast,.peek,.tabs,.how h2,h1,p,table,.party');
      let hit = false;
      for (const p of P) { if (p.kind === 'star') continue; if (Math.hypot(p.x + p.ox - e.clientX, p.y + p.oy - e.clientY) < p.r + 10) { pop(p.x + p.ox, p.y + p.oy, p.r); Object.assign(p, mk(p.kind, rand(0, W), -30)); hit = true; } }
      if (bare && !hit) { const n = mk('pop', e.clientX, e.clientY, true); n.vy = rand(0.25, 0.5); P.push(n); pop(e.clientX, e.clientY, 14); if (P.length > 70) P.splice(P.findIndex((q) => q.kind === 'pop'), 1); }
    };
    addEventListener('resize', onResize); addEventListener('pointermove', onMove, { passive: true }); addEventListener('pointerdown', onDown, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', onResize); removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown); };
  }, []);
  return (
    <>
      <canvas id="bgfx" ref={ref} aria-hidden="true" />
      <div className="beam l" aria-hidden="true" />
      <div className="beam r" aria-hidden="true" />
    </>
  );
}

export function Decor() {
  const ref = useRef();
  useEffect(() => {
    const svgs = [...ref.current.querySelectorAll('svg')];
    const offs = svgs.map((d) => {
      d.style.pointerEvents = 'auto';
      const h = (e) => { d.classList.add('popped'); sparkle(e.clientX, e.clientY, 12); setTimeout(() => d.classList.remove('popped'), 2500); };
      d.addEventListener('click', h);
      return () => d.removeEventListener('click', h);
    });
    return () => offs.forEach((f) => f());
  }, []);
  return <div className="decor" id="decor" aria-hidden="true" ref={ref} dangerouslySetInnerHTML={{ __html: DECOR }} />;
}

export function Peek() {
  const { settings } = useAppData();
  const [up, setUp] = useState(false);
  const [n, setN] = useState(0);
  const [boing, setBoing] = useState(0);
  const hideT = useRef();
  const L = ['Psst… popcorn di layar bisa diketuk lho!', 'Ketuk area kosong buat bikin popcorn baru!', 'Sudah cek stamp kamu hari ini?', 'Selamat menonton!', `10 stamp = diskon ${settings.pct}%. Yuk kumpulkan!`, 'Lampu bioskopnya cantik ya?'];
  const IM = ['hello', 'thinking', 'success'];
  const show = (ms = 4200) => { setN((x) => x + 1); setUp(true); clearTimeout(hideT.current); hideT.current = setTimeout(() => setUp(false), ms); };
  useEffect(() => {
    const onPeek = () => show(5000);
    addEventListener('orinimo:peek', onPeek);
    if (reduceMotion()) return () => removeEventListener('orinimo:peek', onPeek);
    let t = setTimeout(function loop() { if (!document.hidden && !document.querySelector('.curtain')) show(); t = setTimeout(loop, 18000 + Math.random() * 12000); }, 9000);
    return () => { clearTimeout(t); clearTimeout(hideT.current); removeEventListener('orinimo:peek', onPeek); };
  }, []);
  const i = Math.max(0, n - 1);
  return (
    <button key={boing} className={'peek' + (up ? ' up' : '') + (boing ? ' boing' : '')} type="button" aria-label="Maskot Orinimo mengintip"
      onClick={(e) => { if (up) { setBoing((b) => b + 1); sparkle(e.clientX, e.clientY, 10); } show(5000); }}>
      <span className="pbub">{L[i % L.length]}</span>
      <img src={`/assets/${IM[i % 3]}.webp`} alt="" />
    </button>
  );
}

export function Curtain() {
  const [state, setState] = useState(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('ori-curtain') === '1'; } catch { /* */ }
    return seen || reduceMotion() ? 'gone' : 'shown';
  });
  useEffect(() => {
    if (state !== 'shown') return;
    const t = setTimeout(() => open(), 2600);
    return () => clearTimeout(t);
  });
  function open() {
    if (state !== 'shown') return;
    try { sessionStorage.setItem('ori-curtain', '1'); } catch { /* */ }
    setState('open');
    setTimeout(() => setState('gone'), 1300);
  }
  if (state === 'gone') return null;
  return (
    <div className={'curtain' + (state === 'open' ? ' open' : '')} onClick={open}>
      <div className="cl" /><div className="cr" /><div className="val" />
      <div className="hi"><img src="/assets/hello.webp" alt="" /><b>Selamat datang di<br />Orinimo Cinema!</b><span>Ketuk untuk buka tirai</span></div>
    </div>
  );
}

export function FilmStrip() {
  const { settings } = useAppData();
  const { toast } = useUi();
  const track = useRef(), wrap = useRef();
  const F = [['red', 't', 'NOW SHOWING'], ['cream', 'i', 'i-pop'], ['butter', 't', 'Orinimo Loyalty Club'], ['red', 'i', 'i-tix'], ['cream', 'm', 'hello'], ['butter', 't', `${idr(settings.unit)} = 1 stamp`], ['red', 'i', 'i-star'], ['cream', 't', `10 stamp = diskon ${settings.pct}%`], ['butter', 'i', 'i-heart'], ['red', 'i', 'i-clap'], ['cream', 't', 'Selamat menonton!'], ['butter', 'i', 'i-reel'], ['red', 'm', 'success'], ['cream', 'i', 'i-gift']];
  const LINES = { 'i-pop': 'Pop! Popcorn segar!', 'i-tix': 'Tiket voucher menunggumu!', 'i-star': 'Kamu bintangnya!', 'i-heart': 'Terima kasih sudah langganan!', 'i-clap': 'Action!', 'i-reel': 'Film berikutnya segera diputar!', 'i-gift': `Hadiah diskon ${settings.pct}% di stamp ke-10!` };

  useEffect(() => {
    if (reduceMotion()) return;
    const tr = track.current, film = wrap.current;
    let anim = null, boost = 0, hold = false, raf, rt, lastY = scrollY;
    const start = () => { anim && anim.cancel(); const w = tr.scrollWidth / 2; anim = tr.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-w}px)` }], { duration: (w / 45) * 1000, iterations: Infinity }); };
    start();
    const onResize = () => { clearTimeout(rt); rt = setTimeout(start, 300); };
    const on = () => (hold = true), off = () => (hold = false);
    const onUp = (e) => { if (e.pointerType !== 'mouse') hold = false; };
    const onScroll = () => { boost = Math.min(5, boost + Math.abs(scrollY - lastY) * 0.04); lastY = scrollY; };
    film.addEventListener('pointerenter', on); film.addEventListener('pointerleave', off); film.addEventListener('pointerdown', on);
    addEventListener('pointerup', onUp); addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onResize);
    const tick = () => { if (anim) { const target = hold ? 0.2 : 1 + boost; anim.playbackRate += (target - anim.playbackRate) * 0.12; boost *= 0.94; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); anim && anim.cancel(); removeEventListener('pointerup', onUp); removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); };
  }, [settings.pct, settings.unit]);

  const click = (e, k, v) => {
    const b = e.currentTarget; b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
    sparkle(e.clientX, e.clientY, 9);
    if (k === 'm') dispatchEvent(new Event('orinimo:peek'));
    else toast(k === 't' ? v : LINES[v] || 'Pop!', false, k === 'i' && (v === 'i-gift' || v === 'i-star') ? 'success' : 'hello');
  };
  const frames = [...F, ...F];
  return (
    <div className="film" ref={wrap} aria-label="Pita film Orinimo">
      <div className="ftrack" ref={track}>
        {frames.map(([c, k, v], i) => (
          <button key={i} type="button" className={'fr ' + c} onClick={(e) => click(e, k, v)}>
            {k === 't' ? (<><span className="dot" />{v}<span className="dot" /></>) : k === 'i' ? (<svg aria-hidden="true"><use href={'#' + v} /></svg>) : (<img src={`/assets/${v}.webp`} alt="" />)}
          </button>
        ))}
      </div>
    </div>
  );
}
