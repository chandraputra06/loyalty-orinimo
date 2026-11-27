// Pintu tunggal ke data: otomatis memakai Supabase jika .env terisi, kalau tidak mode demo.
import { IS_DEMO } from '../config.js';
import { demoApi } from './demoApi.js';
import { supabaseApi } from './supabaseApi.js';
import { toApiError } from './errors.js';

const impl = IS_DEMO ? demoApi : supabaseApi;

// setiap fungsi melempar ApiError {code, message} yang ramah pengguna
export const api = new Proxy(impl, {
  get(target, key) {
    const v = target[key];
    if (typeof v !== 'function') return v;
    return async (...args) => {
      try { return await v.apply(target, args); } catch (e) { throw toApiError(e); }
    };
  },
});
