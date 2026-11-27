import qrcode from 'qrcode-generator';

// QR sebagai string SVG (dipakai di kartu dan mode "Perbesar QR").
export function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), m = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR kartu"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#141414"/></svg>`;
}

export const qrPayload = (token) => 'ORINIMO:' + token;
