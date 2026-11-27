// Helper format angka, tanggal, nomor HP, dan kode acak.
const TZ = { timeZone: 'Asia/Makassar' };

export const idr = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
export const kfmt = (n) => (n % 1000 === 0 ? n / 1000 + 'rb' : idr(n));
export const dfmt = (t) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', ...TZ });
export const dtfmt = (t) =>
  new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...TZ });
export const todayStr = () => new Date().toLocaleDateString('en-CA', TZ);

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 0812…, 62812…, +62 812… → 62812…
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^628\d{7,11}$/.test(d) ? d : null;
}
export const fmtPhone = (p) => ('0' + p.slice(2)).replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
export const maskPhone = (p) => {
  const l = '0' + p.slice(2);
  return l.slice(0, 4) + '••••' + l.slice(-4);
};

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function rnd(n) {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  let s = '';
  for (const x of a) s += ALPH[x % ALPH.length];
  return s;
}

export function newRef() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return 'ORD-' + String(d.getFullYear()).slice(2) + z(d.getMonth() + 1) + z(d.getDate()) + '-' + rnd(4);
}

export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const waLink = (phone, text) => 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);

export const label = (cu) => cu.nickname || fmtPhone(cu.phone);
