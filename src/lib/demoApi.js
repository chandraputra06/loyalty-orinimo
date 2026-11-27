// MODE DEMO: meniru fungsi-fungsi database Supabase, tapi data disimpan di
// localStorage browser. Dipakai otomatis jika .env Supabase belum diisi.
import { normPhone, maskPhone, rnd, sleep } from './format.js';
import { PRICELIST } from './pricelist.js';
import { ApiError } from './errors.js';

const KEY = 'orinimo-react-demo-v1';
const SESSION = 'orinimo-demo-staff';
const UNDO_MS = 5 * 60 * 1000;
let DB = null;

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const err = (code, msg) => { throw new ApiError(code, msg); };
const idr = (n) => 'Rp' + Number(n).toLocaleString('id-ID');
const clone = (o) => JSON.parse(JSON.stringify(o));

// selalu baca ulang dari localStorage, supaya perubahan dari tab lain langsung terlihat
let noStorage = false;
function load() {
  if (noStorage && DB) return DB;
  try { const raw = localStorage.getItem(KEY); DB = raw ? JSON.parse(raw) : null; } catch { noStorage = true; }
  if (!DB || !DB.cards) seed();
  return DB;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch { /* penuh/tidak tersedia */ } }
// baca ulang dari storage (dipanggil saat tab lain mengubah data)
export function reloadDemo() { DB = null; load(); }

function fresh() {
  return {
    seq: 0, settings: { pct: 15, unit: 10000, minOrder: 0, cap: 0 },
    products: PRICELIST.map((p) => ({ ...p })), customers: [], cards: [], orders: [], ops: [],
    ledger: [], rewards: [], themes: [], design: { activeId: 'default', history: [] }, audit: [],
  };
}
const cardById = (id) => DB.cards.find((c) => c.id === id);
const audit = (action, meta) => DB.audit.push({ action, meta, at: now() });

function newToken() {
  let t;
  do t = rnd(20); while (DB.cards.some((c) => c.token === t || c.revoked.includes(t)));
  return t;
}
function insertCustomer(ph, nickname, source, status, at) {
  DB.seq++;
  const cu = { id: uid(), code: 'ORI-CUS-' + String(DB.seq).padStart(6, '0'), phone: ph, nickname: (nickname || '').trim().slice(0, 30), source, createdAt: at || now() };
  let act = null;
  if (status === 'pending') do act = 'AKTIF-' + rnd(4); while (DB.cards.some((c) => c.actCode === act));
  const card = { id: uid(), customerId: cu.id, code: 'ORI-' + rnd(4) + '-' + rnd(4), token: newToken(), revoked: [], stamps: 0, revision: 1, status, actCode: act, issuedAt: cu.createdAt };
  DB.customers.push(cu); DB.cards.push(card);
  audit('MEMBER_CREATED', { customer: cu.code, source });
  return { cu, card };
}

function award({ cardId, ref, amount, items, verified, rewardId, method, note, at }) {
  const c = cardById(cardId);
  if (!c) err('INVALID_CARD', 'Kartu tidak ditemukan.');
  if (c.status === 'pending') err('CARD_PENDING', 'Kartu ini belum diaktifkan. Aktifkan dulu.');
  if (c.status !== 'active') err('INVALID_CARD', 'Kartu tidak valid atau sudah dinonaktifkan.');
  const r = (ref || '').trim().toUpperCase() || 'ORD-' + rnd(8);
  if (DB.orders.some((o) => o.ref === r)) err('DUPLICATE_AWARD', 'Transaksi ini sudah pernah diproses.');
  if (!verified) err('PAYMENT_NOT_VERIFIED', 'Pastikan dana sudah masuk dulu.');
  const s = DB.settings;
  const snap = (items || []).map((it) => {
    const p = DB.products.find((x) => x.id === it.productId), q = Number(it.qty);
    if (!p || !Number.isSafeInteger(q) || q < 1 || q > 50) err('INVALID_INPUT', 'Produk atau jumlah tidak valid.');
    return { productId: p.id, name: p.brand + ' ' + p.name, qty: q, unit: p.price, subtotal: p.price * q };
  });
  const listTotal = snap.reduce((a, i) => a + i.subtotal, 0);
  const gross = Number(amount);
  if (!Number.isSafeInteger(gross) || gross < 1000 || gross > 10000000) err('INVALID_AMOUNT', 'Total dibayar harus antara Rp1.000 dan Rp10.000.000.');
  let disc = 0, reward = null;
  if (rewardId) {
    reward = DB.rewards.find((x) => x.id === rewardId);
    if (!reward || reward.cardId !== c.id || reward.status !== 'AVAILABLE') err('REWARD_UNAVAILABLE', 'Voucher tidak tersedia.');
    if (s.minOrder > 0 && gross < s.minOrder) err('MIN_ORDER', `Voucher bisa dipakai untuk belanja minimal ${idr(s.minOrder)}.`);
    disc = Math.floor((gross * reward.discountBps) / 10000);
    if (s.cap > 0) disc = Math.min(disc, s.cap);
  }
  const paid = gross - disc, earned = Math.floor(paid / s.unit), from = c.stamps, tot = from + earned, nr = Math.floor(tot / 10);
  const type = snap.length && DB.orders.some((o) => o.cardId === c.id && o.status === 'paid' && o.items.some((i) => snap.some((x) => x.productId === i.productId))) ? 'renewal' : 'purchase';
  const t = at || now();
  const order = { id: uid(), ref: r, cardId: c.id, customerId: c.customerId, type, items: snap, listTotal, manual: snap.length > 0 && listTotal !== gross, gross, discount: disc, paid, method: method || 'QRIS GoPay', note: (note || '').slice(0, 80), status: 'paid', rewardId: reward ? reward.id : null, createdAt: t };
  const op = { id: uid(), type: reward ? 'REDEEM' : 'STAMP', orderId: order.id, cardId: c.id, earned, from, to: 0, rewardIds: [], redeemedRewardId: reward ? reward.id : null, reversed: false, createdAt: t };
  if (reward) Object.assign(reward, { status: 'REDEEMED', redeemedAt: t });
  const codes = [];
  if (earned > 0) {
    DB.ledger.push({ cardId: c.id, opId: op.id, type: 'EARN', delta: earned, balanceAfter: tot, createdAt: t });
    let bal = tot;
    for (let k = 0; k < nr; k++) {
      const rw = { id: uid(), code: 'RWD-' + rnd(6), cardId: c.id, discountBps: s.pct * 100, status: 'AVAILABLE', issuedAt: t, redeemedAt: null };
      DB.rewards.push(rw); op.rewardIds.push(rw.id); codes.push(rw.code); bal -= 10;
      DB.ledger.push({ cardId: c.id, opId: op.id, type: 'CONSUME', delta: -10, balanceAfter: bal, createdAt: t });
    }
  }
  c.stamps = tot % 10; c.revision++; op.to = c.stamps;
  DB.orders.push(order); DB.ops.push(op);
  audit(op.type, { order: r, earned });
  return { opId: op.id, orderRef: r, earned, from, to: c.stamps, issued: nr, rewardCodes: codes, revision: c.revision, token: c.token, discount: disc, paid };
}

function seed() {
  DB = fresh();
  let s = 20261127;
  const r = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const D = 864e5, T = Date.now(), iso = (ms) => new Date(ms).toISOString();
  const people = [['Rina', '081234567801'], ['Bagus', '081377120934'], ['', '085712349876'], ['Made', '087861234455'], ['Putu', '081999012345'], ['', '082145678812'], ['Nurul', '081355557070'], ['Kevin', '085798761234'], ['Sinta', '081288887801']];
  const cards = people.map(([n, ph], i) => insertCustomer(normPhone(ph), n, 'admin', 'active', iso(T - (55 - i * 3) * D)).card);
  const POP = ['netflix-1p1u-1-bulan', 'netflix-1p2u-1-bulan', 'disney-1-bulan', 'chatgpt-sharing-plus-1-bulan', 'chatgpt-sharing-go-1-bulan', 'youtube-1-bulan', 'canva-1-bulan', 'viu-antilimit-1-bulan', 'capcut-private-1-bulan', 'spotify-akun-seller-1-bulan', 'iqiyi-private-1-bulan', 'prime-private-1-bulan'];
  const ev = [{ c: 0, at: T - 20 * D, items: [{ productId: 'netflix-1p1u-1-bulan', qty: 1 }] }, { c: 0, at: T - 6 * D, items: [{ productId: 'chatgpt-sharing-plus-1-bulan', qty: 1 }] }];
  for (let i = 1; i < cards.length; i++) {
    const n = 1 + Math.floor(r() * 9), fav = POP[Math.floor(r() * POP.length)];
    for (let j = 0; j < n; j++) {
      const at = T - Math.floor(r() * 80 + 1) * D - Math.floor(r() * D * 0.6);
      if (r() < 0.12) ev.push({ c: i, at, items: [], amount: [52000, 64000, 18000, 75000][Math.floor(r() * 4)] });
      else ev.push({ c: i, at, items: [{ productId: r() < 0.6 ? fav : POP[Math.floor(r() * POP.length)], qty: 1 }] });
    }
  }
  ev.sort((a, b) => a.at - b.at);
  let k = 1;
  for (const e of ev) {
    const card = cards[e.c];
    const av = DB.rewards.filter((x) => x.cardId === card.id && x.status === 'AVAILABLE');
    const amt = e.amount || e.items.reduce((a, it) => a + DB.products.find((p) => p.id === it.productId).price * it.qty, 0);
    award({ cardId: card.id, ref: 'TRX-' + (24000 + k++), amount: amt, items: e.items, verified: true, rewardId: av.length && r() < 0.6 ? av[0].id : null, at: iso(e.at) });
  }
  insertCustomer('6289612340099', '', 'self', 'pending', iso(T - 2 * 3600e3));
  DB.audit = [];
  save();
}

// ================= API (sama bentuknya dengan supabaseApi.js) =================
const staffSession = () => { try { return sessionStorage.getItem(SESSION) === '1'; } catch { return false; } };
const needStaff = () => { if (!staffSession()) err('FORBIDDEN', 'Khusus admin.'); };
const act = async (fn) => { await sleep(120); load(); const r = fn(); save(); return clone(r); };

export const demoApi = {
  mode: 'demo',
  async getSession() { return staffSession() ? { email: 'demo@orinimo', isStaff: true, role: 'owner' } : null; },
  async signIn() { try { sessionStorage.setItem(SESSION, '1'); } catch { /* */ } return { email: 'demo@orinimo', isStaff: true, role: 'owner' }; },
  async signOut() { try { sessionStorage.removeItem(SESSION); } catch { /* */ } },
  async verifyPassword(pw) { if (pw !== '1234') err('INVALID_PASSWORD', 'PIN salah. PIN demo: 1234.'); return true; },
  onAuthChange() { return () => {}; },

  async getPublic() { load(); return clone({ settings: DB.settings, products: DB.products.slice().sort((a, b) => a.sort - b.sort), themes: DB.themes, design: DB.design }); },

  async getCard(token) {
    load();
    const c = DB.cards.find((x) => x.token === token && x.status !== 'revoked');
    if (!c) return DB.cards.some((x) => x.revoked.includes(token)) ? { revoked: true } : null;
    const cu = DB.customers.find((x) => x.id === c.customerId);
    const ops = Object.fromEntries(DB.ops.map((o) => [o.orderId, o]));
    return clone({
      card: { id: c.id, code: c.code, token: c.token, stamps: c.stamps, revision: c.revision, status: c.status, actCode: c.status === 'pending' ? c.actCode : null, issuedAt: c.issuedAt },
      customer: { code: cu.code, nickname: cu.nickname, phoneMasked: maskPhone(cu.phone) },
      rewards: DB.rewards.filter((r) => r.cardId === c.id && r.status !== 'CANCELLED').sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)),
      orders: DB.orders.filter((o) => o.cardId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50)
        .map((o) => ({ id: o.id, ref: o.ref, type: o.type, items: o.items, paid: o.paid, discount: o.discount, status: o.status, createdAt: o.createdAt, earned: ops[o.id]?.earned || 0 })),
    });
  },

  setNickname: (token, nickname) => act(() => {
    const v = String(nickname || '').replace(/\s+/g, ' ').trim();
    if (v.length > 30 || !/^[\p{L}\p{N} .,'-]*$/u.test(v)) err('INVALID_INPUT', "Pakai huruf, angka, spasi, atau tanda . , ' - saja (maks. 30).");
    const c = DB.cards.find((x) => x.token === token && x.status !== 'revoked');
    if (!c) err('INVALID_CARD', 'Kartu tidak ditemukan.');
    DB.customers.find((x) => x.id === c.customerId).nickname = v; c.revision++;
    return { revision: c.revision };
  }),

  selfJoin: (phone) => act(() => {
    const ph = normPhone(phone);
    if (!ph) err('INVALID_PHONE', 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.');
    if (DB.customers.some((c) => c.phone === ph)) err('DUPLICATE_MEMBER', 'Nomor ini sudah punya kartu member.');
    const { card } = insertCustomer(ph, '', 'self', 'pending');
    return { actCode: card.actCode, token: card.token };
  }),

  async adminSnapshot() {
    needStaff(); load();
    return clone({ customers: DB.customers, cards: DB.cards.filter((c) => c.status !== 'revoked'), orders: DB.orders, rewards: DB.rewards, ops: DB.ops, ledger: DB.ledger });
  },

  createCustomer: (phone, nickname) => act(() => {
    needStaff();
    const ph = normPhone(phone);
    if (!ph) err('INVALID_PHONE', 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.');
    if (DB.customers.some((c) => c.phone === ph)) err('DUPLICATE_MEMBER', 'Nomor ini sudah punya kartu member.');
    const { cu, card } = insertCustomer(ph, nickname, 'admin', 'active');
    return { customerId: cu.id, cardId: card.id };
  }),

  activateCard: (cardId) => act(() => {
    needStaff();
    const c = cardById(cardId);
    if (!c || c.status !== 'pending') err('INVALID_CARD', 'Kartu ini tidak sedang menunggu aktivasi.');
    const old = c.token;
    Object.assign(c, { status: 'active', actCode: null, revoked: [...c.revoked, old], token: newToken(), revision: c.revision + 1 });
    return { token: c.token, revision: c.revision, oldToken: old };
  }),

  reissueToken: (cardId) => act(() => {
    needStaff();
    const c = cardById(cardId);
    if (!c || c.status === 'revoked') err('INVALID_CARD', 'Kartu tidak ditemukan.');
    const old = c.token;
    Object.assign(c, { revoked: [...c.revoked, old], token: newToken(), revision: c.revision + 1 });
    return { token: c.token, revision: c.revision, oldToken: old };
  }),

  awardOrder: (p) => act(() => { needStaff(); return award(p); }),

  undoOp: (opId, reason) => act(() => {
    needStaff();
    const op = DB.ops.find((o) => o.id === opId);
    if (!op || op.reversed) err('RESOURCE_NOT_FOUND', 'Operasi tidak ditemukan atau sudah dibatalkan.');
    if (!(reason || '').trim()) err('INVALID_INPUT', 'Alasan undo wajib diisi.');
    if (Date.now() - new Date(op.createdAt).getTime() > UNDO_MS) err('OWNER_REVIEW_REQUIRED', 'Lewat batas 5 menit. Koreksi ini perlu owner.');
    const rws = op.rewardIds.map((id) => DB.rewards.find((r) => r.id === id));
    if (rws.some((r) => r.status !== 'AVAILABLE')) err('OWNER_REVIEW_REQUIRED', 'Voucher dari transaksi ini sudah dipakai. Perlu dicek owner.');
    const c = cardById(op.cardId), before = c.stamps, t = now();
    let bal = c.stamps + 10 * rws.length - op.earned;
    if (bal < 0) err('OWNER_REVIEW_REQUIRED', 'Stamp dari transaksi ini sudah terpakai untuk voucher lain. Perlu dicek owner.');
    rws.forEach((r) => { r.status = 'CANCELLED'; });
    if (rws.length) DB.ledger.push({ cardId: c.id, opId: op.id, type: 'RESTORE', delta: 10 * rws.length, balanceAfter: before + 10 * rws.length, createdAt: t });
    DB.ledger.push({ cardId: c.id, opId: op.id, type: 'REVERSAL', delta: -op.earned, balanceAfter: bal, createdAt: t });
    while (bal >= 10) {
      const rw = { id: uid(), code: 'RWD-' + rnd(6), cardId: c.id, discountBps: DB.settings.pct * 100, status: 'AVAILABLE', issuedAt: t };
      DB.rewards.push(rw); bal -= 10;
    }
    if (op.redeemedRewardId) Object.assign(DB.rewards.find((r) => r.id === op.redeemedRewardId), { status: 'AVAILABLE', redeemedAt: null });
    c.stamps = bal; c.revision++; op.reversed = true;
    DB.orders.find((o) => o.id === op.orderId).status = 'reversed';
    return { from: before, to: bal, removed: op.earned, revision: c.revision, token: c.token };
  }),

  saveSettings: (s) => act(() => { needStaff(); DB.settings = { pct: s.pct, unit: s.unit, minOrder: s.minOrder || 0, cap: s.cap || 0 }; return DB.settings; }),
  saveTheme: (t) => act(() => { needStaff(); DB.themes = DB.themes.filter((x) => x.id !== t.id); DB.themes.push(t); return t; }),
  deleteTheme: (id) => act(() => { needStaff(); DB.themes = DB.themes.filter((x) => x.id !== id); return true; }),
  setDesign: (d) => act(() => { needStaff(); DB.design = { activeId: d.activeId, history: d.history.slice(-10) }; return DB.design; }),
  // demo: gambar disimpan sebagai data URL
  async uploadDesignImage(blob) {
    needStaff();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  },
  resetDemo() { seed(); },
};
