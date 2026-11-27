// Kartu 3D: markup, gerakan miring/balik, dan animasi cap stamp.
// Kartu dirender sebagai DOM biasa (bukan state React) supaya animasi
// cap stamp bisa berjalan mulus tanpa dirender ulang oleh React.
import { esc, sleep, reduceMotion } from './format.js';
import { impSvg, GHOST, ROT, okImg, okInk } from './theme.js';
import { qrSvg, qrPayload } from './qr.js';

const idr = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

function slotsHTML(n, theme, pct) {
  const imp = impSvg(theme.shape);
  return Array.from({ length: 10 }, (_, i) =>
    `<div class="slot${i < n ? ' on' : ''}${i === 9 ? ' goal' : ''}" style="--r:${ROT[i]}deg">${
      i === 9 ? `<em>${pct}%<br>OFF</em>` : GHOST
    }${imp}</div>`
  ).join('');
}

export function stageHTML({ card, customer, settings, theme, sm, flipped, stamps }) {
  const fi = okImg(theme.frontImg) ? theme.frontImg : '';
  const bi = okImg(theme.backImg) ? theme.backImg : '';
  const name = customer.nickname || 'Member Orinimo';
  const n = stamps ?? card.stamps;
  return `<div class="stage entering${sm ? ' sm' : ''}"><div class="floater"><div class="tilt"><div class="card3d t-${esc(theme.base)}${fi ? ' has-fimg' : ''}${bi ? ' has-bimg' : ''}${flipped ? ' is-flipped' : ''}" style="--stamp:${okInk(theme.ink)}" tabindex="0" role="button" aria-label="Kartu loyalty ${esc(name)}, ${n} dari 10 stamp. Tekan untuk membalik.">
  <div class="face front"><div class="fin"${fi ? ` style="background:url(${fi}) center/cover"` : ''}><div class="guide" style="left:4%;top:64%;width:56%;height:31%"><b>Area nama & nomor</b></div><div class="valance"></div><div class="bulbs"></div>
  <div class="f-txt"><small>NOW SHOWING</small><div class="f-brand">Orinimo</div><div class="f-club">Loyalty Club</div></div>
  <img class="logo" src="/assets/logo.webp" alt="" draggable="false">
  <div class="f-member"><small>Admit one · ${esc(customer.code)}</small><b>${esc(name)}</b><span>${esc(customer.phoneMasked || '')}</span></div><i class="shine"></i></div></div>
  <div class="face back"><div class="fin"${bi ? ` style="background:url(${bi}) center/cover"` : ''}><div class="guide free" style="left:4%;top:5%;width:66%;height:38%"><b>Bebas untuk desain</b></div><div class="guide" style="left:4%;top:47%;width:66%;height:48%"><b>Area slot stamp</b></div><div class="guide" style="left:73%;top:0;width:27%;height:100%"><b>Area QR</b></div>
  <div class="b-head"><h3>Collect 10 stamps,<br>get ${settings.pct}% OFF!</h3><p>${idr(settings.unit)} = 1 stamp</p></div>
  <div class="b-stub"><small>Scan me!</small><div class="b-qr">${qrSvg(qrPayload(card.token))}</div><span>${esc(card.code)}</span></div>
  <div class="slots">${slotsHTML(n, theme, settings.pct)}</div><div class="stamper"><i class="knob"></i><i class="neck"></i><i class="pad"></i></div><div class="burst"></div><i class="shine"></i></div></div>
  </div></div></div><div class="cshadow"></div></div>`;
}

// ---- miring mengikuti kursor + gerak pelan saat diam ----
const idleStages = new Set();
let idleRunning = false;
function idleLoop(t) {
  for (const s of idleStages) {
    if (!s.stage.isConnected) { idleStages.delete(s); continue; }
    if (t - s.last() > 1600 && !document.hidden) s.set(Math.sin(t / 1800) * 4, Math.cos(t / 2400) * 7);
  }
  if (idleStages.size) requestAnimationFrame(idleLoop);
  else idleRunning = false;
}

export function mountStage(stage, { idle, onFlip } = {}) {
  const reduce = reduceMotion();
  const tilt = stage.querySelector('.tilt'), c3 = stage.querySelector('.card3d');
  let last = 0;
  const set = (rx, ry) => {
    rx = Math.max(-13, Math.min(13, rx)); ry = Math.max(-15, Math.min(15, ry));
    tilt.style.setProperty('--rx', rx + 'deg'); tilt.style.setProperty('--ry', ry + 'deg');
    stage.style.setProperty('--sx', 50 - ry * 3.2 + '%');
  };
  const onMove = (e) => {
    if (reduce) return;
    const r = stage.getBoundingClientRect();
    set(-((e.clientY - r.top) / r.height - 0.5) * 24, ((e.clientX - r.left) / r.width - 0.5) * 28);
    last = performance.now();
  };
  const onLeave = () => { set(0, 0); last = performance.now(); };
  const flip = () => { c3.classList.toggle('is-flipped'); onFlip && onFlip(c3.classList.contains('is-flipped')); };
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('click', flip);
  c3.addEventListener('keydown', onKey);
  stage._flip = flip;
  stage._isFlipped = () => c3.classList.contains('is-flipped');
  let entry = null;
  if (idle && !reduce) {
    entry = { stage, set, last: () => last };
    idleStages.add(entry);
    if (!idleRunning) { idleRunning = true; requestAnimationFrame(idleLoop); }
  }
  return () => {
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerleave', onLeave);
    stage.removeEventListener('click', flip);
    c3.removeEventListener('keydown', onKey);
    if (entry) idleStages.delete(entry);
  };
}

export function paintSlots(stage, n) {
  stage?.querySelectorAll('.slot').forEach((s, i) => s.classList.toggle('on', i < n));
}

// ---- animasi cap stamp satu per satu ----
export async function playStamps(stage, from, earned, { onTick, pct, skip } = {}) {
  const reduce = reduceMotion();
  const c3 = stage.querySelector('.card3d'), back = stage.querySelector('.back');
  const st = back.querySelector('.stamper'), slotsEl = back.querySelector('.slots');
  const slots = [...back.querySelectorAll('.slot')], burst = back.querySelector('.burst');
  paintSlots(stage, from);
  if (!c3.classList.contains('is-flipped')) { stage._flip(); await sleep(reduce ? 50 : 780); }
  const dur = earned > 4 ? 620 : 1000;
  let pos = from;
  for (let i = 0; i < earned && !(skip && skip()); i++) {
    if (!stage.isConnected) return;
    const sl = slots[pos], H = back.offsetHeight;
    const x = slotsEl.offsetLeft + sl.offsetLeft + sl.offsetWidth / 2 - st.offsetWidth / 2;
    const y = slotsEl.offsetTop + sl.offsetTop + sl.offsetHeight / 2 - st.offsetHeight + st.querySelector('.pad').offsetHeight * 0.5;
    if (reduce) { sl.classList.add('on'); await sleep(120); }
    else {
      const a = st.animate([
        { transform: `translate(${x}px,${y - H * 0.8}px) scale(1.5)`, opacity: 0, filter: 'drop-shadow(0 26px 16px rgba(60,10,10,.25))' },
        { transform: `translate(${x}px,${y - H * 0.25}px) scale(1.18)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1, offset: 0.55, filter: 'drop-shadow(0 3px 2px rgba(60,10,10,.5))' },
        { transform: `translate(${x}px,${y + 2}px) scale(1.04,.88)`, opacity: 1, offset: 0.63 },
        { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1, offset: 0.72 },
        { transform: `translate(${x}px,${y - H * 0.65}px) scale(1.35)`, opacity: 0, offset: 1, filter: 'drop-shadow(0 26px 16px rgba(60,10,10,.2))' },
      ], { duration: dur, easing: 'cubic-bezier(.3,.7,.3,1)' });
      setTimeout(() => {
        sl.classList.add('on', 'ink');
        setTimeout(() => sl.classList.remove('ink'), 500);
        navigator.vibrate && navigator.vibrate(18);
      }, dur * 0.58);
      await a.finished.catch(() => {});
    }
    pos++;
    onTick && onTick(pos, i + 1);
    if (pos === 10) {
      burst.innerHTML = `<b>Yay! ${pct}% OFF<small>Tiket voucher kebuka!</small></b>` +
        Array.from({ length: 22 }, (_, j) =>
          `<i class="${['k', 's', 'c', 'k'][j % 4]}" style="--c:${['#fff', '#ffd166', '#ff8fa3', '#fff', '#ef4b4f', '#7fd8b5'][j % 6]};--x:${Math.round(Math.cos((j / 18) * 6.28) * (140 + (j % 3) * 40))}px;--y:${Math.round(Math.sin((j / 18) * 6.28) * (90 + (j % 4) * 20))}px"></i>`
        ).join('');
      burst.classList.remove('go'); void burst.offsetWidth; burst.classList.add('go');
      await sleep(reduce ? 300 : 1550);
      burst.classList.remove('go');
      paintSlots(stage, 0);
      pos = 0;
      await sleep(200);
    }
  }
}

// percikan kecil saat layar diketuk
const SPK = ['#ef4b4f', '#ffd166', '#ff8fa3', '#7fd8b5'];
export function sparkle(x, y, n = 8) {
  if (reduceMotion()) return;
  for (let k = 0; k < n; k++) {
    const e = document.createElement('i'), a = Math.random() * 6.28, d = 30 + Math.random() * 40;
    e.className = 'spark ' + ['st', 'ci', 'st', 'ht'][k % 4];
    e.style.cssText = `left:${x}px;top:${y}px;background:${SPK[k % 4]};--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px`;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 800);
  }
}
