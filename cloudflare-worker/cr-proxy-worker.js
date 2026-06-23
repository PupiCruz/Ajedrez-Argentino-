// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker — Ajedrez Argentino (proxy Chess-Results + stats de ejercicios)
// ─────────────────────────────────────────────────────────────────────────────
// 1) Proxy CORS para Chess-Results
//    chess-results.com NO manda headers CORS, así que el navegador bloquea que la app
//    baje sus archivos .xlsx directamente. Este Worker los baja del lado servidor
//    (donde no hay CORS) y los reenvía con permiso CORS.
//      Uso:  https://<tu-worker>.workers.dev/?url=<URL de chess-results url-encodeada>
//    Seguridad: sólo deja pasar URLs de chess-results.com (no es un proxy abierto).
//    Caché: guarda cada respuesta ~2 min, así muchos visitantes no martillan al sitio.
//
// 2) Estadísticas de ejercicios (aciertos/errores de la gente) en una base D1
//    Endpoints:
//      GET /puzhit?id=<id>&r=ok|fail   → suma 1 acierto o 1 error a ese ejercicio
//      GET /puzstats                   → devuelve { "<id>": {ok, fail}, ... } (todos)
//    Requiere un binding D1 llamado DB (ver instrucciones). Si no está, /puzstats
//    devuelve {} y /puzhit responde error, pero el proxy de arriba sigue andando.
//    Esquema (correr una vez en la consola de D1):
//      CREATE TABLE IF NOT EXISTS puz_stats (
//        id TEXT PRIMARY KEY, ok INTEGER DEFAULT 0, fail INTEGER DEFAULT 0);
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_HOST = /(^|\.)chess-results\.com$/i;
const CACHE_SECONDS = 120;
const STATS_CACHE_SECONDS = 30;

export default {
  async fetch(request, env, ctx) {
    // Respuesta al "preflight" CORS que manda el navegador antes del fetch real.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const reqUrl = new URL(request.url);

    // ── Stats de ejercicios (D1) ──
    if (reqUrl.pathname === '/puzstats') return puzStats(env);
    if (reqUrl.pathname === '/puzhit')   return puzHit(reqUrl, env);

    // ── Proxy CORS Chess-Results ──
    const target = reqUrl.searchParams.get('url');
    if (!target) return errJson('Falta el parámetro ?url=', 400);

    let t;
    try { t = new URL(target); }
    catch (e) { return errJson('URL inválida', 400); }

    // Sólo chess-results.com por HTTPS — evita que el Worker sea un proxy abierto.
    if (t.protocol !== 'https:' || !ALLOWED_HOST.test(t.hostname)) {
      return errJson('Host no permitido (sólo chess-results.com)', 403);
    }

    // Caché: si ya bajamos esto hace poco, devolverlo sin volver a chess-results.
    const cache = caches.default;
    const cacheKey = new Request(reqUrl.toString());
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    let upstream;
    try {
      upstream = await fetch(t.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AjedrezArgentinoBot/1.0)' },
        redirect: 'follow', // chess-results.com a veces redirige (302) al nodo s2/s3...
      });
    } catch (e) {
      return errJson('No se pudo bajar de chess-results: ' + e.message, 502);
    }

    const headers = corsHeaders();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('Content-Type', ct);
    headers.set('Cache-Control', 'public, max-age=' + CACHE_SECONDS);

    const resp = new Response(upstream.body, { status: upstream.status, headers });

    // Guardar en caché en segundo plano (sólo si salió bien).
    if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  },
};

function corsHeaders() {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  });
}

function errJson(msg, status) {
  const h = corsHeaders();
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ error: msg }), { status, headers: h });
}

function jsonResp(obj, status, cacheSeconds) {
  const h = corsHeaders();
  h.set('Content-Type', 'application/json; charset=utf-8');
  if (cacheSeconds) h.set('Cache-Control', 'public, max-age=' + cacheSeconds);
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}

// GET /puzhit?id=<id>&r=ok|fail → suma 1 al contador del ejercicio (acierto o error).
// Upsert atómico en D1 (ON CONFLICT ... DO UPDATE), así dos personas a la vez no pisan el conteo.
async function puzHit(reqUrl, env) {
  const id = (reqUrl.searchParams.get('id') || '').slice(0, 80);
  const r = reqUrl.searchParams.get('r');
  if (!id || (r !== 'ok' && r !== 'fail')) return errJson('Parámetros inválidos (id, r=ok|fail)', 400);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const ok = r === 'ok' ? 1 : 0, fail = r === 'fail' ? 1 : 0;
  try {
    await env.DB.prepare(
      'INSERT INTO puz_stats (id, ok, fail) VALUES (?1, ?2, ?3) ' +
      'ON CONFLICT(id) DO UPDATE SET ok = ok + ?2, fail = fail + ?3'
    ).bind(id, ok, fail).run();
  } catch (e) {
    return errJson('D1 error: ' + e.message, 500);
  }
  return jsonResp({ ok: true });
}

// GET /puzstats → { "<id>": {ok, fail}, ... } con TODOS los ejercicios que tienen datos.
// Si no hay binding D1, devuelve {} (la web sigue andando, solo sin estadísticas).
async function puzStats(env) {
  if (!env.DB) return jsonResp({}, 200, STATS_CACHE_SECONDS);
  try {
    const { results } = await env.DB.prepare('SELECT id, ok, fail FROM puz_stats').all();
    const out = {};
    for (const row of (results || [])) out[row.id] = { ok: row.ok || 0, fail: row.fail || 0 };
    return jsonResp(out, 200, STATS_CACHE_SECONDS);
  } catch (e) {
    return jsonResp({}, 200, STATS_CACHE_SECONDS);
  }
}
