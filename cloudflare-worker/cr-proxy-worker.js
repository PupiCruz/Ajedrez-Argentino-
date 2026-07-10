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
//
// 3) Edición desde el teléfono (editar.html)
//    Endpoints (POST con JSON en el body):
//      POST /admin/live  { pin }                      → devuelve data/live-torneos.json FRESCO
//                                                       (leído de GitHub, no de la web publicada
//                                                       que tarda 1-2 min en redeplegar)
//      POST /admin/save  { pin, op, id, fields }      → modifica data/live-torneos.json y lo
//                                                       commitea a GitHub (Pages redepliega solo)
//        op:'merge'  + id + fields → parcha un torneo EXISTENTE (overrides[id])
//        op:'nuevo'  + fields      → crea un torneo cáscara (nuevos[], id ph_<timestamp>)
//        op:'clear'                → vacía el archivo (después de adoptar los cambios en la PC)
//    Seguridad:
//      - Secretos del Worker (Settings → Variables → Secrets, o `wrangler secret put`):
//          EDIT_PIN  = frase larga que se escribe en el teléfono
//          GH_TOKEN  = PAT fine-grained de GitHub, SOLO repo Ajedrez-Argentino-, permiso
//                      Contents: Read and write. Nada más.
//      - El Worker escribe ÚNICAMENTE data/live-torneos.json (la ruta está fija en el código):
//        aunque se filtre el PIN, no se puede tocar index.html ni ningún otro archivo.
//      - Rate-limit de PIN errado con D1 (tabla admin_rl, se crea sola): tras 12 intentos
//        fallidos en una hora, se bloquea una hora. Sin D1 igual funciona (sin rate-limit).
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

    // ── Edición desde el teléfono (editar.html) ──
    if (reqUrl.pathname === '/admin/live') return adminLive(request, env);
    if (reqUrl.pathname === '/admin/save') return adminSave(request, env);

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// ─────────────────────────────────────────────────────────────────────────────
// EDICIÓN DESDE EL TELÉFONO — /admin/live y /admin/save
// El teléfono (editar.html) manda un PIN; el token de GitHub vive SOLO acá como
// secreto. El Worker únicamente puede tocar data/live-torneos.json (ruta fija).
// ─────────────────────────────────────────────────────────────────────────────

const GH_REPO = 'PupiCruz/Ajedrez-Argentino-';
const GH_BRANCH = 'main';
const LIVE_PATH = 'data/live-torneos.json';          // ÚNICO archivo que este Worker puede escribir
const RL_MAX_FAILS = 12;                             // intentos de PIN errados permitidos…
const RL_WINDOW_S = 3600;                            // …por hora (después, bloqueo de 1 hora)
const MAX_NUEVOS = 20;                               // tope de torneos "cáscara" pendientes

// Campos que el teléfono puede mandar. Cualquier otro se descarta.
//   url:1 → tiene que ser https://…  ·  max → largo máximo del texto
const ADMIN_FIELDS = {
  name:            { max: 160 },
  type:            { max: 30 },
  location:        { max: 160 },
  tournamentDates: { max: 80 },
  startDate:       { max: 10 },   // AAAA-MM-DD
  endDate:         { max: 10 },
  rounds:          { int: true },
  crUrl:           { max: 400, url: true },
  weburl:          { max: 400, url: true },
  info64url:       { max: 400, url: true },
  broadcastUrl:    { max: 400, url: true },
  broadcastId:     { max: 20 },
  timeControl:     { max: 80 },
  format:          { max: 12 },
  flyerUrl:        { max: 500, url: true },   // link a la imagen del afiche (https)
};

// Limpia un objeto de campos según la whitelist. null/'' = "borrar este campo" (se
// conserva como null: la app lo interpreta como campo vacío). Sin < ni > (anti-HTML).
function adminCleanFields(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(ADMIN_FIELDS)) {
    if (!(k in raw)) continue;
    const spec = ADMIN_FIELDS[k];
    let v = raw[k];
    if (v == null || v === '') { out[k] = null; continue; }
    if (spec.int) {
      v = parseInt(v, 10);
      out[k] = (isFinite(v) && v >= 1 && v <= 99) ? v : null;
      continue;
    }
    v = String(v).replace(/[<>]/g, '').trim().slice(0, spec.max || 200);
    if (spec.url && v && !/^https:\/\//i.test(v)) continue;   // solo links https
    out[k] = v || null;
  }
  return out;
}

// Valida el PIN contra el secreto EDIT_PIN, con rate-limit en D1 (si hay binding).
// Devuelve null si está todo bien, o una Response de error para devolver tal cual.
async function adminCheckPin(pin, env) {
  if (!env.EDIT_PIN) return errJson('La edición remota no está configurada (falta el secreto EDIT_PIN)', 503);
  // Rate-limit: contamos PIN errados en la última hora. Sin D1, seguimos sin contar.
  let rlRow = null;
  if (env.DB) {
    try {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS admin_rl (k TEXT PRIMARY KEY, n INTEGER, ts INTEGER)').run();
      rlRow = await env.DB.prepare('SELECT n, ts FROM admin_rl WHERE k = ?1').bind('pinfail').first();
      const now = Math.floor(Date.now() / 1000);
      if (rlRow && (now - (rlRow.ts || 0)) > RL_WINDOW_S) rlRow = null;   // ventana vencida: de cero
      if (rlRow && rlRow.n >= RL_MAX_FAILS) return errJson('Demasiados intentos fallidos. Probá de nuevo en una hora.', 429);
    } catch (e) { rlRow = null; }
  }
  if (typeof pin !== 'string' || pin !== env.EDIT_PIN) {
    if (env.DB) {
      try {
        const now = Math.floor(Date.now() / 1000);
        const n = rlRow ? (rlRow.n + 1) : 1;
        const ts = rlRow ? rlRow.ts : now;
        await env.DB.prepare(
          'INSERT INTO admin_rl (k, n, ts) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(k) DO UPDATE SET n = ?2, ts = ?3'
        ).bind('pinfail', n, ts).run();
      } catch (e) {}
    }
    return errJson('PIN incorrecto', 403);
  }
  return null;
}

// base64 ⇄ texto UTF-8 (la API de GitHub manda/recibe el contenido en base64).
function b64ToUtf8(b64) {
  const bin = atob((b64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function ghHeaders(env) {
  return {
    'Authorization': 'Bearer ' + env.GH_TOKEN,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'AjedrezArgentino-Worker',      // GitHub exige User-Agent
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// Baja data/live-torneos.json del repo. Devuelve { data, sha }. Si el archivo no
// existe todavía (404), devuelve el esqueleto vacío con sha null (el PUT lo crea).
async function ghGetLive(env) {
  const url = 'https://api.github.com/repos/' + GH_REPO + '/contents/' + LIVE_PATH + '?ref=' + GH_BRANCH;
  const r = await fetch(url, { headers: ghHeaders(env) });
  if (r.status === 404) return { data: { version: 1, nuevos: [], overrides: {} }, sha: null };
  if (!r.ok) throw new Error('GitHub GET ' + r.status);
  const j = await r.json();
  let data;
  try { data = JSON.parse(b64ToUtf8(j.content)); } catch (e) { data = null; }
  // Archivo roto o con otra forma: arrancar de un esqueleto sano (nunca propagar basura).
  if (!data || typeof data !== 'object') data = { version: 1, nuevos: [], overrides: {} };
  if (!Array.isArray(data.nuevos)) data.nuevos = [];
  if (!data.overrides || typeof data.overrides !== 'object') data.overrides = {};
  return { data, sha: j.sha };
}

// Commitea el JSON nuevo. Si otro guardado se metió en el medio (409), el que llama reintenta.
async function ghPutLive(env, data, sha, message) {
  const url = 'https://api.github.com/repos/' + GH_REPO + '/contents/' + LIVE_PATH;
  const body = {
    message: message,
    content: utf8ToB64(JSON.stringify(data, null, 2) + '\n'),
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: { ...ghHeaders(env), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text();
    const e = new Error('GitHub PUT ' + r.status + ': ' + txt.slice(0, 200));
    e.status = r.status;
    throw e;
  }
}

// POST /admin/live { pin } → el live-torneos.json FRESCO (desde GitHub, no desde Pages).
async function adminLive(request, env) {
  if (request.method !== 'POST') return errJson('Usar POST', 405);
  let body; try { body = await request.json(); } catch (e) { return errJson('Body inválido', 400); }
  const bad = await adminCheckPin(body && body.pin, env);
  if (bad) return bad;
  if (!env.GH_TOKEN) return errJson('Falta el secreto GH_TOKEN en el Worker', 503);
  try {
    const { data } = await ghGetLive(env);
    return jsonResp({ ok: true, live: data });
  } catch (e) {
    return errJson('No se pudo leer de GitHub: ' + e.message, 502);
  }
}

// POST /admin/save { pin, op:'merge'|'nuevo'|'clear', id?, fields? }
async function adminSave(request, env) {
  if (request.method !== 'POST') return errJson('Usar POST', 405);
  let body; try { body = await request.json(); } catch (e) { return errJson('Body inválido', 400); }
  const bad = await adminCheckPin(body && body.pin, env);
  if (bad) return bad;
  if (!env.GH_TOKEN) return errJson('Falta el secreto GH_TOKEN en el Worker', 503);

  const op = body.op;
  if (op !== 'merge' && op !== 'nuevo' && op !== 'clear') return errJson('Operación inválida (merge | nuevo | clear)', 400);

  // Leer → modificar → commitear. Si dos guardados chocan (409 de GitHub), reintentar una vez.
  for (let attempt = 0; attempt < 2; attempt++) {
    let cur;
    try { cur = await ghGetLive(env); } catch (e) { return errJson('No se pudo leer de GitHub: ' + e.message, 502); }
    const data = cur.data;
    let msg = 'Teléfono: cambios';

    if (op === 'clear') {
      data.nuevos = [];
      data.overrides = {};
      msg = 'Teléfono: vaciar cambios pendientes';
    } else if (op === 'merge') {
      const id = String(body.id || '').slice(0, 80);
      if (!id) return errJson('Falta el id del torneo', 400);
      const fields = adminCleanFields(body.fields);
      if (!Object.keys(fields).length) return errJson('No hay campos válidos para guardar', 400);
      // Torneo creado desde el teléfono (ph_…): editar SU entrada en `nuevos` (un override
      // no le aplicaría: la app solo aplica overrides a torneos que ya están en el manifest).
      const nIdx = data.nuevos.findIndex((n) => n && String(n.id) === id);
      if (nIdx >= 0) {
        if (fields.name == null) delete fields.name;   // el nombre nunca se blanquea
        data.nuevos[nIdx] = Object.assign({}, data.nuevos[nIdx], fields);
      } else {
        data.overrides[id] = Object.assign({}, data.overrides[id] || {}, fields);
      }
      msg = 'Teléfono: editar torneo ' + (fields.name || id);
    } else { // 'nuevo'
      const fields = adminCleanFields(body.fields);
      if (!fields.name) return errJson('El nombre del torneo es obligatorio', 400);
      if (data.nuevos.length >= MAX_NUEVOS) return errJson('Hay demasiados torneos pendientes de adoptar. Vaciá los pendientes desde la PC.', 400);
      fields.id = 'ph_' + Date.now();
      data.nuevos.push(fields);
      msg = 'Teléfono: nuevo torneo ' + fields.name;
    }

    try {
      await ghPutLive(env, data, cur.sha, msg);
      return jsonResp({ ok: true, live: data });
    } catch (e) {
      if (e.status === 409 && attempt === 0) continue;   // choque de versiones: releer y reintentar
      return errJson('No se pudo guardar en GitHub: ' + e.message, 502);
    }
  }
  return errJson('No se pudo guardar (conflicto repetido). Probá de nuevo.', 502);
}
