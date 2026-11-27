// Pengaturan dari file .env (lihat .env.example)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const ORINIMO_WA = (import.meta.env.VITE_ORINIMO_WA || '6281234567890').replace(/\D/g, '');

// Tanpa Supabase, aplikasi berjalan dalam mode demo (data di browser).
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const cardLink = (token) => `${window.location.origin}/k/${token}`;
