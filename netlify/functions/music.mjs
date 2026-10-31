// Kofix music backend (Netlify Function + Netlify Blobs)
//   GET    /api/music                 public  -> list of enabled uploaded tracks
//   GET    /api/music/file/:id        public  -> audio (HTTP Range supported for mobile Safari)
//   POST   /api/music/login           {password} -> {token}
//   GET    /api/music/admin           admin   -> all tracks + settings
//   POST   /api/music/chunk           admin   -> upload one chunk of a file
//   POST   /api/music/finish          admin   -> finish an upload (writes the track record)
//   POST   /api/music/update          admin   -> rename / enable / disable (built-in tracks too)
//   DELETE /api/music/:id             admin   -> delete an uploaded track
// Set ADMIN_PASSWORD in Netlify: Site configuration > Environment variables.

import crypto from 'node:crypto';

export const CHUNK = 3 * 1024 * 1024;          // upload chunk size (keeps requests under Netlify's 6 MB limit)
const MAX_RANGE = 4 * 1024 * 1024;             // max bytes returned per range response
const MAX_FILE = 80 * 1024 * 1024;
const ID_RE = /^[a-z0-9-]{8,48}$/;
const EXT_OK = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4)$/i;

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

function sign(payload, secret) { return crypto.createHmac('sha256', secret).update(payload).digest('base64url'); }
function makeToken(secret) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 3600 * 1000 })).toString('base64url');
  return payload + '.' + sign(payload, secret);
}
function checkToken(token, secret) {
  if (!token || !secret) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const good = sign(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

export function createHandler(getStore, env = (k) => process.env[k]) {
  const store = () => getStore({ name: 'kofix-music', consistency: 'strong' });
  const secret = () => { const p = env('ADMIN_PASSWORD'); return p ? 'kofix:' + p + ':' + (env('TOKEN_SECRET') || '') : ''; };
  const isAdmin = (req) => checkToken((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), secret());

  async function readMetas(s) {
    const { blobs } = await s.list({ prefix: 'meta/' });
    const metas = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }).catch(() => null)));
    return metas.filter(Boolean).sort((a, b) => (a.created || 0) - (b.created || 0));
  }
  async function readSettings(s) { return (await s.get('settings', { type: 'json' }).catch(() => null)) || { disabled: [], titles: {} }; }
  const pub = (m) => ({ id: m.id, title: m.title, src: '/api/music/file/' + m.id, size: m.size, enabled: m.enabled !== false });

  return async function handler(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/music\/?/, '').replace(/\/+$/, '');
    const parts = path ? path.split('/') : [];
    const method = req.method;
    const s = store();

    try {
      // ---- public list ----
      if (method === 'GET' && parts.length === 0) {
        const [metas, settings] = await Promise.all([readMetas(s), readSettings(s)]);
        return json({ tracks: metas.filter((m) => m.enabled !== false).map(pub), disabled: settings.disabled || [], titles: settings.titles || {} },
          200, { 'cache-control': 'public, max-age=20' });
      }

      // ---- public audio with Range ----
      if (method === 'GET' && parts[0] === 'file' && parts[1]) {
        const id = parts[1];
        if (!ID_RE.test(id)) return new Response('Not found', { status: 404 });
        const meta = await s.get('meta/' + id, { type: 'json' });
        if (!meta || meta.enabled === false) return new Response('Not found', { status: 404 });
        const size = meta.size, chunk = meta.chunk || CHUNK;
        let start = 0, end = Math.min(size - 1, MAX_RANGE - 1);
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
        if (m) {
          if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
          else { start = parseInt(m[1], 10) || 0; end = m[2] !== '' ? parseInt(m[2], 10) : size - 1; }
          if (start >= size) return new Response('Range Not Satisfiable', { status: 416, headers: { 'content-range': `bytes */${size}` } });
          end = Math.min(end, size - 1, start + MAX_RANGE - 1);
        }
        const first = Math.floor(start / chunk), last = Math.floor(end / chunk), bufs = [];
        for (let i = first; i <= last; i++) {
          const ab = await s.get(`data/${id}/${i}`, { type: 'arrayBuffer' });
          if (!ab) return new Response('Missing data', { status: 500 });
          const from = i === first ? start - first * chunk : 0;
          const to = i === last ? end - last * chunk + 1 : ab.byteLength;
          bufs.push(Buffer.from(ab, from, to - from));
        }
        const body = Buffer.concat(bufs);
        return new Response(body, {
          status: 206,
          headers: { 'content-type': meta.type || 'audio/mpeg', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`,
            'content-length': String(body.length), 'cache-control': 'public, max-age=86400' }
        });
      }

      // ---- login ----
      if (method === 'POST' && parts[0] === 'login') {
        if (!env('ADMIN_PASSWORD')) return json({ error: 'ADMIN_PASSWORD is not set. Add it in Netlify > Site configuration > Environment variables, then redeploy.' }, 503);
        const { password } = await req.json().catch(() => ({}));
        if (!password || !safeEqual(password, env('ADMIN_PASSWORD'))) { await new Promise((r) => setTimeout(r, 700)); return json({ error: 'Wrong password' }, 401); }
        return json({ token: makeToken(secret()) });
      }

      // ---- everything below needs the admin token ----
      if (!isAdmin(req)) return json({ error: 'Unauthorized' }, 401);

      if (method === 'GET' && parts[0] === 'admin') {
        const [metas, settings] = await Promise.all([readMetas(s), readSettings(s)]);
        return json({ tracks: metas.map(pub), settings });
      }

      if (method === 'POST' && parts[0] === 'chunk') {
        const id = url.searchParams.get('id'), index = parseInt(url.searchParams.get('index'), 10), total = parseInt(url.searchParams.get('total'), 10);
        if (!ID_RE.test(id || '') || !(index >= 0) || !(total > 0) || index >= total || total * CHUNK > MAX_FILE + CHUNK) return json({ error: 'Bad request' }, 400);
        const buf = await req.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > CHUNK + 1024) return json({ error: 'Bad chunk size' }, 400);
        await s.set(`data/${id}/${index}`, buf);
        return json({ ok: true });
      }

      if (method === 'POST' && parts[0] === 'finish') {
        const b = await req.json().catch(() => ({}));
        if (!ID_RE.test(b.id || '') || !b.name || !EXT_OK.test(b.name) || !(b.size > 0) || b.size > MAX_FILE) return json({ error: 'Invalid audio file (use mp3, m4a, wav, ogg, aac or flac, up to 80 MB)' }, 400);
        const chunks = Math.ceil(b.size / CHUNK);
        for (let i = 0; i < chunks; i++) {
          const exists = await s.getMetadata(`data/${b.id}/${i}`).catch(() => null);
          if (!exists) return json({ error: 'Upload incomplete, please try again' }, 400);
        }
        const ext = b.name.split('.').pop().toLowerCase();
        const types = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', mp4: 'audio/mp4' };
        const meta = { id: b.id, title: String(b.title || b.name.replace(/\.[^.]+$/, '')).slice(0, 120), size: b.size, chunk: CHUNK, type: types[ext] || 'audio/mpeg', enabled: true, created: Date.now() };
        await s.setJSON('meta/' + b.id, meta);
        return json({ ok: true, track: pub(meta) });
      }

      if (method === 'POST' && parts[0] === 'update') {
        const b = await req.json().catch(() => ({}));
        if (typeof b.id !== 'string') return json({ error: 'Bad request' }, 400);
        if (ID_RE.test(b.id) && !b.id.startsWith('builtin-')) {
          const meta = await s.get('meta/' + b.id, { type: 'json' });
          if (!meta) return json({ error: 'Not found' }, 404);
          if (typeof b.enabled === 'boolean') meta.enabled = b.enabled;
          if (typeof b.title === 'string' && b.title.trim()) meta.title = b.title.trim().slice(0, 120);
          await s.setJSON('meta/' + b.id, meta);
          return json({ ok: true });
        }
        if (/^builtin-[a-z0-9-]{1,40}$/.test(b.id)) {
          const st = await readSettings(s);
          st.disabled = st.disabled || [];
          if (typeof b.enabled === 'boolean') st.disabled = b.enabled ? st.disabled.filter((x) => x !== b.id) : Array.from(new Set(st.disabled.concat(b.id)));
          await s.setJSON('settings', st);
          return json({ ok: true });
        }
        return json({ error: 'Bad request' }, 400);
      }

      if (method === 'DELETE' && parts[0] && ID_RE.test(parts[0])) {
        const id = parts[0];
        const meta = await s.get('meta/' + id, { type: 'json' });
        if (meta) {
          const n = Math.ceil(meta.size / (meta.chunk || CHUNK));
          for (let i = 0; i < n; i++) await s.delete(`data/${id}/${i}`);
        }
        const { blobs } = await s.list({ prefix: `data/${id}/` });   // sweep leftovers from interrupted uploads
        for (const bl of blobs) await s.delete(bl.key);
        await s.delete('meta/' + id);
        return json({ ok: true });
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('music error', err);
      return json({ error: 'Server error' }, 500);
    }
  };
}

let real;
export default async (req, context) => {
  if (!real) { const { getStore } = await import('@netlify/blobs'); real = createHandler(getStore); }
  return real(req, context);
};

export const config = { path: ['/api/music', '/api/music/*'] };
