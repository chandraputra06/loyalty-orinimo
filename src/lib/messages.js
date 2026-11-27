// Teks pesan WhatsApp & ringkasan yang dipakai di banyak halaman.
import { cardLink, ORINIMO_WA } from '../config.js';
import { idr, waLink, fmtPhone } from './format.js';

export const cardMsg = (cu, token, s) =>
  `Thank you, Kak${cu.nickname ? ' ' + cu.nickname : ''}! \u{1F37F}\u263A\uFE0F Sampai jumpa di order berikutnya.\n\n` +
  `Ini kartu loyalty Orinimo Kakak:\n${cardLink(token)}\n\n` +
  `Setiap transaksi sebesar ${idr(s.unit)} mendapatkan 1 stamp. Kumpulkan 10 stamp untuk mendapat diskon ${s.pct}%.\n` +
  `Simpan link ini dan jangan bagikan kepada orang lain.\n\n` +
  `Ingin bergabung ke saluran Orinimo atau ada pertanyaan? Hubungi admin:\n` +
  `AdminOrinimo: https://wa.me/${ORINIMO_WA}`;

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
