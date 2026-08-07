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
//        op:'pgn'    + id + name + pgnText → agrega partidas (PGN) a un torneo EXISTENTE. Se
//                                    guardan en OTRO archivo, data/live-partidas.json (las partidas
//                                    pueden ser grandes; no engordan el JSON de metadata). La web
//                                    las muestra dentro del torneo; en la PC se adoptan al pool.
//        op:'pgnclear' [+ id]      → vacía data/live-partidas.json (todo, o un torneo si viene id)
//    Seguridad:
//      - Secretos del Worker (Settings → Variables → Secrets, o `wrangler secret put`):
//          EDIT_PIN  = frase larga que se escribe en el teléfono
//          GH_TOKEN  = PAT fine-grained de GitHub, SOLO repo Ajedrez-Argentino-, permiso
//                      Contents: Read and write. Nada más.
//      - El Worker escribe ÚNICAMENTE data/live-torneos.json (la ruta está fija en el código):
//        aunque se filtre el PIN, no se puede tocar index.html ni ningún otro archivo.
//      - Rate-limit de PIN errado con D1 (tabla admin_rl, se crea sola): tras 12 intentos
//        fallidos en una hora, se bloquea una hora. Sin D1 igual funciona (sin rate-limit).
//
// 4) Redacción de noticias con IA (Workers AI)
//    POST /noticia  (JSON con los datos del torneo) → { ok, title, summary, body, raw }
//    Requiere el binding de Workers AI llamado AI (Settings → Bindings → Workers AI).
//    Ver el detalle arriba de la función noticiaAI(). Sin el binding: 503 y la app usa el
//    generador local. Modelo en NOTICIA_MODEL.
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

    // ── Descarga de las PARTIDAS (PGN) de un torneo de Chess-Results ──
    if (reqUrl.pathname === '/crpgn') return crPgn(reqUrl, ctx);

    // ── Redacción de noticias con IA (Workers AI) ──
    if (reqUrl.pathname === '/noticia') return noticiaAI(request, env);

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /crpgn?tnr=<id>[&fide=<id,id,…>][&host=s1.chess-results.com][&rd=N]
//   → devuelve el PGN con las partidas que el organizador subió al torneo.
//   · rd=N (opcional): baja SOLO la ronda N (setea txt_rdvon=txt_rdbis=N en el
//     formulario). Sin rd, baja TODAS las rondas (comportamiento original). Sirve para
//     la carga on-demand por ronda: en torneos grandes (Olimpiada, ~4000 partidas) bajar
//     todo al entrar es lentísimo. La caché es por URL, así que &rd= separa cada ronda.
//
// Cómo funciona (y por qué necesita al Worker): en la página del torneo, cuando el
// organizador cargó partidas, aparece "Hay N partidas para descargar" → lleva a
// PartieSuche.aspx, que tiene un botón "Descargar en formato PGN". Ese botón NO es un
// link: es un formulario ASP.NET viejo (postback). Para apretarlo hay que hacer 2 pasos:
//   1) GET a PartieSuche.aspx → guardar las cookies y los campos ocultos del formulario
//      (__VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION).
//   2) POST del formulario ENTERO (todos los campos, no solo los ocultos) agregando el
//      botón cb_DownLoadPGN. Contesta el .pgn como adjunto.
// El navegador no puede hacer eso (CORS + cookies cross-origin), el Worker sí.
//
// Detalles que costaron encontrarse (no tocar sin probar):
//   · Hay que postear al NODO final (s1/s2.chess-results.com), no a chess-results.com:
//     el redirect 302 se come el POST y devuelve 411 Length Required.
//   · Hay que mandar Content-Length explícito (si no, va chunked → 411).
//   · El formulario completo: si faltan los <select>, la página tira 500.
//   · combo_anzahl_zeilen = tope de partidas: 1=250 (default), 2=500, 3=1000, 5=2500.
//     Usamos 5 o un torneo grande se cortaría en las primeras 250.
//   · fide= filtra por jugador (uno o varios FIDE ID). Es la única forma de filtrar por
//     persona: el PGN de Chess-Results NO trae los FIDE ID en los headers, así que el
//     filtro hay que pedírselo a Chess-Results, no hacerlo acá.
// ─────────────────────────────────────────────────────────────────────────────
const CR_PGN_MAX_FIDE = 20;   // tope de jugadores por pedido (cada uno = 2 subrequests; el Worker permite 50)

async function crPgn(reqUrl, ctx) {
  const tnr = (reqUrl.searchParams.get('tnr') || '').trim();
  if (!/^\d{1,9}$/.test(tnr)) return errJson('Parámetro tnr inválido (debe ser el número del torneo)', 400);

  // Host opcional (el crUrl del torneo puede ser s1/s2/s3). Siempre dentro de chess-results.com.
  let host = (reqUrl.searchParams.get('host') || 'chess-results.com').trim();
  if (!ALLOWED_HOST.test(host)) return errJson('Host no permitido (sólo chess-results.com)', 403);

  const fideList = (reqUrl.searchParams.get('fide') || '')
    .split(',').map(s => s.trim()).filter(s => /^\d{1,9}$/.test(s)).slice(0, CR_PGN_MAX_FIDE);

  // rd=N (opcional): filtrar por ronda. '' = todas (como siempre).
  const rdRaw = (reqUrl.searchParams.get('rd') || '').trim();
  const rd = /^\d{1,3}$/.test(rdRaw) ? rdRaw : '';

  // Caché: igual que el resto del Worker. Muchos visitantes mirando el mismo torneo en vivo
  // comparten esta respuesta → Chess-Results recibe ~1 pedido cada CACHE_SECONDS, no uno por persona.
  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let pgn;
  try {
    pgn = await crPgnDownload(host, tnr, fideList, rd);
  } catch (e) {
    return errJson('No se pudieron bajar las partidas de chess-results: ' + e.message, 502);
  }

  const headers = corsHeaders();
  headers.set('Content-Type', 'application/x-chess-pgn; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=' + CACHE_SECONDS);
  const resp = new Response(pgn, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// Baja el PGN del torneo. Sin fide → un solo pedido con todas las partidas. Con fide → un
// pedido por jugador (reusando el formulario ya cargado) y se pegan los resultados.
// Devuelve '' si el torneo no tiene partidas cargadas (caso normal: la mayoría no las sube).
async function crPgnDownload(host, tnr, fideList, rd) {
  const form = await crPgnLoadForm(host, tnr);
  if (!form) return '';   // no hay página de partidas → el torneo no tiene partidas subidas

  if (!fideList.length) return await crPgnPost(form, tnr, '', rd);

  const partes = [];
  for (const fide of fideList) {
    try {
      const p = await crPgnPost(form, tnr, fide, rd);
      if (p) partes.push(p);
    } catch (e) { /* si un jugador falla, seguir con los demás */ }
  }
  return partes.join('\n\n');
}

// Paso 1: carga PartieSuche.aspx y devuelve { url, cookies, fields, btnName, btnValue }.
async function crPgnLoadForm(host, tnr) {
  const r = await fetch(`https://${host}/PartieSuche.aspx?lan=2&tnr=${tnr}&art=3`, {
    headers: { 'User-Agent': CR_UA },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('PartieSuche HTTP ' + r.status);
  const html = await r.text();

  const btn = html.match(/name="([^"]*cb_DownLoadPGN)"[^>]*value="([^"]*)"/i);
  if (!btn) return null;   // sin botón de descarga = torneo sin partidas

  const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
    .map(c => c.split(';')[0]).join('; ');
  return { url: r.url, cookies, fields: crPgnParseForm(html), btnName: btn[1], btnValue: btn[2] };
}

// Paso 2: postea el formulario con el botón de descarga apretado. fide='' → todas las partidas.
// rd='' → todas las rondas; rd=N → solo esa ronda (txt_rdvon=txt_rdbis=N).
async function crPgnPost(form, tnr, fide, rd) {
  const f = Object.assign({}, form.fields);
  f[form.btnName] = form.btnValue;
  crPgnSet(f, /txt_dbkey$/, tnr);                 // acotar la búsqueda a ESTE torneo
  crPgnSet(f, /combo_anzahl_zeilen$/, '5');       // tope de filas: 5 = 2500 partidas
  if (fide) crPgnSet(f, /Txt_FideID$/, fide);
  if (rd) { crPgnSet(f, /txt_rdvon$/, rd); crPgnSet(f, /txt_rdbis$/, rd); }  // ronda desde/hasta = N

  const body = new URLSearchParams(f).toString();
  const r = await fetch(form.url, {
    method: 'POST',
    headers: {
      'User-Agent': CR_UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(new TextEncoder().encode(body).length),
      'Referer': form.url,
      'Cookie': form.cookies,
    },
    body,
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('descarga PGN HTTP ' + r.status);
  const txt = await r.text();
  // Si la búsqueda no encontró nada, Chess-Results devuelve la PÁGINA (HTML), no un .pgn.
  return /\[Event\s/i.test(txt) ? txt : '';
}

const CR_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Lee TODOS los campos del <form>: inputs (menos los submit) y selects con su opción elegida.
// ASP.NET tira 500 si el postback llega sin los campos que espera.
function crPgnParseForm(html) {
  const fields = {};
  let m;
  const inputRe = /<input\b([^>]*)>/gi;
  while ((m = inputRe.exec(html))) {
    const at = m[1];
    const name = (at.match(/name="([^"]+)"/i) || [])[1];
    if (!name) continue;
    const type = ((at.match(/type="([^"]+)"/i) || [])[1] || 'text').toLowerCase();
    if (type === 'submit') continue;                                        // los botones los ponemos nosotros
    if ((type === 'checkbox' || type === 'radio') && !/checked/i.test(at)) continue;
    fields[name] = (at.match(/value="([^"]*)"/i) || [])[1] || '';
  }
  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(html))) {
    const name = (m[1].match(/name="([^"]+)"/i) || [])[1];
    if (!name) continue;
    const sel = m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/i)
             || m[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/i)
             || m[2].match(/<option[^>]*value="([^"]*)"/i);
    fields[name] = sel ? sel[1] : '';
  }
  return fields;
}

// Los names de ASP.NET son largos y con prefijo variable (ctl00$P1$txt_dbkey): se buscan por sufijo.
function crPgnSet(fields, re, value) {
  const k = Object.keys(fields).find(k => re.test(k));
  if (k) fields[k] = value;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /noticia — Redacción de una noticia de torneo con IA (Workers AI)
//   Body (JSON): el paquete que arma la app (_noticiaGatherData): { torneo, campeon,
//   podio, destacados, argentinos, sorpresas, notasAutor }.
//   Devuelve: { ok, title, summary, body(HTML), raw }.
//
//   Requiere un binding de Workers AI llamado AI:
//     · Dashboard: el Worker → Settings → Bindings → Add → Workers AI → nombre "AI".
//     · o wrangler.toml:   [ai]\n   binding = "AI"
//   Si no está el binding, devuelve 503 y la app cae sola al generador local.
//
//   Costo: Workers AI tiene una cuota diaria gratis (Neurons). Una nota consume poco;
//   para el volumen del sitio (unas notas por día) queda holgado dentro de lo gratis.
//   Modelos: se prueban en orden (NOTICIA_MODELS) y se usa el PRIMERO que responda. Así, si
//   Cloudflare descontinúa un modelo (pasó con llama-3.1 el 2026-05-30), sigue andando solo
//   con el siguiente. Para cambiar la preferencia, reordená/edita la lista.
// ─────────────────────────────────────────────────────────────────────────────
const NOTICIA_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/google/gemma-3-12b-it',
  '@cf/meta/llama-3.2-3b-instruct',
];
// Orígenes permitidos (freno suave anti-abuso: que no lo usen desde otros sitios).
// No es a prueba de balas —un cliente sin navegador puede mandar cualquier Origin— pero
// alcanza para que no lo cuelguen de otra web. El límite real es la cuota gratis diaria.
const NOTICIA_ALLOW_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/([a-z0-9-]+\.)*chessargentino\.(ar|pages\.dev)|https:\/\/([a-z0-9-]+\.)*pages\.dev)$/i;

async function noticiaAI(request, env) {
  if (request.method !== 'POST') return errJson('Usar POST', 405);
  // Freno suave por Origin (si viene). Sin Origin (fetch server-to-server) se deja pasar.
  const origin = request.headers.get('Origin');
  if (origin && !NOTICIA_ALLOW_ORIGIN.test(origin)) return errJson('Origen no permitido', 403);
  if (!env.AI) return errJson('Falta el binding de Workers AI (AI) en el Worker. Agregalo en Settings → Bindings.', 503);

  let d;
  try { d = await request.json(); } catch (e) { return errJson('Body inválido', 400); }
  if (!d || typeof d !== 'object') return errJson('Body inválido', 400);
  const modo = d.modo || 'torneo';
  const notas = (typeof d.notasAutor === 'string') ? d.notasAutor.slice(0, 2000) : '';

  const sys = 'Sos un periodista de ajedrez argentino. Redactás en español rioplatense, claro y ameno, '
    + 'en tercera persona. Regla de oro: NO inventás nada; usás SOLO los datos que te paso; si un dato no '
    + 'está, no lo menciones ni lo supongas. Escribí los nombres de los jugadores exactamente como te los '
    + 'doy. No repitas frases. No uses markdown ni asteriscos.';

  // ── Modo MEJORAR: puliste un texto que ya escribió el autor (no agrega hechos) ──
  if (modo === 'mejorar') {
    const texto = (typeof d.texto === 'string') ? d.texto.slice(0, 6000).trim() : '';
    if (texto.length < 10) return errJson('Falta el texto a mejorar', 400);
    const user = 'Mejorá y puliste el siguiente texto para una nota de ajedrez: mejorá la redacción, la '
      + 'claridad y el ritmo, y corregí errores, pero NO agregues datos ni hechos nuevos y NO cambies los '
      + 'nombres. Mismo idioma (español), tono periodístico, sin emojis. Devolvé SOLO el texto mejorado, en '
      + 'párrafos separados por una línea en blanco, sin títulos ni etiquetas.\n\nTEXTO:\n' + texto;
    let res;
    try { res = await aiComplete(env, sys, user, 1100); } catch (e) { return errJson('La IA no pudo redactar: ' + e.message, 502); }
    return jsonResp({ ok: true, body: htmlParas(res.out), model: res.model, raw: res.out });
  }

  // ── Modo REDES: tres posteos (X / Instagram / Facebook) a partir de una noticia ──
  if (modo === 'redes') {
    const titulo = String(d.titulo || '').slice(0, 300);
    const resumen = String(d.resumen || '').slice(0, 600);
    const cuerpo = String(d.cuerpo || '').slice(0, 4000);
    const link = String(d.link || '').slice(0, 300);
    if (!titulo && !cuerpo) return errJson('Faltan datos de la noticia', 400);
    const user = 'A partir de esta noticia de ajedrez argentino, escribí TRES posteos para redes. No inventes datos.\n'
      + (titulo ? ('TÍTULO: ' + titulo + '\n') : '')
      + (resumen ? ('RESUMEN: ' + resumen + '\n') : '')
      + (cuerpo ? ('NOTA: ' + cuerpo + '\n') : '')
      + (link ? ('LINK: ' + link + '\n') : '')
      + (notas ? ('DATOS EXTRA (ciertos, usalos): ' + notas + '\n') : '')
      + '\nReglas: X hasta 280 caracteres, tono directo, 2-3 hashtags y el link al final. Instagram más cálido '
      + 'y largo, con emojis moderados, hashtags al final y la línea "🔗 Nota completa: link en la bio". Facebook '
      + 'informativo, con el link al final. Incluí #AjedrezArgentino entre los hashtags.\n'
      + '\nRespondé EXACTAMENTE así, con cada separador en su propia línea y nada antes ni después:\n'
      + '===X===\n<texto para X>\n===INSTAGRAM===\n<texto para Instagram>\n===FACEBOOK===\n<texto para Facebook>';
    let res;
    try { res = await aiComplete(env, sys, user, 900); } catch (e) { return errJson('La IA no pudo redactar: ' + e.message, 502); }
    return jsonResp({ ok: true, redes: parseRedes(res.out), model: res.model, raw: res.out });
  }

  // ── Modos TORNEO / ANTICIPO: nota con TITULO/RESUMEN/CUERPO ──
  if (!d.torneo) return errJson('Faltan datos del torneo', 400);
  const esAnticipo = (modo === 'anticipo');
  if (!esAnticipo && !d.campeon) return errJson('Faltan datos del torneo', 400);

  let user;
  if (esAnticipo) {
    // ANTICIPO / previa: el torneo TODAVÍA no se jugó. No hay resultados.
    const foco = d.torneo.internacional
      ? 'Es un torneo INTERNACIONAL: mencioná a los favoritos por rating, pero DESTACÁ a los jugadores ARGENTINOS anotados (lista "argentinos").'
      : 'Tratá a todos los inscriptos por igual; los favoritos salen de la lista "favoritos".';
    user = 'Redactá un ANTICIPO (previa) de este torneo de ajedrez que TODAVÍA NO se jugó.\n'
      + 'IMPORTANTE: no hay resultados. No inventes ganadores, posiciones ni partidas. Tono de expectativa, "se viene".\n'
      + foco + '\n'
      + 'Aprovechá: la sede y las fechas, el sistema y la cantidad de rondas, los FAVORITOS por rating '
      + '(lista "favoritos"), los ARGENTINOS anotados (lista "argentinos") y cuántos inscriptos/países hay.\n'
      + (notas ? ('Datos EXTRA del autor para incorporar naturalmente (son ciertos, usalos):\n' + notas + '\n') : '')
      + '\nDATOS DEL TORNEO (JSON):\n' + JSON.stringify(d) + '\n'
      + '\nRespondé EXACTAMENTE en este formato, sin nada antes ni después:\n'
      + 'TITULO: <un título atractivo de previa, una sola línea>\n'
      + 'RESUMEN: <una o dos frases para la tarjeta>\n'
      + 'CUERPO:\n<2 a 4 párrafos, separados por una línea en blanco>';
  } else {
    // Nacional vs internacional: mismo criterio que la app.
    const foco = (d.torneo.internacional && d.campeon && d.campeon.arg === false)
      ? 'Es un torneo INTERNACIONAL con ganador extranjero: contá quién ganó y el podio, pero '
        + 'CENTRÁ la nota en los jugadores ARGENTINOS que participaron (sus ubicaciones y actuaciones), '
        + 'usando la lista "argentinos".'
      : 'Tratá a todos los jugadores por igual: campeón, podio, actuaciones destacadas y sorpresas.';

    user = 'Redactá una noticia sobre este torneo de ajedrez.\n'
      + foco + '\n'
      + 'Aprovechá, cuando corresponda: el campeón y su puntaje, el podio completo, las mejores '
      + 'performances (Rp), la revelación, quién más rating sumó, las SORPRESAS/batacazos de las '
      + 'rondas (un jugador que le ganó a otro de mucho más rating), la mejor actuación FEMENINA '
      + '(lista "femeninas") y la de los JUVENILES/sub-20 (lista "juveniles", con su edad).\n'
      + 'Cómo se DEFINIÓ el título (objeto "definicion"): si el campeón terminó invicto o con puntaje '
      + 'perfecto, si se impuso con ventaja de puntos o en el desempate, y el duelo clave (a quién de '
      + 'buen rating le ganó en el camino). Y de cuántos PAÍSES hubo jugadores ("torneo.paises").\n'
      + (notas ? ('Datos EXTRA del autor para incorporar naturalmente en la nota (son ciertos, usalos):\n' + notas + '\n') : '')
      + '\nDATOS DEL TORNEO (JSON):\n' + JSON.stringify(d) + '\n'
      + '\nRespondé EXACTAMENTE en este formato, sin nada antes ni después:\n'
      + 'TITULO: <un título atractivo, una sola línea>\n'
      + 'RESUMEN: <una o dos frases para la tarjeta>\n'
      + 'CUERPO:\n<3 a 5 párrafos, separados por una línea en blanco>';
  }

  let res;
  try { res = await aiComplete(env, sys, user, 900); }
  catch (e) { return errJson('La IA no pudo redactar con ningún modelo disponible. ' + e.message, 502); }
  const parsed = parseNoticia(res.out);
  return jsonResp({ ok: true, title: parsed.title, summary: parsed.summary, body: parsed.body, model: res.model, raw: res.out });
}

// Corre los modelos de NOTICIA_MODELS en orden y devuelve { out, model } del primero que responda.
// Un modelo dado de baja o inexistente tira error → se prueba el siguiente. Si fallan todos, lanza.
async function aiComplete(env, sys, user, maxTokens) {
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  let lastErr = '';
  for (const model of NOTICIA_MODELS) {
    try {
      const r = await env.AI.run(model, { messages, max_tokens: (maxTokens || 900), temperature: 0.6 });
      const t = (r && (r.response != null ? r.response : r.result)) || '';
      if (t && String(t).trim()) return { out: String(t), model };
    } catch (e) {
      lastErr = (e && e.message) ? e.message : String(e);
    }
  }
  throw new Error('Ningún modelo disponible. Último error: ' + lastErr);
}

// Texto plano → párrafos <p> (escapando HTML). Compartido por varias respuestas.
function htmlParas(txt) {
  const clean = String(txt || '').replace(/\r/g, '').replace(/\*\*/g, '').trim();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = clean.split(/\n\s*\n/).map((s) => s.replace(/\n/g, ' ').trim()).filter(Boolean);
  return paras.map((p) => '<p>' + esc(p) + '</p>').join('\n');
}

// Parseo robusto de la respuesta de la IA (formato TITULO/RESUMEN/CUERPO). Si el modelo no
// respetó el formato, mete todo al cuerpo. Escapa HTML y arma <p> por párrafo.
function parseNoticia(txt) {
  txt = String(txt || '').replace(/\r/g, '').replace(/\*\*/g, '').trim();
  let title = '', summary = '', bodyRaw = '';
  const mt = txt.match(/T[IÍ]TULO:\s*(.+)/i);
  const ms = txt.match(/RESUMEN:\s*(.+)/i);
  const mc = txt.match(/CUERPO:\s*([\s\S]+)/i);
  if (mt) title = mt[1].trim();
  if (ms) summary = ms[1].trim();
  bodyRaw = mc ? mc[1].trim() : txt;
  const body = htmlParas(bodyRaw);
  if (!title) title = (bodyRaw.split(/\n\s*\n/)[0] || '').replace(/\n/g, ' ').trim().slice(0, 90);
  return { title, summary, body };
}

// Parsea los tres posteos de redes (separadores ===X=== / ===INSTAGRAM=== / ===FACEBOOK===).
// Si el modelo no respetó el formato, devuelve strings vacíos y el cliente conserva la plantilla.
function parseRedes(txt) {
  const t = String(txt || '').replace(/\r/g, '').replace(/\*\*/g, '');
  const out = { x: '', instagram: '', facebook: '' };
  const re = /===\s*(X|INSTAGRAM|FACEBOOK)\s*===/gi;
  const parts = [];
  let m, last = null, lastIdx = 0;
  while ((m = re.exec(t))) {
    if (last !== null) parts.push([last, t.slice(lastIdx, m.index).trim()]);
    last = m[1].toUpperCase(); lastIdx = re.lastIndex;
  }
  if (last !== null) parts.push([last, t.slice(lastIdx).trim()]);
  for (const [k, v] of parts) {
    if (k === 'X') out.x = v; else if (k === 'INSTAGRAM') out.instagram = v; else if (k === 'FACEBOOK') out.facebook = v;
  }
  return out;
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
const LIVE_PATH = 'data/live-torneos.json';          // metadata de torneos editada desde el teléfono
const LIVE_PGN_PATH = 'data/live-partidas.json';     // partidas (PGN) subidas desde el teléfono
// Los DOS de arriba son los ÚNICOS archivos que este Worker puede escribir (rutas fijas).
const RL_MAX_FAILS = 12;                             // intentos de PIN errados permitidos…
const RL_WINDOW_S = 3600;                            // …por hora (después, bloqueo de 1 hora)
const MAX_NUEVOS = 20;                               // tope de torneos "cáscara" pendientes
const PGN_MAX_GAMES_PER_TOUR = 80;                   // tope de partidas acumuladas por torneo
const PGN_MAX_GAME_BYTES = 60 * 1024;                // tope de tamaño de UNA partida
const PGN_MAX_FILE_BYTES = 700 * 1024;              // tope del archivo entero (GitHub API cómodo)

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

// ── Partidas subidas desde el teléfono (data/live-partidas.json) ──
// Forma: { version, torneos: { "<id de torneo>": { name, games: [<pgn>, …] } } }.

// Texto PGN → lista de partidas sueltas (cada una empieza con [Event). Normaliza CRLF.
function pgnSplit(text) {
  return String(text || '').replace(/\r\n/g, '\n').split(/(?=\[Event\s+")/)
    .map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 10; });
}
// Clave barata por JUGADAS (cuerpo sin headers/comentarios/números) para no guardar dos veces la
// misma partida si el teléfono la sube repetida. El dedup fino contra todo el sitio lo hace la PC.
function pgnMoveKey(pgn) {
  return String(pgn || '').replace(/\r\n/g, '\n')
    .replace(/^\s*\[[^\]]*\]\s*$/gm, '')     // headers
    .replace(/\{[^}]*\}/g, '')               // comentarios { }
    .replace(/;[^\n]*/g, '')                 // comentarios ;
    .replace(/\$\d+/g, '')                   // NAGs
    .replace(/\d+\.(\.\.)?/g, '')            // números de jugada
    .replace(/[+#!?]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 4000);
}
function pgnHasMoves(pgn) { return pgnMoveKey(pgn).replace(/\s/g, '').length >= 4; }

// Baja data/live-partidas.json. Si no existe (404), esqueleto vacío con sha null.
async function ghGetPgn(env) {
  const url = 'https://api.github.com/repos/' + GH_REPO + '/contents/' + LIVE_PGN_PATH + '?ref=' + GH_BRANCH;
  const r = await fetch(url, { headers: ghHeaders(env) });
  if (r.status === 404) return { data: { version: 1, torneos: {} }, sha: null };
  if (!r.ok) throw new Error('GitHub GET ' + r.status);
  const j = await r.json();
  let data;
  try { data = JSON.parse(b64ToUtf8(j.content)); } catch (e) { data = null; }
  if (!data || typeof data !== 'object') data = { version: 1, torneos: {} };
  if (!data.torneos || typeof data.torneos !== 'object') data.torneos = {};
  return { data, sha: j.sha };
}
async function ghPutPgn(env, data, sha, message) {
  const url = 'https://api.github.com/repos/' + GH_REPO + '/contents/' + LIVE_PGN_PATH;
  const body = { message: message, content: utf8ToB64(JSON.stringify(data) + '\n'), branch: GH_BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: { ...ghHeaders(env), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text();
    const e = new Error('GitHub PUT ' + r.status + ': ' + txt.slice(0, 200));
    e.status = r.status;
    throw e;
  }
}

// POST /admin/save con op:'pgn' | 'pgnclear' → trabaja sobre data/live-partidas.json.
async function adminSavePgn(body, env) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let cur;
    try { cur = await ghGetPgn(env); } catch (e) { return errJson('No se pudo leer de GitHub: ' + e.message, 502); }
    const data = cur.data;
    let msg, extra = {};

    if (body.op === 'pgnclear') {
      const id = body.id ? String(body.id).slice(0, 80) : '';
      if (id) { delete data.torneos[id]; msg = 'Teléfono: vaciar partidas de ' + id; }
      else { data.torneos = {}; msg = 'Teléfono: vaciar todas las partidas subidas'; }
    } else { // 'pgn'
      const id = String(body.id || '').slice(0, 80);
      if (!id) return errJson('Falta el id del torneo', 400);
      const name = String(body.name || '').replace(/[<>]/g, '').trim().slice(0, 160);
      const games = pgnSplit(body.pgnText).filter(pgnHasMoves).map(function (g) { return g.slice(0, PGN_MAX_GAME_BYTES); });
      if (!games.length) return errJson('No encontré ninguna partida válida en el PGN.', 400);
      const cell = data.torneos[id] || { name: name, games: [] };
      if (name) cell.name = name;
      if (!Array.isArray(cell.games)) cell.games = [];
      const seen = {};
      cell.games.forEach(function (g) { seen[pgnMoveKey(g)] = true; });
      let added = 0;
      for (const g of games) {
        if (cell.games.length >= PGN_MAX_GAMES_PER_TOUR) break;
        const k = pgnMoveKey(g);
        if (seen[k]) continue;
        seen[k] = true; cell.games.push(g); added++;
      }
      data.torneos[id] = cell;
      if (JSON.stringify(data).length > PGN_MAX_FILE_BYTES)
        return errJson('Hay demasiadas partidas acumuladas. Adoptalas en la PC y vaciá los pendientes (🧹) antes de subir más.', 400);
      msg = 'Teléfono: +' + added + ' partida(s) en ' + (name || id);
      extra = { added: added, total: cell.games.length };
    }

    try {
      await ghPutPgn(env, data, cur.sha, msg);
      return jsonResp(Object.assign({ ok: true, livePgn: data }, extra));
    } catch (e) {
      if (e.status === 409 && attempt === 0) continue;   // choque de versiones: releer y reintentar
      return errJson('No se pudo guardar en GitHub: ' + e.message, 502);
    }
  }
  return errJson('No se pudo guardar (conflicto repetido). Probá de nuevo.', 502);
}

// POST /admin/live { pin } → live-torneos.json + live-partidas.json FRESCOS (desde GitHub).
async function adminLive(request, env) {
  if (request.method !== 'POST') return errJson('Usar POST', 405);
  let body; try { body = await request.json(); } catch (e) { return errJson('Body inválido', 400); }
  const bad = await adminCheckPin(body && body.pin, env);
  if (bad) return bad;
  if (!env.GH_TOKEN) return errJson('Falta el secreto GH_TOKEN en el Worker', 503);
  try {
    const { data } = await ghGetLive(env);
    let livePgn = { version: 1, torneos: {} };
    try { livePgn = (await ghGetPgn(env)).data; } catch (e) { /* si el archivo de partidas falla, seguimos con la metadata */ }
    return jsonResp({ ok: true, live: data, livePgn: livePgn });
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
  // Partidas (PGN) → otro archivo (data/live-partidas.json), otro flujo.
  if (op === 'pgn' || op === 'pgnclear') return adminSavePgn(body, env);
  if (op !== 'merge' && op !== 'nuevo' && op !== 'clear') return errJson('Operación inválida (merge | nuevo | clear | pgn | pgnclear)', 400);

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
