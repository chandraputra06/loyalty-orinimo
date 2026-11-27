// Notifikasi realtime: stamp baru langsung muncul di kartu pelanggan.
// Produksi: Supabase Realtime Broadcast. Demo: BroadcastChannel antar-tab.
import { IS_DEMO } from '../config.js';
import { getSupabase } from './supabaseApi.js';

const sbc = () => getSupabase();

const cardTopic = (token) => 'card-' + token;
const PROGRAM = 'program';

function localSub(topic, cb) {
  let bc = null;
  try { bc = new BroadcastChannel('orinimo-' + topic); bc.onmessage = (e) => cb(e.data); } catch { /* tidak didukung */ }
  return () => bc && bc.close();
}
function localSend(topic, payload) {
  try { const bc = new BroadcastChannel('orinimo-' + topic); bc.postMessage(payload); bc.close(); } catch { /* */ }
}

function remoteSub(topic, cb) {
  const sb = sbc();
  const ch = sb.channel(topic).on('broadcast', { event: 'update' }, ({ payload }) => cb(payload)).subscribe();
  return () => sb.removeChannel(ch);
}
async function remoteSend(topic, payload) {
  const sb = sbc();
  const ch = sb.channel(topic);
  try {
    await ch.httpSend('update', payload);
  } catch {
    // cadangan untuk server Realtime versi lama: kirim lewat websocket
    await new Promise((res) => {
      const t = setTimeout(res, 4000);
      ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') { await ch.send({ type: 'broadcast', event: 'update', payload }); clearTimeout(t); res(); } });
    });
  } finally {
    sb.removeChannel(ch);
  }
}

export const subscribeCard = (token, cb) => (IS_DEMO ? localSub(cardTopic(token), cb) : remoteSub(cardTopic(token), cb));
export const notifyCard = (token, payload) => (IS_DEMO ? localSend(cardTopic(token), payload) : remoteSend(cardTopic(token), payload).catch(() => {}));
export const subscribeProgram = (cb) => (IS_DEMO ? localSub(PROGRAM, cb) : remoteSub(PROGRAM, cb));
export const notifyProgram = (payload) => (IS_DEMO ? localSend(PROGRAM, payload) : remoteSend(PROGRAM, payload).catch(() => {}));
// demo: tab admin lain ikut tahu ada data baru
export const subscribeAdmin = (cb) => (IS_DEMO ? localSub('admin', cb) : () => {});
export const notifyAdmin = (payload) => { if (IS_DEMO) localSend('admin', payload); };
