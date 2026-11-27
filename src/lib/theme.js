// Tema kartu, bentuk cap stamp, dan pemilihan tema aktif.
import { todayStr } from './format.js';

export const PRESETS = [
  { id: 'default', name: 'Bioskop merah', base: 'default', ink: '#e0353d', shape: 'scallop', builtin: true },
  { id: 'night', name: 'Malam premiere', base: 'night', ink: '#ffd166', shape: 'star', builtin: true },
  { id: 'pink', name: 'Pink manis', base: 'pink', ink: '#e0466a', shape: 'heart', builtin: true },
];
export const BASE_SW = {
  default: 'linear-gradient(160deg,#f45a5e,#cf3640)',
  night: 'linear-gradient(160deg,#28306b,#141633)',
  pink: 'linear-gradient(160deg,#f07c98,#c93d62)',
};
export const INKS = ['#e0353d', '#e0466a', '#e8a317', '#ffd166', '#2f5fd0', '#2f9c6f', '#3b1f2b'];
export const SHAPES = [
  ['scallop', 'Lencana'],
  ['circle', 'Bulat'],
  ['heart', 'Hati'],
  ['star', 'Bintang'],
  ['logo', 'Logo'],
];

export const SCAL = (() => {
  let d = '';
  const n = 14, R = 16.4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const x = (20 + R * Math.cos(a)).toFixed(2), y = (20 + R * Math.sin(a)).toFixed(2);
    d += i ? `A3.9 3.9 0 0 1 ${x} ${y}` : `M${x} ${y}`;
  }
  return d + 'Z';
})();
export const SHAPE_PATH = {
  scallop: SCAL,
  circle: 'M20 2.8a17.2 17.2 0 1 1 0 34.4a17.2 17.2 0 1 1 0-34.4z',
  heart: 'M20 35.5S3.5 25.5 3.5 14a8.2 8.2 0 0 1 16.5-3 8.2 8.2 0 0 1 16.5 3c0 11.5-16.5 21.5-16.5 21.5z',
  star: 'M20 2.5l5 10.6 11.6 1.3-8.7 7.9 2.5 11.4L20 27.9 9.6 33.7l2.5-11.4-8.7-7.9 11.6-1.3z',
};
export const POPI =
  '<g><circle cx="16.2" cy="15.6" r="2.9"/><circle cx="20" cy="13.6" r="3.3"/><circle cx="23.8" cy="15.6" r="2.9"/></g><path d="M14 17.4h12l-1.7 8.6h-8.6z"/><path d="M17.6 17.4h1.5l.2 8.6h-1.4zM21 17.4h1.5l-.4 8.6h-1.3z" fill="#fff"/>';
export const GHOST = `<svg class="ghost" viewBox="12 10 16 17" aria-hidden="true"><g fill="currentColor">${POPI}</g></svg>`;
export const ROT = [-14, 9, -6, 17, -11, 6, -18, 12, -4, 10];

export function impSvg(shape) {
  if (shape === 'logo')
    return '<svg class="imp logo-imp" viewBox="0 0 40 40" aria-hidden="true"><image href="/assets/logo.webp" x="1" y="1" width="38" height="38"/></svg>';
  const ring = shape === 'scallop' || shape === 'circle';
  return `<svg class="imp" viewBox="0 0 40 40" aria-hidden="true"><path d="${SHAPE_PATH[shape] || SCAL}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>${
    ring ? '<circle cx="20" cy="20" r="12.6" fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="1.6 1.2"/>' : ''
  }<g fill="currentColor" ${ring ? '' : 'transform="translate(4 3.2) scale(.8)"'}>${POPI}</g>${
    ring ? '<text x="20" y="31" text-anchor="middle" font-size="3.9" font-weight="700" fill="currentColor" font-family="Fredoka,sans-serif">ORINIMO</text>' : ''
  }</svg>`;
}

// URL gambar yang aman dipakai di CSS: data:image/* atau https tanpa tanda kutip/kurung
export const okImg = (u) =>
  typeof u === 'string' &&
  (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || /^https:\/\/[^\s'"()<>]+$/.test(u));

export const okInk = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#e0353d');

export const allThemes = (custom) => [...PRESETS, ...(custom || [])];
export const themeById = (custom, id) => allThemes(custom).find((t) => t.id === id) || PRESETS[0];

export function activeTheme(custom, design) {
  const d = todayStr();
  const sch = (custom || []).find((t) => t.from && t.to && t.from <= d && d <= t.to);
  return sch || themeById(custom, design?.activeId || 'default');
}
