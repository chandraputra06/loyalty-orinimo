// Error dari server berformat "KODE|Pesan untuk pengguna"
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function toApiError(e) {
  if (e instanceof ApiError) return e;
  const msg = String(e?.message || e || 'Terjadi kesalahan.');
  const i = msg.indexOf('|');
  if (i > 0 && /^[A-Z_]+$/.test(msg.slice(0, i))) return new ApiError(msg.slice(0, i), msg.slice(i + 1));
  if (/Failed to fetch|NetworkError/i.test(msg)) return new ApiError('NETWORK', 'Koneksi internet bermasalah. Coba lagi.');
  if (/Invalid login credentials/i.test(msg)) return new ApiError('INVALID_LOGIN', 'Email atau password salah.');
  return new ApiError('UNKNOWN', msg);
}
