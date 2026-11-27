// Teks pesan WhatsApp & ringkasan yang dipakai di banyak halaman.
import { cardLink, ORINIMO_WA } from '../config.js';
import { idr, waLink, fmtPhone } from './format.js';

export const cardMsg = (cu, token, s) =>
  `Halo kak${cu.nickname ? ' ' + cu.nickname : ''}! Ini kartu member Orinimo Loyalty Club kakak:\n${cardLink(token)}\n\n` +
  `Setiap ${idr(s.unit)} dalam satu transaksi = 1 stamp. Kumpulkan 10 stamp, dapat diskon ${s.pct}%. ` +
  `Simpan link ini dan jangan dibagikan ke orang lain ya.\n\nDengan membuka link ini, kakak setuju nomor WA disimpan untuk program loyalty Orinimo.`;

export const activationLink = (actCode) => waLink(ORINIMO_WA, `Halo Orinimo, saya mau aktifkan kartu member. Kode: ${actCode}`);
export const recoveryLink = (ph) => waLink(ORINIMO_WA, `Halo Orinimo, link kartu member saya hilang. Nomor saya ${fmtPhone(ph)}. Mohon dikirim ulang ya.`);

export const oname = (o) => (o.items?.length ? o.items.map((i) => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ') : 'Order lainnya');

export const progressText = (n, av, pct) => ({
  p: `${n}/10 stamps — ${10 - n} lagi untuk diskon ${pct}%`,
  r: av ? `Reward unlocked! ${av} voucher diskon tersedia.` : n === 0 ? 'Mulai kumpulkan stamp dari pembelianmu.' : '',
});

export const LAST_TOKEN = 'ori-last-token';
export const saveLastToken = (t) => { try { localStorage.setItem(LAST_TOKEN, t); } catch { /* */ } };
export const getLastToken = () => { try { return localStorage.getItem(LAST_TOKEN); } catch { return null; } };
export const clearLastToken = () => { try { localStorage.removeItem(LAST_TOKEN); } catch { /* */ } };
