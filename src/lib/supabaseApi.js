// MODE PRODUKSI: semua data lewat Supabase (database, auth, storage).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { toApiError, ApiError } from './errors.js';

let client = null;
// klien dibuat hanya saat dipakai (mode demo tidak membuatnya)
export function getSupabase() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
const supabase = new Proxy({}, { get: (_t, k) => { const c = getSupabase(); const v = c[k]; return typeof v === 'function' ? v.bind(c) : v; } });

const unwrap = ({ data, error }) => { if (error) throw toApiError(error); return data; };
const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args));

const mapCustomer = (r) => ({ id: r.id, code: r.code, phone: r.phone, nickname: r.nickname, source: r.source, createdAt: r.created_at });
const mapCard = (r) => ({ id: r.id, customerId: r.customer_id, code: r.code, token: r.token, revoked: r.revoked, stamps: r.stamps, revision: r.revision, status: r.status, actCode: r.act_code, issuedAt: r.issued_at });
const mapOrder = (r) => ({ id: r.id, ref: r.ref, cardId: r.card_id, customerId: r.customer_id, type: r.type, items: r.items || [], listTotal: r.list_total, manual: r.manual, gross: r.gross, discount: r.discount, paid: r.paid, method: r.method, note: r.note, status: r.status, rewardId: r.reward_id, createdAt: r.created_at });
const mapReward = (r) => ({ id: r.id, code: r.code, cardId: r.card_id, discountBps: r.discount_bps, status: r.status, issuedAt: r.issued_at, redeemedAt: r.redeemed_at });
const mapOp = (r) => ({ id: r.id, type: r.type, orderId: r.order_id, cardId: r.card_id, earned: r.earned, from: r.from_stamps, to: r.to_stamps, rewardIds: r.reward_ids || [], reversed: r.reversed, createdAt: r.created_at });
const mapTheme = (r) => ({ id: r.id, name: r.name, base: r.base, frontImg: r.front_img, backImg: r.back_img, ink: r.ink, shape: r.shape, from: r.date_from, to: r.date_to });
const mapSettings = (r) => ({ pct: r.pct, unit: r.unit, minOrder: r.min_order, cap: r.cap });

async function staffInfo(user) {
  if (!user) return null;
  const { data } = await supabase.from('staff').select('role').eq('user_id', user.id).maybeSingle();
  return { email: user.email, isStaff: !!data, role: data?.role || null };
}

// ambil semua baris (PostgREST membatasi 1000 baris per permintaan)
async function selectAll(table, cols, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols).range(from, from + 999);
    if (order) q = q.order(order, { ascending: false });
    const rows = unwrap(await q);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export const supabaseApi = {
  mode: 'supabase',

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return staffInfo(data.session?.user);
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toApiError(error);
    const info = await staffInfo(data.user);
    if (!info.isStaff) { await supabase.auth.signOut(); throw new ApiError('FORBIDDEN', 'Akun ini belum terdaftar sebagai admin Orinimo.'); }
    return info;
  },
  async signOut() { await supabase.auth.signOut(); },
  async verifyPassword(password) {
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email;
    if (!email) throw new ApiError('FORBIDDEN', 'Sesi habis. Silakan login lagi.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError('INVALID_PASSWORD', 'Password salah.');
    return true;
  },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => { staffInfo(session?.user).then(cb); });
    return () => data.subscription.unsubscribe();
  },

  async getPublic() {
    const [s, p, t, d] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('products').select('id,brand,name,price,sort').eq('active', true).order('sort'),
      supabase.from('themes').select('*').order('created_at'),
      supabase.from('design_state').select('*').eq('id', 1).single(),
    ]);
    return {
      settings: mapSettings(unwrap(s)),
      products: unwrap(p),
      themes: unwrap(t).map(mapTheme),
      design: { activeId: unwrap(d).active_id, history: unwrap(d).history || [] },
    };
  },

  getCard: (token) => rpc('get_card', { p_token: token }),
  setNickname: (token, nickname) => rpc('set_nickname', { p_token: token, p_nickname: nickname }),
  selfJoin: (phone) => rpc('self_join', { p_phone: phone }),

  async adminSnapshot() {
    const [customers, cards, orders, rewards, ops, ledger] = await Promise.all([
      selectAll('customers', '*', 'created_at'),
      selectAll('cards', '*', 'issued_at'),
      selectAll('orders', '*', 'created_at'),
      selectAll('rewards', '*', 'issued_at'),
      selectAll('ops', 'id,type,order_id,card_id,earned,from_stamps,to_stamps,reward_ids,reversed,created_at', 'created_at'),
      selectAll('ledger', 'card_id,type,delta,created_at', 'created_at'),
    ]);
    return {
      customers: customers.map(mapCustomer),
      cards: cards.filter((c) => c.status !== 'revoked').map(mapCard),
      orders: orders.map(mapOrder),
      rewards: rewards.map(mapReward),
      ops: ops.map(mapOp),
      ledger: ledger.map((l) => ({ cardId: l.card_id, type: l.type, delta: l.delta, createdAt: l.created_at })),
    };
  },

  createCustomer: (phone, nickname) => rpc('admin_create_customer', { p_phone: phone, p_nickname: nickname || '' }),
  activateCard: (cardId) => rpc('activate_card', { p_card_id: cardId }),
  reissueToken: (cardId) => rpc('reissue_token', { p_card_id: cardId }),
  awardOrder: (p) => rpc('award_order', {
    p_card_id: p.cardId, p_ref: p.ref || null, p_amount: p.amount, p_items: p.items || [],
    p_verified: !!p.verified, p_reward_id: p.rewardId || null, p_method: p.method || 'QRIS GoPay', p_note: p.note || '',
  }),
  undoOp: (opId, reason) => rpc('undo_op', { p_op_id: opId, p_reason: reason }),

  async saveSettings(s) {
    return mapSettings(await rpc('save_settings', { p_pct: s.pct, p_unit: s.unit, p_min: s.minOrder || 0, p_cap: s.cap || 0 }));
  },
  async saveTheme(t) {
    const row = { id: t.id, name: t.name, base: t.base, front_img: t.frontImg || '', back_img: t.backImg || '', ink: t.ink, shape: t.shape, date_from: t.from || null, date_to: t.to || null };
    return mapTheme(unwrap(await supabase.from('themes').upsert(row).select().single()));
  },
  async deleteTheme(id) { unwrap(await supabase.from('themes').delete().eq('id', id)); return true; },
  async setDesign(d) {
    const r = unwrap(await supabase.from('design_state').update({ active_id: d.activeId, history: d.history.slice(-10) }).eq('id', 1).select().single());
    return { activeId: r.active_id, history: r.history };
  },
  async uploadDesignImage(blob) {
    const path = `themes/${Date.now()}-${crypto.randomUUID()}.jpg`;
    unwrap(await supabase.storage.from('card-designs').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
    return supabase.storage.from('card-designs').getPublicUrl(path).data.publicUrl;
  },
};
