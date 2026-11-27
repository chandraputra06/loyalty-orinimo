// Mencari kartu dari hasil scan QR, card code, kode aktivasi, kode member, atau nomor WA.
import { ApiError } from '../../lib/errors.js';
import { normPhone } from '../../lib/format.js';

export const suffixMatches = (snap, d) =>
  snap.customers.filter((c) => c.phone.endsWith(d)).map((cu) => ({ cu, card: snap.cardByCus.get(cu.id) })).filter((x) => x.card);

const fails = [];
export function resolveCard(snap, text) {
  const now = Date.now();
  while (fails.length && now - fails[0] > 60000) fails.shift();
  if (fails.length >= 6) throw new ApiError('RATE_LIMITED', 'Terlalu banyak percobaan gagal. Tunggu sebentar.');
  const t = (text || '').trim();
  const up = t.toUpperCase().replace(/\s/g, '');
  let card;
  if (/^ORINIMO:/i.test(t)) {
    const tok = t.slice(8);
    card = snap.cards.find((c) => c.token === tok);
    if (!card && snap.cards.some((c) => (c.revoked || []).includes(tok))) { fails.push(now); throw new ApiError('INVALID_CARD', 'QR ini sudah dicabut. Minta pelanggan membuka link kartu terbaru.'); }
  } else if (/AKTIF-?[A-Z0-9]{4}/.test(up)) {
    const m = up.match(/AKTIF-?([A-Z0-9]{4})/);
    card = snap.cards.find((c) => c.actCode === 'AKTIF-' + m[1]);
  } else if (/^ORI-?CUS-?\d+$/.test(up)) {
    const cu = snap.customers.find((c) => c.code.replace(/-/g, '') === up.replace(/-/g, ''));
    card = cu && snap.cardByCus.get(cu.id);
  } else if (/^[\d+\-().]+$/.test(up) && up.replace(/\D/g, '').length >= 9) {
    const ph = normPhone(up);
    if (!ph) throw new ApiError('INVALID_PHONE', 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.');
    const cu = snap.customers.find((c) => c.phone === ph);
    if (!cu) { const e = new ApiError('NOT_MEMBER', 'Nomor ini belum punya kartu.'); e.phone = ph; throw e; }
    card = snap.cardByCus.get(cu.id);
  } else {
    let c = up.replace(/-/g, '');
    if (c.startsWith('ORI')) c = c.slice(3);
    if (c.length === 8) card = snap.cards.find((x) => x.code === 'ORI-' + c.slice(0, 4) + '-' + c.slice(4));
  }
  if (!card || card.status === 'revoked') { fails.push(now); throw new ApiError('INVALID_CARD', 'Kartu tidak ditemukan atau sudah dinonaktifkan.'); }
  return card;
}
