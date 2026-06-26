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
//      GET /puzhit?id=<id>&r=ok|fail[&vr=<rating visitante>&pr=<semilla autor>]
//                                       → suma 1 acierto/error y RECALIBRA el rating del ejercicio (Elo)
//      GET /puzstats                    → devuelve { "<id>": {ok, fail, rating, nb}, ... } (todos)
//    Requiere un binding D1 llamado DB (ver instrucciones). Si no está, /puzstats
//    devuelve {} y /puzhit responde error, pero el proxy de arriba sigue andando.
//    Esquema (correr una vez en la consola de D1):
//      CREATE TABLE IF NOT EXISTS puz_stats (
//        id TEXT PRIMARY KEY, ok INTEGER DEFAULT 0, fail INTEGER DEFAULT 0);
//    Para la calibración de dificultad (Elo), agregar las columnas nuevas UNA vez:
//      ALTER TABLE puz_stats ADD COLUMN rating REAL;
//      ALTER TABLE puz_stats ADD COLUMN nb INTEGER DEFAULT 0;
//    (Si todavía no se corrieron, /puzhit sigue contando aciertos/errores y la
//     calibración simplemente queda inactiva hasta que existan las columnas.)
//
//    Cómo se calibra: cada ejercicio es como un "jugador" con su propio rating. Cada
//    intento es una partida visitante-vs-ejercicio. Si el visitante acierta, el
//    ejercicio baja un poco (era más fácil de lo pensado); si falla, sube. Cuánto se
//    mueve depende de (a) la diferencia de rating entre ambos y (b) cuántos intentos
//    lleva el ejercicio: arranca moviéndose fuerte (K=24) y se va congelando (K→3).
//    El rating del visitante lo lleva su navegador (sin login) y llega en `vr`.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_HOST = /(^|\.)chess-results\.com$/i;
const ALLOWED_HOST_I64 = /(^|\.)info64\.org$/i;
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

    // ── Descarga de Excel de info64 (POST → JSON {url} → bajar el .xlsx) ──
    if (reqUrl.pathname === '/i64xls') return i64Xls(reqUrl, ctx);

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

// GET /i64xls?url=<endpoint de export de info64> → baja el .xlsx.
// info64 exporta en DOS pasos: POST al endpoint (ej. .../standings_xls) devuelve un JSON
// { "url": "/media/....xlsx" } y recién ahí se baja el archivo. El navegador no puede hacer
// ese POST cross-origin, así que lo hace el Worker y devuelve los bytes con CORS.
async function i64Xls(reqUrl, ctx) {
  const target = reqUrl.searchParams.get('url');
  if (!target) return errJson('Falta el parámetro ?url=', 400);
  let t;
  try { t = new URL(target); }
  catch (e) { return errJson('URL inválida', 400); }
  if (t.protocol !== 'https:' || !ALLOWED_HOST_I64.test(t.hostname)) {
    return errJson('Host no permitido (sólo info64.org)', 403);
  }

  // Caché: la respuesta final (el .xlsx) la guardamos ~2 min, igual que el proxy de CR.
  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Paso 1: POST al endpoint de export → JSON { url: "/media/....xlsx" }
  let meta;
  try {
    const r1 = await fetch(t.toString(), {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AjedrezArgentinoBot/1.0)',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': t.origin + '/',
      },
      body: '',
    });
    if (!r1.ok) return errJson('info64 export HTTP ' + r1.status, 502);
    meta = await r1.json();
  } catch (e) {
    return errJson('No se pudo pedir el export a info64: ' + e.message, 502);
  }
  if (!meta || !meta.url) return errJson('info64 no devolvió la URL del archivo', 502);

  // Paso 2: bajar el .xlsx (la url viene relativa al dominio de info64).
  let upstream;
  try {
    upstream = await fetch(new URL(meta.url, t.origin).toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AjedrezArgentinoBot/1.0)' },
      redirect: 'follow',
    });
  } catch (e) {
    return errJson('No se pudo bajar el .xlsx de info64: ' + e.message, 502);
  }

  const headers = corsHeaders();
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);
  headers.set('Cache-Control', 'public, max-age=' + CACHE_SECONDS);
  const resp = new Response(upstream.body, { status: upstream.status, headers });
  if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

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

// K de Elo del EJERCICIO: cuánto se mueve su rating según cuántos intentos lleva.
// Mucho al principio (se acomoda rápido a su nivel real) y casi nada cuando ya está calibrado.
function puzK(nb) { if (nb < 50) return 24; if (nb < 200) return 12; if (nb < 1000) return 6; return 3; }
function clampRating(r) { return Math.max(400, Math.min(3000, r)); }

// GET /puzhit?id=<id>&r=ok|fail[&vr=<rating visitante>&pr=<semilla autor>]
//   1) Suma 1 al contador de aciertos/errores (upsert atómico; nunca rompe).
//   2) Si llega `vr`, recalibra el rating del ejercicio con un paso de Elo.
async function puzHit(reqUrl, env) {
  const id = (reqUrl.searchParams.get('id') || '').slice(0, 80);
  const r = reqUrl.searchParams.get('r');
  if (!id || (r !== 'ok' && r !== 'fail')) return errJson('Parámetros inválidos (id, r=ok|fail)', 400);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const ok = r === 'ok' ? 1 : 0, fail = r === 'fail' ? 1 : 0;
  // (1) Contador — upsert atómico, así dos personas a la vez no pisan el conteo.
  try {
    await env.DB.prepare(
      'INSERT INTO puz_stats (id, ok, fail) VALUES (?1, ?2, ?3) ' +
      'ON CONFLICT(id) DO UPDATE SET ok = ok + ?2, fail = fail + ?3'
    ).bind(id, ok, fail).run();
  } catch (e) {
    return errJson('D1 error: ' + e.message, 500);
  }
  // (2) Calibración Elo. Necesita las columnas rating/nb (ver ALTER TABLE en el encabezado).
  //     Si no existen todavía, el try/catch lo absorbe y seguimos sin calibrar.
  const vr = parseFloat(reqUrl.searchParams.get('vr'));   // rating del visitante (de su navegador)
  const pr = parseFloat(reqUrl.searchParams.get('pr'));   // semilla del autor (solo si el ejercicio es nuevo)
  if (isFinite(vr)) {
    try {
      const row = await env.DB.prepare('SELECT rating, nb FROM puz_stats WHERE id = ?1').bind(id).first();
      let R = (row && row.rating != null) ? row.rating : (isFinite(pr) ? pr : 1500);
      const nb = (row && row.nb != null) ? row.nb : 0;
      R = clampRating(R);
      const S = ok ? 1 : 0;                                              // puntaje del visitante
      const E = 1 / (1 + Math.pow(10, (R - clampRating(vr)) / 400));     // prob. de que acierte
      let d = puzK(nb) * (E - S);                                        // cuánto se mueve el ejercicio
      if (d > 32) d = 32; else if (d < -32) d = -32;                    // tope de seguridad por intento
      R = clampRating(R + d);
      await env.DB.prepare('UPDATE puz_stats SET rating = ?2, nb = ?3 WHERE id = ?1')
        .bind(id, R, nb + 1).run();
    } catch (e) { /* faltan las columnas rating/nb: contamos pero no calibramos */ }
  }
  return jsonResp({ ok: true });
}

// GET /puzstats → { "<id>": {ok, fail, rating, nb}, ... } con TODOS los ejercicios que tienen datos.
// Si no hay binding D1, devuelve {} (la web sigue andando, solo sin estadísticas).
async function puzStats(env) {
  if (!env.DB) return jsonResp({}, 200, STATS_CACHE_SECONDS);
  let results;
  try {
    ({ results } = await env.DB.prepare('SELECT id, ok, fail, rating, nb FROM puz_stats').all());
  } catch (e) {
    // Base vieja sin las columnas de calibración: caemos al esquema mínimo.
    try { ({ results } = await env.DB.prepare('SELECT id, ok, fail FROM puz_stats').all()); }
    catch (e2) { return jsonResp({}, 200, STATS_CACHE_SECONDS); }
  }
  const out = {};
  for (const row of (results || [])) {
    const o = { ok: row.ok || 0, fail: row.fail || 0 };
    if (row.rating != null) o.rating = Math.round(row.rating);
    if (row.nb != null) o.nb = row.nb || 0;
    out[row.id] = o;
  }
  return jsonResp(out, 200, STATS_CACHE_SECONDS);
}
