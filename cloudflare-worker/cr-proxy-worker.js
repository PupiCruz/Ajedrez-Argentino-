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
const ALLOWED_HOST_SI = /(^|\.)sichess\.com$/i;
const ALLOWED_HOST_LI = /(^|\.)lichess\.org$/i;
const CACHE_SECONDS = 120;
const STATS_CACHE_SECONDS = 30;
const SI_CACHE_SECONDS = 15;   // vivo: caché corta para que las jugadas nuevas lleguen rápido
const LI_LIVE_CACHE = 10;      // broadcast Lichess EN VIVO (PGN de ronda + metadata): jugadas nuevas al toque.
                               // 10s: un pelín abajo del poll más rápido (blitz=12s) para que ni el visitante
                               // de blitz quede "capado" por una hoja vieja. No hay riesgo de 429: Lichess ve
                               // UN solo cliente (el Worker) → ~6 pedidos/min por torneo, den igual 1 o 100 mirando.
const LI_RESOLVE_CACHE = 3600; // resolución id-de-ronda→id-de-torneo: es FIJA, cachear fuerte (1 h)
// Ventana de gracia: cuánto tiempo MÁS (después de que la copia deja de ser "fresca") seguimos
// sirviendo la última posición buena mientras Lichess se recupera de un 429/caída. Así el tablero
// NUNCA queda vacío por un pico: mostramos lo último bueno hasta que el refresco vuelva a andar.
const LI_STALE_WINDOW = 600;   // 10 min de gracia
// UA identificable (Lichess pide identificarse; así, si algo raro pasa, saben quiénes somos).
const LI_UA = 'AjedrezArgentinoBot/1.0 (+https://chessargentino.pages.dev)';
// Dedup de bajadas concurrentes DENTRO de un mismo isolate (single-flight): si llegan muchos
// pedidos del mismo torneo a la vez, UNA sola va a Lichess y las demás esperan esa respuesta.
const _liInflight = new Map();

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

    // ── Cuentas de usuario: login con Lichess (OAuth2 + PKCE) ──
    if (reqUrl.pathname === '/auth/lichess') return authLichess(request, env);
    if (reqUrl.pathname === '/me')           return authMe(request, env);
    if (reqUrl.pathname === '/logout')       return authLogout(request, env);
    if (reqUrl.pathname.startsWith('/u/'))   return publicProfile(request, reqUrl, env);   // GET público → perfil de <usuario>
    if (reqUrl.pathname === '/follow')       return followToggle(request, env, true);      // POST Bearer {userId}
    if (reqUrl.pathname === '/unfollow')     return followToggle(request, env, false);     // POST Bearer {userId}
    if (reqUrl.pathname === '/following')     return followingList(request, env);           // GET Bearer → a quién sigo
    if (reqUrl.pathname === '/profile')       return saveProfile(request, env);             // POST Bearer {name,country,bio} → fichita
    if (reqUrl.pathname === '/prefs')          return savePrefs(request, env);               // POST Bearer {dnd} → preferencias en la cuenta
    if (reqUrl.pathname === '/block')         return blockToggle(request, env, true);       // POST Bearer {userId} → bloquear
    if (reqUrl.pathname === '/unblock')       return blockToggle(request, env, false);      // POST Bearer {userId} → desbloquear
    if (reqUrl.pathname === '/blocks')        return blocksList(request, env);              // GET  Bearer → a quiénes bloqueé

    // ── Rating de partidas en vivo (PvP) — propio del sitio, server-authoritative ──
    if (reqUrl.pathname === '/rating/me')     return ratingMe(request, env);      // GET  Bearer → mis 3 ratings
    if (reqUrl.pathname === '/rating/report') return ratingReport(request, env);  // POST secreto (sólo el worker de vivo)
    if (reqUrl.pathname === '/rating/games')  return ratingGames(request, reqUrl, env); // GET público ?user= → historial de partidas
    if (reqUrl.pathname === '/rating/game')   return ratingGame(request, reqUrl, env);  // GET público ?id= → una partida (link compartible)
    if (reqUrl.pathname === '/rating/top')    return ratingTop(request, reqUrl, env);   // GET público → top del sitio por ritmo

    // ── Moderación de los chats (banear/silenciar) — sólo mods (sesión) o el vivo-worker (X-Vivo-Secret) ──
    if (reqUrl.pathname === '/mod/ban')       return modBan(request, env, true);    // POST → banear (bloquea login)
    if (reqUrl.pathname === '/mod/unban')     return modBan(request, env, false);   // POST → desbanear
    if (reqUrl.pathname === '/mod/mute')      return modMute(request, env, true);   // POST → silenciar (con duración)
    if (reqUrl.pathname === '/mod/unmute')    return modMute(request, env, false);  // POST → quitar el silencio
    if (reqUrl.pathname === '/mod/sanctions') return modSanctions(request, env);    // GET  → lista de baneados/silenciados
    if (reqUrl.pathname === '/report')        return submitReport(request, env);    // POST Bearer → un usuario reporta a otro
    if (reqUrl.pathname === '/mod/reports')   return modReports(request, env);      // GET  → reportes pendientes (para el panel)
    if (reqUrl.pathname === '/mod/report/done') return modReportDone(request, env); // POST → marcar reporte(s) como visto

    // ── Progreso de EJERCICIOS atado a la cuenta (viaja entre dispositivos) ──
    if (reqUrl.pathname === '/puz/progress')  return puzProgress(request, env);   // GET (leer) / POST (guardar), Bearer

    // ── Edición desde el teléfono (editar.html) ──
    if (reqUrl.pathname === '/admin/live') return adminLive(request, env);
    if (reqUrl.pathname === '/admin/save') return adminSave(request, env);

    // ── Descarga de Excel de info64 (POST → JSON {url} → bajar el .xlsx) ──
    if (reqUrl.pathname === '/i64xls') return i64Xls(reqUrl, ctx);

    // ── Descarga de las PARTIDAS (PGN) de un torneo de Chess-Results ──
    if (reqUrl.pathname === '/crpgn') return crPgn(reqUrl, ctx);

    // ── Proxy CORS de sichess.com (PGN en vivo por ronda + su config.js) ──
    if (reqUrl.pathname === '/sipgn') return siPgn(reqUrl, ctx);

    // ── Tablas de vesus.org (clasificación + emparejamientos en JSON) ──
    if (reqUrl.pathname === '/vspgn') return vsPgn(reqUrl, ctx);

    // ── Proxy con caché para el broadcast de Lichess (mata el 429 del vivo) ──
    if (reqUrl.pathname === '/libc') return liBc(reqUrl, ctx);

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /sipgn?url=<URL de sichess.com>
//   → proxy CORS para sichess.com, que NO manda headers CORS (el navegador bloquea
//     el fetch directo). Sirve para torneos capturados con DGT LiveChess que sichess
//     publica como PGN por ronda (.../games/<evento>/<NN>/games.pgn) y para su config.js
//     (que lista qué rondas hay). Sólo deja pasar sichess.com y sólo archivos .pgn/.js
//     (no es un proxy abierto). Caché corta (SI_CACHE_SECONDS) porque es en vivo: muchos
//     visitantes comparten la respuesta y sichess recibe ~1 pedido por ronda cada 15s.
// ─────────────────────────────────────────────────────────────────────────────
async function siPgn(reqUrl, ctx) {
  const target = reqUrl.searchParams.get('url');
  if (!target) return errJson('Falta el parámetro ?url=', 400);
  let t;
  try { t = new URL(target); }
  catch (e) { return errJson('URL inválida', 400); }
  if (t.protocol !== 'https:' || !ALLOWED_HOST_SI.test(t.hostname)) {
    return errJson('Host no permitido (sólo sichess.com)', 403);
  }
  if (!/\.(pgn|js)$/i.test(t.pathname)) return errJson('Sólo se permiten archivos .pgn o .js', 403);

  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let upstream;
  try {
    upstream = await fetch(t.toString(), { headers: { 'User-Agent': CR_UA }, redirect: 'follow' });
  } catch (e) {
    return errJson('No se pudo bajar de sichess: ' + e.message, 502);
  }

  const headers = corsHeaders();
  headers.set('Content-Type', /\.js$/i.test(t.pathname)
    ? 'application/javascript; charset=utf-8'
    : 'application/x-chess-pgn; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=' + SI_CACHE_SECONDS);
  const resp = new Response(upstream.body, { status: upstream.status, headers });
  if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /libc?url=<URL del API de broadcast de Lichess, url-encodeada>
//   → proxy con caché para lichess.org/api/broadcast/*. Por qué: en la web publicada
//     el navegador de CADA visitante pegaba directo a Lichess (resolver el id del torneo
//     + bajar el PGN de la ronda cada 30 s). Con varios visitantes sobre el mismo torneo
//     en vivo, Lichess devolvía 429 ("demasiadas peticiones") y se rompía el vivo.
//   Con este proxy, muchos visitantes comparten UNA sola bajada: Lichess recibe ~1 pedido
//   cada LI_LIVE_CACHE s EN TOTAL (no uno por visita), así el 429 desaparece.
//   Sólo deja pasar lichess.org/api/broadcast/ (no es un proxy abierto).
// ─────────────────────────────────────────────────────────────────────────────
async function liBc(reqUrl, ctx) {
  const target = reqUrl.searchParams.get('url');
  if (!target) return errJson('Falta el parámetro ?url=', 400);
  let t;
  try { t = new URL(target); }
  catch (e) { return errJson('URL inválida', 400); }
  if (t.protocol !== 'https:' || !ALLOWED_HOST_LI.test(t.hostname) || !t.pathname.startsWith('/api/broadcast/')) {
    return errJson('Host/ruta no permitida (sólo lichess.org/api/broadcast)', 403);
  }

  // El PGN de ronda y la metadata cambian jugada a jugada → "frescura" corta. La resolución
  // del id de torneo (/api/broadcast/<slug>/<roundSlug>/<roundId>, 5 segmentos, sin /round/
  // ni .pgn) es FIJA → frescura larga.
  const isPgn = /\.pgn$/i.test(t.pathname);
  const segs = t.pathname.split('/').filter(Boolean);   // ['api','broadcast',...]
  const isResolve = !isPgn && segs.length >= 5 && segs[2] !== 'round';
  const freshTtl = isResolve ? LI_RESOLVE_CACHE : LI_LIVE_CACHE;
  const storeTtl = freshTtl + LI_STALE_WINDOW;  // cuánto vive en la caché (fresca + ventana de gracia)
  const contentType = isPgn ? 'application/x-chess-pgn; charset=utf-8' : 'application/json; charset=utf-8';

  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString());
  const cacheKeyStr = reqUrl.toString();

  const hit = await cache.match(cacheKey);
  if (hit) {
    const fetchedAt = Number(hit.headers.get('x-fa-fetched') || 0);
    const ageMs = Date.now() - fetchedAt;
    if (ageMs < freshTtl * 1000) {
      // Fresca: servir tal cual.
      return await liClientResp(hit, contentType, freshTtl);
    }
    // "Vieja pero buena": la servimos YA (tablero al instante) y refrescamos EN SEGUNDO PLANO.
    // Esto mata la "estampida": ya no fallan la caché 20 visitantes a la vez cada 10s; sirven
    // lo último bueno y Lichess recibe UNA sola bajada de refresco (con dedup por single-flight).
    ctx.waitUntil(liRevalidate(cache, cacheKey, cacheKeyStr, t.toString(), isPgn, contentType, storeTtl));
    return await liClientResp(hit, contentType, freshTtl);
  }

  // No hay NADA cacheado (primer visitante del torneo, o expiró toda la ventana de gracia):
  // hay que bajar ahora, con dedup para que muchos misses simultáneos compartan una sola bajada.
  let r;
  try {
    r = await liFetchBuffered(cacheKeyStr, t.toString(), isPgn);
  } catch (e) {
    return errJson('No se pudo bajar de Lichess: ' + e.message, 502);
  }
  if (!r.ok) {
    // Sin copia previa que servir (caso rarísimo: sólo el primerísimo pedido y Lichess frenando).
    const h = corsHeaders();
    h.set('Content-Type', contentType);
    h.set('Cache-Control', 'no-store');
    return new Response(r.buf, { status: r.status, headers: h });
  }
  ctx.waitUntil(cache.put(cacheKey, liStoredResp(r.buf, contentType, storeTtl)));
  const h = corsHeaders();
  h.set('Content-Type', contentType);
  h.set('Cache-Control', 'public, max-age=' + freshTtl);
  return new Response(r.buf, { status: 200, headers: h });
}

// Baja de Lichess a memoria (ArrayBuffer) con dedup por isolate: si ya hay una bajada en curso
// para la misma URL, todos esperan esa. Devuelve { ok, status, buf }.
function liFetchBuffered(cacheKeyStr, targetUrl, isPgn) {
  const existing = _liInflight.get(cacheKeyStr);
  if (existing) return existing;
  const p = (async () => {
    const up = await fetch(targetUrl, {
      headers: { 'User-Agent': LI_UA, 'Accept': isPgn ? 'application/x-chess-pgn' : 'application/json' },
      redirect: 'follow',
    });
    const buf = await up.arrayBuffer();
    return { ok: up.ok, status: up.status, buf };
  })();
  const wrapped = p.finally(() => { _liInflight.delete(cacheKeyStr); });
  _liInflight.set(cacheKeyStr, wrapped);
  return wrapped;
}

// Refresco en segundo plano. CLAVE: si Lichess devuelve 429/5xx o se cae, NO tocamos la caché
// → seguimos sirviendo la última copia buena. El tablero nunca queda vacío por un pico.
async function liRevalidate(cache, cacheKey, cacheKeyStr, targetUrl, isPgn, contentType, storeTtl) {
  let r;
  try { r = await liFetchBuffered(cacheKeyStr, targetUrl, isPgn); }
  catch (e) { return; }        // Lichess caído → conservamos lo viejo-pero-bueno
  if (!r.ok) return;           // 429/5xx → idem: NO pisamos la copia buena
  await cache.put(cacheKey, liStoredResp(r.buf, contentType, storeTtl));
}

// Copia para GUARDAR en la caché: TTL largo (fresca + gracia) + sello de tiempo para medir frescura.
function liStoredResp(buf, contentType, storeTtl) {
  const h = corsHeaders();
  h.set('Content-Type', contentType);
  h.set('Cache-Control', 'public, max-age=' + storeTtl);
  h.set('x-fa-fetched', String(Date.now()));
  return new Response(buf, { status: 200, headers: h });
}

// Copia para EL VISITANTE: mismo cuerpo, pero Cache-Control corto (que su navegador siga sondeando).
async function liClientResp(cachedResp, contentType, freshTtl) {
  const buf = await cachedResp.arrayBuffer();
  const h = corsHeaders();
  h.set('Content-Type', contentType);
  h.set('Cache-Control', 'public, max-age=' + freshTtl);
  return new Response(buf, { status: 200, headers: h });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /vspgn?key=<shortKey>
//   → devuelve en JSON los datos de un torneo de vesus.org: metadata + la
//     CLASIFICACIÓN (players[]: nombre, título, federación, FIDE id, rating, puntos,
//     rank, performance, cambio de elo, resultado por ronda) + los EMPAREJAMIENTOS
//     (pairings[]: ronda, tablero, blancas/negras por rankedId, resultado).
//
// Cómo funciona (y por qué necesita al Worker):
//   vesus es una SPA (React/Relay) sin datos en el HTML; los trae de su API GraphQL
//   (api.vesus.org/graphql) que NO manda CORS. Además la API es "persisted-query only":
//   sólo acepta consultas pre-registradas por un docId (un hash), no consultas libres, y
//   la data en vivo llega por una subscription servida con Server-Sent Events (SSE). El
//   navegador de la app no puede ni saltear el CORS ni sostener ese POST; el Worker sí:
//   hace UN POST con Accept: text/event-stream, lee el PRIMER evento (una foto completa
//   del torneo) y lo devuelve como JSON normal. No sostiene el stream: cada visita es una
//   foto, cacheada VS_CACHE_SECONDS (las tablas cambian por ronda, no jugada a jugada).
//
// docId: es un hash del texto de la query; vesus lo puede cambiar al actualizar su web.
//   Arrancamos con el último conocido (VS_DOCID) y, SÓLO si vesus lo rechaza, lo volvemos
//   a sacar solo del bundle de vesus (vsScrapeDocId) y reintentamos. Así no se rompe nunca.
// ─────────────────────────────────────────────────────────────────────────────
const VS_API = 'https://api.vesus.org/graphql';
const VS_SITE = 'https://vesus.org';
const VS_CACHE_SECONDS = 60;
// docId de la subscription TournamentPage_Subscription (último conocido). Si vesus lo cambia,
// vsScrapeDocId() lo actualiza solo y esta variable queda pisada mientras viva el isolate.
let VS_DOCID = '2b7be2c69372d525856bc40916204211';

async function vsPgn(reqUrl, ctx) {
  const key = (reqUrl.searchParams.get('key') || '').trim();
  if (!/^[A-Za-z0-9]{4,20}$/.test(key)) return errJson('Parámetro key inválido (shortKey de vesus)', 400);

  // Caché por URL: muchos visitantes mirando el mismo torneo comparten esta respuesta.
  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let data;
  try {
    data = await vsFetchData(key, VS_DOCID);
    if (data === '__BADDOC__') {                 // el docId caducó: sacar uno fresco y reintentar
      const fresh = await vsScrapeDocId();
      if (fresh) { VS_DOCID = fresh; data = await vsFetchData(key, VS_DOCID); }
    }
  } catch (e) {
    return errJson('No se pudo bajar de vesus: ' + e.message, 502);
  }
  if (data === '__BADDOC__') return errJson('vesus cambió su API (docId) y no se pudo resolver', 502);
  if (data == null) return errJson('vesus no devolvió datos para ese torneo (¿shortKey correcto?)', 404);

  const headers = corsHeaders();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=' + VS_CACHE_SECONDS);
  const resp = new Response(JSON.stringify(data), { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// POST SSE a la API de vesus y lee el PRIMER evento con payload. Devuelve el objeto
// tournamentUpdate, null si no vino, o '__BADDOC__' si el docId ya no sirve.
async function vsFetchData(key, docId) {
  const body = JSON.stringify({
    operationName: 'TournamentPage_Subscription',
    variables: { shortKey: key, hasGames: false, hasResults: true, hasCompletedPublishedRounds: false, canNoLongerBeUpdated: false },
    docId,
  });
  // OJO: vesus valida el header Origin (sin él responde 500 "Invalid origin"). Hay que mandarlo.
  const r = await fetch(VS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'User-Agent': CR_UA,
      'Origin': VS_SITE,
      'Referer': VS_SITE + '/',
    },
    body,
  });
  if (!r.ok) throw new Error('vesus HTTP ' + r.status);

  // El stream trae líneas ": " (heartbeat), "event: next" y "data: {…}". Leemos hasta poder
  // parsear una línea data: como JSON (mientras el chunk esté cortado, JSON.parse falla y seguimos).
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', payload = null;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    payload = vsExtractEvent(buf);
    if (payload) break;
    if (buf.length > 800000) break;   // tope de seguridad
  }
  try { reader.cancel(); } catch (e) {}
  if (!payload) return null;
  if (payload.errors) {
    const msg = JSON.stringify(payload.errors);
    if (/PersistedQuery/i.test(msg)) return '__BADDOC__';
    throw new Error('GraphQL: ' + msg.slice(0, 140));
  }
  return (payload.data && payload.data.tournamentUpdate) ? payload.data.tournamentUpdate : null;
}

// Busca en el buffer SSE la primera línea "data:" que parsee como JSON completo.
function vsExtractEvent(buf) {
  const lines = buf.split('\n');
  for (const ln of lines) {
    if (ln.charCodeAt(0) !== 100 || !ln.startsWith('data:')) continue;   // 'd'
    const js = ln.slice(5).trim();
    if (js.length < 2) continue;
    try { return JSON.parse(js); } catch (e) { /* chunk cortado: seguir acumulando */ }
  }
  return null;
}

// Saca el docId ACTUAL de TournamentPage_Subscription del bundle de vesus. El HTML referencia
// el entry principal; el docId vive en un chunk que el entry importa (Relay compila el id ahí).
// Cap de 44 chunks para no pasarnos del límite de subrequests del Worker (50). Se corre rara vez
// (sólo cuando el docId guardado caducó), así que el costo es despreciable.
async function vsScrapeDocId() {
  const RE = /id:"([0-9a-f]{32})",metadata:\{[^}]*\},name:"TournamentPage_Subscription"/;
  try {
    const idx = await (await fetch(VS_SITE + '/', { headers: { 'User-Agent': CR_UA } })).text();
    const entry = (idx.match(/\/static\/js\/[A-Za-z0-9_-]+\.js/) || [])[0];
    if (!entry) return null;
    const et = await (await fetch(VS_SITE + entry, { headers: { 'User-Agent': CR_UA } })).text();
    let m = et.match(RE);
    if (m) return m[1];
    const chunks = [...new Set(et.match(/[A-Za-z0-9_]+-[A-Za-z0-9_-]{8}\.js/g) || [])].slice(0, 44);
    for (const c of chunks) {
      try {
        const ct = await (await fetch(VS_SITE + '/static/js/' + c, { headers: { 'User-Agent': CR_UA } })).text();
        m = ct.match(RE);
        if (m) return m[1];
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

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
// CUENTAS DE USUARIO — login con Lichess (OAuth2 + PKCE, sin contraseñas propias)
//   POST /auth/lichess  { code, code_verifier, redirect_uri }
//        Canjea el código de Lichess por un token, pregunta "¿quién sos?" (/api/account),
//        guarda/actualiza al usuario en D1 y devuelve UNA SESIÓN PROPIA { token, user }.
//        La web guarda ese `token` (en localStorage) y lo manda como Authorization: Bearer.
//   GET  /me       (Authorization: Bearer <sesión>) → { user }  ó  401 si no hay sesión.
//   POST /logout   (Authorization: Bearer <sesión>) → borra la sesión.
//
// PKCE = flujo público: NO necesita client-secret ni registrar una app en Lichess.
// La contraseña la escribe el usuario EN lichess.org; la web nunca la ve. Guardamos
// sólo identidad + rating (el token de Lichess se usa una vez y se revoca en el acto).
// Las tablas se crean solas (como admin_rl): cero trabajo en la consola de D1.
// ─────────────────────────────────────────────────────────────────────────────

const LICHESS_HOST = 'https://lichess.org';
const SESSION_TTL_DAYS = 180;   // cuánto dura la sesión sin volver a loguear (~6 meses)

// Moderadores del sitio: las dos cuentas de Lichess del dueño. Se compara en MINÚSCULAS porque el
// username de Lichess es case-insensitive (y la app ya busca con LOWER(username)). Más adelante, si
// hay usuarios de confianza, se verá cómo sumar mods (fase posterior). El mismo Set vive en el
// vivo-worker (para marcar isMod en el chat); si se cambia acá, cambiarlo allá también.
const MOD_USERNAMES = new Set(['elpupicruz', 'chess_argentino']);

// Duraciones de mute permitidas (minutos): 15 min · 30 min · 1 h · 8 h · 1 día.
const MUTE_MINUTES = new Set([15, 30, 60, 480, 1440]);

// Crea las tablas si no existen. `usuarios` = personas; `sessions` = tokens de login.
let _usuariosMigrated = false;   // fichita editable: se agregan las columnas una vez por isolate
async function ensureUserTables(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS usuarios (' +
    'id TEXT PRIMARY KEY, provider TEXT, prov_id TEXT, username TEXT, ' +
    'rating INTEGER, title TEXT, created_at INTEGER, last_login INTEGER, ' +
    'display_name TEXT, country TEXT, bio TEXT)'
  ).run();
  // Un usuario por (proveedor, id del proveedor): evita duplicados del mismo Lichess.
  await env.DB.prepare(
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_prov ON usuarios(provider, prov_id)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS sessions (' +
    'token TEXT PRIMARY KEY, user_id TEXT, created_at INTEGER, expires INTEGER)'
  ).run();
  // Migración perezosa: la tabla usuarios ya existía SIN la fichita (display_name/country/bio).
  if (_usuariosMigrated) return;
  try {
    const info = await env.DB.prepare('PRAGMA table_info(usuarios)').all();
    const cols = new Set(((info && info.results) || []).map((r) => r.name));
    // display_name/country/bio = fichita editable. banned* = moderación (ban de login,
    // reversible). chat_muted_until = mute temporal (timestamp UNIX en segundos; 0/null = sin mute).
    const want = { display_name: 'TEXT', country: 'TEXT', bio: 'TEXT',
      banned: 'INTEGER DEFAULT 0', banned_at: 'INTEGER', banned_reason: 'TEXT',
      chat_muted_until: 'INTEGER DEFAULT 0',
      dnd: 'INTEGER DEFAULT 0' };   // "No molestar": 1 = otros NO te pueden desafiar
    for (const name in want) {
      if (cols.has(name)) continue;
      try { await env.DB.prepare('ALTER TABLE usuarios ADD COLUMN ' + name + ' ' + want[name]).run(); } catch (e) {}
    }
    _usuariosMigrated = true;
  } catch (e) { /* reintenta en la próxima */ }
}

// Sólo lo que es seguro mostrar a cualquiera (nunca el token de Lichess ni datos internos).
function publicUser(u) {
  return { id: u.id, provider: u.provider, username: u.username, rating: u.rating || null, title: u.title || null };
}

// Mejor rating "serio" del jugador (preferimos partidas largas; ignoramos provisionales si hay firme).
function lichessBestRating(acc) {
  const p = acc && acc.perfs;
  if (!p) return null;
  const order = ['classical', 'rapid', 'blitz', 'bullet'];
  for (const k of order) if (p[k] && p[k].rating && !p[k].prov) return p[k].rating;
  for (const k of order) if (p[k] && p[k].rating) return p[k].rating;
  return null;
}

// POST /auth/lichess — canje del código + alta/actualización del usuario + sesión.
async function authLichess(request, env) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  let body;
  try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  const code = String(body.code || '');
  const verifier = String(body.code_verifier || '');
  const redirectUri = String(body.redirect_uri || '');
  if (!code || !verifier || !redirectUri) return errJson('Faltan parámetros (code, code_verifier, redirect_uri)', 400);
  // En PKCE el client_id puede ser cualquier URL nuestra; usamos el propio redirect_uri.
  const clientId = redirectUri;

  // (1) Canjear el código por un token de acceso de Lichess.
  let tok;
  try {
    const r = await fetch(LICHESS_HOST + '/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      }),
    });
    tok = await r.json();
    if (!r.ok || !tok.access_token) {
      return errJson('Lichess rechazó el login: ' + (tok && (tok.error_description || tok.error) || r.status), 401);
    }
  } catch (e) { return errJson('No se pudo canjear el token con Lichess: ' + e.message, 502); }

  // (2) ¿Quién es? Identidad + rating (scope vacío alcanza para /api/account).
  let acc;
  try {
    const r = await fetch(LICHESS_HOST + '/api/account', {
      headers: { 'Authorization': 'Bearer ' + tok.access_token },
    });
    acc = await r.json();
    if (!r.ok || !acc.id) return errJson('No se pudo leer la cuenta de Lichess', 502);
  } catch (e) { return errJson('No se pudo leer la cuenta de Lichess: ' + e.message, 502); }

  // Buenos modales: ya tenemos la identidad, revocamos el token de Lichess (no lo guardamos).
  try {
    await fetch(LICHESS_HOST + '/api/token', {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + tok.access_token },
    });
  } catch (e) { /* si falla la revocación, el token igual caduca solo; no es crítico */ }

  // (3) Alta o actualización del usuario + creación de la sesión.
  await ensureUserTables(env);
  const provId = String(acc.id);
  const username = String(acc.username || acc.id).slice(0, 40);
  const rating = lichessBestRating(acc);
  const title = acc.title ? String(acc.title).slice(0, 10) : null;
  const now = Math.floor(Date.now() / 1000);

  let userId;
  try {
    const existing = await env.DB.prepare('SELECT id, banned FROM usuarios WHERE provider=?1 AND prov_id=?2')
      .bind('lichess', provId).first();
    // Cuenta suspendida: no se crea sesión (ban = bloqueo total de login, reversible desde el panel).
    if (existing && existing.banned) return errJson('Tu cuenta está suspendida. Escribinos si creés que es un error.', 403);
    if (existing) {
      userId = existing.id;
      await env.DB.prepare('UPDATE usuarios SET username=?2, rating=?3, title=?4, last_login=?5 WHERE id=?1')
        .bind(userId, username, rating, title, now).run();
    } else {
      userId = 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      await env.DB.prepare(
        'INSERT INTO usuarios (id, provider, prov_id, username, rating, title, created_at, last_login) ' +
        'VALUES (?1,?2,?3,?4,?5,?6,?7,?7)'
      ).bind(userId, 'lichess', provId, username, rating, title, now).run();
    }
    const sToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
    const expires = now + SESSION_TTL_DAYS * 86400;
    await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires) VALUES (?1,?2,?3,?4)')
      .bind(sToken, userId, now, expires).run();
    return jsonResp({ token: sToken, user: publicUser({ id: userId, provider: 'lichess', username, rating, title }) });
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
}

// Devuelve la fila del usuario dueño de la sesión del header Authorization, o null.
async function sessionUser(request, env) {
  if (!env.DB) return null;
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  let row;
  try {
    row = await env.DB.prepare(
      'SELECT u.id, u.provider, u.username, u.rating, u.title, u.banned, u.chat_muted_until, s.expires ' +
      'FROM sessions s JOIN usuarios u ON u.id = s.user_id WHERE s.token = ?1'
    ).bind(token).first();
  } catch (e) { return null; }
  if (!row) return null;
  if (row.expires && row.expires < Math.floor(Date.now() / 1000)) return null;
  // Cuenta baneada: la sesión NO vale (bloquea /me y /rating/me → el sitio la trata como deslogueada).
  // Al banear ya borramos sus sesiones; esto es una segunda barrera por si quedó alguna colgada.
  if (row.banned) return null;
  return row;
}

// GET /me → { user } si la sesión es válida, 401 si no.
async function authMe(request, env) {
  const u = await sessionUser(request, env);
  if (!u) return errJson('No autenticado', 401);
  return jsonResp({ user: publicUser(u) });
}

// POST /logout → borra la sesión del token que manda.
async function authLogout(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && env.DB) {
    try { await env.DB.prepare('DELETE FROM sessions WHERE token=?1').bind(m[1].trim()).run(); } catch (e) {}
  }
  return jsonResp({ ok: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// MODERACIÓN DE LOS CHATS — banear (bloquea login, reversible) y silenciar (temporal).
// Todo server-side. Dos formas de autorizar una acción de moderación:
//   • El propio MOD desde su sesión (Authorization: Bearer) → para el panel del autor.
//   • El vivo-worker (header X-Vivo-Secret) cuando el mod actúa DESDE el chat (por WebSocket):
//     el DO ya verificó que quien actúa es mod y nos pasa la acción.
// En ambos casos el objetivo se identifica por su id de usuario (userId) o por username.
// ─────────────────────────────────────────────────────────────────────────────

// Devuelve el modo de autorización o null. { via:'worker' } | { via:'session', mod }.
async function modAuth(request, env) {
  const secret = request.headers.get('X-Vivo-Secret') || '';
  if (env.VIVO_SECRET && secret === env.VIVO_SECRET) return { via: 'worker' };
  const u = await sessionUser(request, env);
  if (u && MOD_USERNAMES.has(String(u.username || '').toLowerCase())) return { via: 'session', mod: u };
  return null;
}

// Resuelve el usuario objetivo desde el body: prioriza userId; si no, busca por username (LOWER).
async function modResolveTarget(env, body) {
  const id = String(body.userId || '').trim();
  if (id) return env.DB.prepare('SELECT id, username, banned, chat_muted_until FROM usuarios WHERE id=?1').bind(id).first();
  const name = String(body.user || body.username || '').replace(/\/+$/, '').trim().slice(0, 40);
  if (name) return env.DB.prepare('SELECT id, username, banned, chat_muted_until FROM usuarios WHERE LOWER(username)=LOWER(?1)').bind(name).first();
  return null;
}

// POST /mod/ban  /  /mod/unban  { userId | user }  → banea o desbanea (bloqueo de login, reversible).
async function modBan(request, env, ban) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const who = await modAuth(request, env);
  if (!who) return errJson('No autorizado', 403);
  let body; try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  await ensureUserTables(env);
  const target = await modResolveTarget(env, body);
  if (!target) return errJson('Usuario no encontrado', 404);
  // No se puede sancionar a un moderador (evita auto-baneo por error / cruce entre mods).
  if (MOD_USERNAMES.has(String(target.username || '').toLowerCase())) return errJson('No se puede sancionar a un moderador', 400);
  const now = Math.floor(Date.now() / 1000);
  try {
    if (ban) {
      const reason = String(body.reason || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
      await env.DB.prepare('UPDATE usuarios SET banned=1, banned_at=?2, banned_reason=?3 WHERE id=?1')
        .bind(target.id, now, reason).run();
      // Lo patea aunque esté logueado: borrar sus sesiones activas (no puede volver a entrar).
      try { await env.DB.prepare('DELETE FROM sessions WHERE user_id=?1').bind(target.id).run(); } catch (e) {}
    } else {
      await env.DB.prepare('UPDATE usuarios SET banned=0, banned_at=NULL, banned_reason=NULL WHERE id=?1')
        .bind(target.id).run();
    }
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ ok: true, userId: target.id, username: target.username, banned: ban });
}

// POST /mod/mute  { userId | user, minutes }  /  /mod/unmute  { userId | user }
// mute = silencio temporal (no puede escribir en NINGÚN chat mientras dure; sí puede loguearse y jugar).
async function modMute(request, env, mute) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const who = await modAuth(request, env);
  if (!who) return errJson('No autorizado', 403);
  let body; try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  await ensureUserTables(env);
  const target = await modResolveTarget(env, body);
  if (!target) return errJson('Usuario no encontrado', 404);
  if (MOD_USERNAMES.has(String(target.username || '').toLowerCase())) return errJson('No se puede sancionar a un moderador', 400);
  const now = Math.floor(Date.now() / 1000);
  let until = 0, minutes = 0;
  if (mute) {
    minutes = Math.floor(+body.minutes || 0);
    if (!MUTE_MINUTES.has(minutes)) return errJson('Duración inválida (15, 30, 60, 480 o 1440 min)', 400);
    until = now + minutes * 60;
  }
  try {
    await env.DB.prepare('UPDATE usuarios SET chat_muted_until=?2 WHERE id=?1').bind(target.id, until).run();
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ ok: true, userId: target.id, username: target.username, muted_until: until, minutes });
}

// GET /mod/sanctions → { banned:[...], muted:[...] } para el panel del autor (revertir sanciones).
async function modSanctions(request, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const who = await modAuth(request, env);
  if (!who) return errJson('No autorizado', 403);
  await ensureUserTables(env);
  const now = Math.floor(Date.now() / 1000);
  let banned = [], muted = [];
  try {
    const b = await env.DB.prepare('SELECT id, username, banned_at, banned_reason FROM usuarios WHERE banned=1 ORDER BY banned_at DESC').all();
    banned = ((b && b.results) || []).map((r) => ({ userId: r.id, username: r.username, at: r.banned_at || null, reason: r.banned_reason || null }));
    const mu = await env.DB.prepare('SELECT id, username, chat_muted_until FROM usuarios WHERE chat_muted_until > ?1 ORDER BY chat_muted_until DESC').bind(now).all();
    muted = ((mu && mu.results) || []).map((r) => ({ userId: r.id, username: r.username, until: r.chat_muted_until || 0 }));
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ banned, muted });
}

// Tabla de reportes (usuarios reportando a otros usuarios). Se crea sola (patrón perezoso).
async function ensureReportsTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS reports (' +
    'id TEXT PRIMARY KEY, reporter_id TEXT, target_id TEXT, target_username TEXT, ' +
    'reason TEXT, created_at INTEGER, handled INTEGER DEFAULT 0)'
  ).run();
}

// POST /report  (Bearer)  { userId, reason? } — un usuario LOGUEADO reporta a otro. Lo revisa un mod.
async function submitReport(request, env) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const me = await sessionUser(request, env);
  if (!me) return errJson('No autenticado', 401);
  let body; try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  const targetId = String(body.userId || '').trim();
  if (!targetId) return errJson('Falta el usuario', 400);
  if (targetId === me.id) return errJson('No podés reportarte a vos mismo', 400);
  await ensureUserTables(env); await ensureReportsTable(env);
  const target = await env.DB.prepare('SELECT id, username FROM usuarios WHERE id=?1').bind(targetId).first();
  if (!target) return errJson('Usuario no encontrado', 404);
  const reason = String(body.reason || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  const now = Math.floor(Date.now() / 1000);
  // Anti-spam: si este reporter ya reportó a este target en la última hora, no duplicamos.
  const recent = await env.DB.prepare('SELECT id FROM reports WHERE reporter_id=?1 AND target_id=?2 AND created_at > ?3')
    .bind(me.id, targetId, now - 3600).first();
  if (recent) return jsonResp({ ok: true, already: true });
  const id = 'r_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  try {
    await env.DB.prepare('INSERT INTO reports (id, reporter_id, target_id, target_username, reason, created_at) VALUES (?1,?2,?3,?4,?5,?6)')
      .bind(id, me.id, targetId, target.username || null, reason, now).run();
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ ok: true });
}

// GET /mod/reports — reportes recientes (para el panel del autor). Sólo mods.
async function modReports(request, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const who = await modAuth(request, env);
  if (!who) return errJson('No autorizado', 403);
  await ensureReportsTable(env);
  let reports = [];
  try {
    // Sólo los PENDIENTES (handled=0): los marcados como visto no se muestran (no se acumulan).
    const r = await env.DB.prepare(
      'SELECT id, target_id, target_username, reason, created_at FROM reports WHERE handled=0 ORDER BY created_at DESC LIMIT 200'
    ).all();
    reports = ((r && r.results) || []).map((x) => ({
      id: x.id, userId: x.target_id, username: x.target_username, reason: x.reason || null, at: x.created_at || null,
    }));
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ reports });
}

// POST /mod/report/done  { id }  o  { userId } — marca como VISTO un reporte (por id) o todos los de un
// usuario (por userId). Sólo mods. Así los reportes atendidos dejan de aparecer en el panel.
async function modReportDone(request, env) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const who = await modAuth(request, env);
  if (!who) return errJson('No autorizado', 403);
  let body; try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  await ensureReportsTable(env);
  const id = String(body.id || '').trim();
  const userId = String(body.userId || '').trim();
  try {
    if (id) await env.DB.prepare('UPDATE reports SET handled=1 WHERE id=?1').bind(id).run();
    else if (userId) await env.DB.prepare('UPDATE reports SET handled=1 WHERE target_id=?1').bind(userId).run();
    else return errJson('Falta id o userId', 400);
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ ok: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// RATING DE PARTIDAS EN VIVO (PvP) — propio del sitio, calculado en el SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────
// Reglas (idénticas en espíritu al rating de los ejercicios de la web):
//   • Todos arrancan LIMPIOS en SITE_START_RATING (no se copia nada de Lichess, así
//     nadie cree que jugar acá le mueve el rating de Lichess).
//   • Elo con K PROVISIONAL: las primeras partidas mueven mucho el número y después
//     se calma (K 40 → 24 → 16 según cuántas partidas lleva en esa categoría).
//   • Tres categorías por ritmo, con el criterio de Lichess (estimado = base + 40·inc):
//        ≤179s bullet · ≤479s blitz · resto rápido.
//   • Sólo el worker de vivo puede reportar resultados (header X-Vivo-Secret), así
//     nadie se infla el rating desde la consola. Idempotente por gameId.
const SITE_START_RATING = 1500;

// Categoría del ritmo. base/inc en SEGUNDOS. estimado = base + 40·inc (criterio Lichess).
function ratingCategory(base, inc) {
  const est = (Number(base) || 0) + 40 * (Number(inc) || 0);
  if (est <= 179) return 'bullet';
  if (est <= 479) return 'blitz';
  return 'rapid';
}
// K del JUGADOR: provisional al principio (rating incierto), después se calma.
function playerK(games) { if (games < 15) return 40; if (games < 50) return 24; return 16; }
function ratingIsProv(games) { return games < 15; }
function clampPlayerRating(r) { return Math.max(100, Math.min(3200, Math.round(r))); }

// Crea (si faltan) las tablas de rating. Mismo patrón perezoso que ensureUserTables.
let _ratedGamesMigrated = false;   // se hace una sola vez por isolate (evita PRAGMA en cada request)
async function ensureRatingTables(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ratings (' +
    'user_id TEXT NOT NULL, category TEXT NOT NULL, ' +
    'rating INTEGER NOT NULL DEFAULT ' + SITE_START_RATING + ', ' +
    'games INTEGER NOT NULL DEFAULT 0, updated INTEGER, ' +
    'PRIMARY KEY (user_id, category))'
  ).run();
  // Log de partidas rateadas: da idempotencia (no re-ratear la misma) y sirve de auditoría.
  // moves/white_name/black_name se agregaron después (historial revivible) → se migran abajo.
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS rated_games (' +
    'game_id TEXT PRIMARY KEY, category TEXT, white_id TEXT, black_id TEXT, result TEXT, ' +
    'white_before INTEGER, white_after INTEGER, black_before INTEGER, black_after INTEGER, ts INTEGER, ' +
    'moves TEXT, white_name TEXT, black_name TEXT)'
  ).run();
  // Migración perezosa: la tabla ya existía en producción SIN las 3 columnas nuevas. Las agrego
  // si faltan (ALTER TABLE ADD COLUMN es barato y no re-escribe filas). Una sola vez por isolate.
  if (_ratedGamesMigrated) return;
  try {
    const info = await env.DB.prepare('PRAGMA table_info(rated_games)').all();
    const cols = new Set(((info && info.results) || []).map((r) => r.name));
    const want = { moves: 'TEXT', white_name: 'TEXT', black_name: 'TEXT', reason: 'TEXT' };
    for (const name in want) {
      if (cols.has(name)) continue;
      try { await env.DB.prepare('ALTER TABLE rated_games ADD COLUMN ' + name + ' ' + want[name]).run(); } catch (e) {}
    }
    _ratedGamesMigrated = true;
  } catch (e) { /* si falla, se reintenta en la próxima llamada */ }
}

// Rating actual de un usuario en una categoría. Si nunca jugó, devuelve el default
// SIN insertar (la fila se crea recién al terminar su primera partida).
async function getRating(env, userId, category) {
  const row = await env.DB.prepare('SELECT rating, games FROM ratings WHERE user_id=?1 AND category=?2')
    .bind(userId, category).first();
  if (row) return { rating: row.rating, games: row.games };
  return { rating: SITE_START_RATING, games: 0 };
}

// GET /rating/top → TOP del sitio por ritmo (público, sin auth). Devuelve los mejores de cada
// categoría (bullet/blitz/rapid) en una sola llamada: { bullet:[…], blitz:[…], rapid:[…] }.
// Cada jugador: { username, userId, rating, games, prov, title }. Excluye baneados. El pool del
// sitio es chico y muchos son provisionales (games<15) → se marca prov y el cliente muestra "?".
async function ratingTop(request, reqUrl, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  await ensureRatingTables(env);
  let limit = parseInt(reqUrl.searchParams.get('limit') || '20', 10);
  if (!(limit > 0)) limit = 20; if (limit > 50) limit = 50;
  const cats = ['bullet', 'blitz', 'rapid'];
  const out = {};
  for (const c of cats) {
    let rows = [];
    try {
      const q = await env.DB.prepare(
        'SELECT r.user_id AS userId, r.rating AS rating, r.games AS games, u.username AS username, u.title AS title ' +
        'FROM ratings r JOIN usuarios u ON u.id = r.user_id ' +
        'WHERE r.category = ?1 AND r.games > 0 AND (u.banned IS NULL OR u.banned = 0) ' +
        'ORDER BY r.rating DESC, r.games DESC LIMIT ?2'
      ).bind(c, limit).all();
      rows = (q && q.results) || [];
    } catch (e) { rows = []; }
    out[c] = rows.map((r) => ({
      username: r.username || 'Jugador', userId: r.userId,
      rating: r.rating, games: r.games, prov: ratingIsProv(r.games), title: r.title || null,
    }));
  }
  return jsonResp(out, 200, 20);   // cache 20s: es un ranking, no hace falta al segundo
}

// GET /rating/me  (Authorization: Bearer <sesión>) → mis 3 ratings del sitio.
async function ratingMe(request, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const u = await sessionUser(request, env);
  if (!u) return errJson('No autenticado', 401);
  await ensureRatingTables(env);
  const cats = ['bullet', 'blitz', 'rapid'];
  const ratings = {}, games = {}, prov = {};
  for (const c of cats) {
    const r = await getRating(env, u.id, c);
    ratings[c] = r.rating; games[c] = r.games; prov[c] = ratingIsProv(r.games);
  }
  // Para la moderación: el DO cachea el mute (no puede escribir hasta que pase) y sabe si es
  // moderador (por el nombre de usuario). muted_until = timestamp UNIX en segundos (0 = sin mute).
  const mutedUntil = Number(u.chat_muted_until || 0) || 0;
  // "No molestar": el Lobby DO lo cachea (session.dnd) para rechazar desafíos dirigidos. Se lee
  // acá (no en sessionUser) porque la columna es nueva y hay que asegurar la tabla antes del SELECT.
  let dnd = 0;
  try { await ensureUserTables(env); const dr = await env.DB.prepare('SELECT dnd FROM usuarios WHERE id=?1').bind(u.id).first(); dnd = (dr && dr.dnd) ? 1 : 0; } catch (e) { /* si falla, dnd=0 */ }
  // Para el bloqueo: a quiénes bloqueé (blocked) y quiénes me bloquearon (blocked_by). El lobby los usa
  // para no cruzar desafíos entre bloqueados; el cliente además filtra presencia y desafíos abiertos.
  let blocked = [], blockedBy = [];
  try {
    await ensureBlocksTable(env);
    const b1 = await env.DB.prepare('SELECT blocked_id FROM blocks WHERE blocker_id=?1').bind(u.id).all();
    blocked = ((b1 && b1.results) || []).map((r) => r.blocked_id);
    const b2 = await env.DB.prepare('SELECT blocker_id FROM blocks WHERE blocked_id=?1').bind(u.id).all();
    blockedBy = ((b2 && b2.results) || []).map((r) => r.blocker_id);
  } catch (e) { /* si falla, sigue sin bloqueos */ }
  return jsonResp({ id: u.id, username: u.username, ratings, games, prov,
    muted_until: mutedUntil, is_mod: MOD_USERNAMES.has(String(u.username || '').toLowerCase()),
    dnd, blocked, blocked_by: blockedBy });
}

// GET /u/<usuario> — PERFIL PÚBLICO de cualquier jugador (SIN auth). Sólo datos públicos:
// identidad + rating de Lichess + los 3 ratings del sitio + táctica (rating/resueltos).
// Nunca el token de Lichess ni e-mail. Si el usuario no existe (ej. un invitado de una
// partida) → 404 "sin perfil". Búsqueda por nombre sin distinguir mayúsculas.
async function publicProfile(request, reqUrl, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  let handle = '';
  try { handle = decodeURIComponent(reqUrl.pathname.slice(3)); } catch (e) { handle = reqUrl.pathname.slice(3); }
  handle = String(handle).replace(/\/+$/, '').trim().slice(0, 40);
  if (!handle) return errJson('Falta el usuario', 400);
  await ensureUserTables(env);
  const u = await env.DB.prepare(
    'SELECT id, username, rating, title, display_name, country, bio, created_at, dnd FROM usuarios WHERE LOWER(username)=LOWER(?1)'
  ).bind(handle).first();
  if (!u) return errJson('Este jugador no tiene perfil en el sitio', 404);

  // Los 3 ratings del sitio (bullet/blitz/rápido).
  await ensureRatingTables(env);
  const cats = ['bullet', 'blitz', 'rapid'];
  const ratings = {}, games = {}, prov = {};
  for (const c of cats) {
    const r = await getRating(env, u.id, c);
    ratings[c] = r.rating; games[c] = r.games; prov[c] = ratingIsProv(r.games);
  }

  // Táctica (pública, como el puzzle rating de Lichess): rating del blob + resueltos de la columna.
  let tactic = null;
  try {
    await ensurePuzProgressTable(env);
    const row = await env.DB.prepare('SELECT data, solved FROM user_puzzle WHERE user_id=?1').bind(u.id).first();
    if (row) {
      let rt = null;
      try { const b = JSON.parse(row.data || 'null'); if (b && b.rating != null) rt = Math.round(b.rating); } catch (e) {}
      tactic = { rating: rt, solved: row.solved || 0 };
    }
  } catch (e) { /* si falla la táctica, el perfil sale igual sin ella */ }

  // Seguidores / siguiendo (públicos) + si el que pregunta (si mandó su sesión) ya lo sigue.
  let followers = 0, following = 0, youFollow = false;
  try {
    await ensureFollowTable(env);
    const a = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_id=?1').bind(u.id).first();
    const b = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id=?1').bind(u.id).first();
    followers = (a && a.n) || 0; following = (b && b.n) || 0;
    const me = await sessionUser(request, env);   // opcional: /u/ no exige login
    if (me && me.id !== u.id) {
      const f = await env.DB.prepare('SELECT 1 AS x FROM follows WHERE follower_id=?1 AND followee_id=?2').bind(me.id, u.id).first();
      youFollow = !!f;
    }
  } catch (e) { /* si falla, el perfil sale igual sin seguidores */ }

  return jsonResp({
    id: u.id, username: u.username, title: u.title || null, ratingLichess: u.rating || null,
    name: u.display_name || null, country: u.country || null, bio: u.bio || null, createdAt: u.created_at || null,
    ratings, games, prov, tactic, followers, following, youFollow, dnd: u.dnd ? 1 : 0,
  });
}

// POST /prefs  (Authorization: Bearer)  body { dnd } → preferencias guardadas EN LA CUENTA (viajan
// entre dispositivos). Hoy sólo "No molestar" (dnd: 1 = otros no te pueden desafiar). El Lobby DO lo
// lee de /rating/me al conectar y lo actualiza en vivo con el mensaje set-dnd.
async function savePrefs(request, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const u = await sessionUser(request, env);
  if (!u) return errJson('No autenticado', 401);
  await ensureUserTables(env);
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const dnd = body.dnd ? 1 : 0;
  try { await env.DB.prepare('UPDATE usuarios SET dnd=?2 WHERE id=?1').bind(u.id, dnd).run(); }
  catch (e) { return errJson('No se pudo guardar la preferencia', 500); }
  return jsonResp({ dnd });
}

// POST /profile  (Authorization: Bearer)  body { name, country, bio } → guarda la fichita editable
// del usuario logueado (nombre a mostrar, país, nota). Devuelve lo guardado ya recortado.
async function saveProfile(request, env) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const me = await sessionUser(request, env);
  if (!me) return errJson('No autenticado', 401);
  let body; try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  // Recortes y saneo: nombre y país cortos; nota con tope. \r\n de la nota se normalizan a \n.
  const name = String(body.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 40);
  const country = String(body.country || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const bio = String(body.bio || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, 200);
  await ensureUserTables(env);
  try {
    await env.DB.prepare('UPDATE usuarios SET display_name=?1, country=?2, bio=?3 WHERE id=?4')
      .bind(name || null, country || null, bio || null, me.id).run();
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ ok: true, name: name || null, country: country || null, bio: bio || null });
}

// Crea (si falta) la tabla de "seguir". Mismo patrón perezoso que las demás.
async function ensureFollowTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS follows (follower_id TEXT NOT NULL, followee_id TEXT NOT NULL, ' +
    'created_at INTEGER, PRIMARY KEY (follower_id, followee_id))'
  ).run();
}

// POST /follow  ·  POST /unfollow   (Authorization: Bearer <sesión>, body { userId })
// follower = el dueño de la sesión; followee = userId del body.
async function followToggle(request, env, follow) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const me = await sessionUser(request, env);
  if (!me) return errJson('No autenticado', 401);
  let body; try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  const target = String(body.userId || '');
  if (!target) return errJson('Falta userId', 400);
  if (target === me.id) return errJson('No podés seguirte a vos mismo', 400);
  await ensureUserTables(env);
  await ensureFollowTable(env);
  const exists = await env.DB.prepare('SELECT id FROM usuarios WHERE id=?1').bind(target).first();
  if (!exists) return errJson('Usuario no encontrado', 404);
  // No se puede seguir a alguien bloqueado (en cualquier dirección).
  if (follow) {
    await ensureBlocksTable(env);
    if (await pairBlocked(env, me.id, target)) return errJson('No podés seguir a un usuario bloqueado', 403);
  }
  const now = Math.floor(Date.now() / 1000);
  try {
    if (follow) {
      await env.DB.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?1,?2,?3)')
        .bind(me.id, target, now).run();
    } else {
      await env.DB.prepare('DELETE FROM follows WHERE follower_id=?1 AND followee_id=?2').bind(me.id, target).run();
    }
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  const fc = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_id=?1').bind(target).first();
  return jsonResp({ ok: true, following: !!follow, followers: (fc && fc.n) || 0 });
}

// GET /following  (Authorization: Bearer) → lista de {id, username} de los usuarios que sigo.
// La usa el cliente para cruzar con "quién está en línea" (presencia del salón).
async function followingList(request, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const me = await sessionUser(request, env);
  if (!me) return errJson('No autenticado', 401);
  await ensureUserTables(env);
  await ensureFollowTable(env);
  let rows;
  try {
    rows = await env.DB.prepare(
      'SELECT u.id, u.username FROM follows f JOIN usuarios u ON u.id = f.followee_id WHERE f.follower_id=?1'
    ).bind(me.id).all();
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  const list = (rows && rows.results) ? rows.results.map((r) => ({ id: r.id, username: r.username })) : [];
  return jsonResp({ following: list });
}

// ── BLOQUEO entre usuarios (server-side, SIMÉTRICO) ──────────────────────────
// "X bloqueó a Y" = fila (blocker_id=X, blocked_id=Y). El efecto es simétrico: si cualquiera de los dos
// bloqueó al otro, no pueden seguirse ni desafiarse (lo enforcea el servidor) y no se ven en línea (lo
// filtra el cliente con la lista que baja de /blocks). EXCEPCIÓN: en el chat, un MODERADOR siempre lee a
// todos — el ocultar mensajes por bloqueo lo hace el cliente y NO aplica a los mods, así nadie se
// esconde de la moderación bloqueando al mod.
async function ensureBlocksTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS blocks (blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, ' +
    'created_at INTEGER, PRIMARY KEY (blocker_id, blocked_id))'
  ).run();
}

// ¿a y b están bloqueados entre sí (en cualquier dirección)?
async function pairBlocked(env, a, b) {
  const r = await env.DB.prepare(
    'SELECT 1 AS x FROM blocks WHERE (blocker_id=?1 AND blocked_id=?2) OR (blocker_id=?2 AND blocked_id=?1) LIMIT 1'
  ).bind(a, b).first();
  return !!r;
}

// POST /block · /unblock  (Bearer) { userId } — bloquear/desbloquear a otro usuario.
async function blockToggle(request, env, block) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const me = await sessionUser(request, env);
  if (!me) return errJson('No autenticado', 401);
  let body; try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  const target = String(body.userId || '').trim();
  if (!target) return errJson('Falta userId', 400);
  if (target === me.id) return errJson('No podés bloquearte a vos mismo', 400);
  await ensureUserTables(env); await ensureBlocksTable(env);
  const exists = await env.DB.prepare('SELECT id FROM usuarios WHERE id=?1').bind(target).first();
  if (!exists) return errJson('Usuario no encontrado', 404);
  const now = Math.floor(Date.now() / 1000);
  try {
    if (block) {
      await env.DB.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?1,?2,?3)')
        .bind(me.id, target, now).run();
      // Bloquear corta el seguir en AMBAS direcciones (ya no tiene sentido).
      try {
        await ensureFollowTable(env);
        await env.DB.prepare('DELETE FROM follows WHERE (follower_id=?1 AND followee_id=?2) OR (follower_id=?2 AND followee_id=?1)')
          .bind(me.id, target).run();
      } catch (e) {}
    } else {
      await env.DB.prepare('DELETE FROM blocks WHERE blocker_id=?1 AND blocked_id=?2').bind(me.id, target).run();
    }
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  return jsonResp({ ok: true, userId: target, blocked: block });
}

// GET /blocks (Bearer) → { blocked:[{userId,username}] } — a quiénes bloqueé (para filtrar en el cliente).
async function blocksList(request, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const me = await sessionUser(request, env);
  if (!me) return errJson('No autenticado', 401);
  await ensureUserTables(env); await ensureBlocksTable(env);
  let rows;
  try {
    rows = await env.DB.prepare(
      'SELECT u.id, u.username FROM blocks b JOIN usuarios u ON u.id = b.blocked_id WHERE b.blocker_id=?1'
    ).bind(me.id).all();
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  const list = (rows && rows.results) ? rows.results.map((r) => ({ userId: r.id, username: r.username })) : [];
  return jsonResp({ blocked: list });
}

// POST /rating/report  (header X-Vivo-Secret) — SÓLO lo llama el worker de vivo cuando
// una partida termina de verdad. body { gameId, white, black, result:'w'|'b'|'draw', base, inc }
// (white/black = ids de usuario). Devuelve los nuevos ratings + el delta de cada uno.
async function ratingReport(request, env) {
  if (request.method !== 'POST') return errJson('Usá POST', 405);
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const secret = request.headers.get('X-Vivo-Secret') || '';
  if (!env.VIVO_SECRET || secret !== env.VIVO_SECRET) return errJson('No autorizado', 403);
  let body;
  try { body = await request.json(); } catch (e) { return errJson('JSON inválido', 400); }
  const gameId = String(body.gameId || '').slice(0, 80);
  const white = String(body.white || '');
  const black = String(body.black || '');
  const result = String(body.result || '');
  const category = ratingCategory(body.base, body.inc);
  const moves = String(body.moves || '').slice(0, 20000);         // jugadas SAN (para revivir en el visor)
  const wname = String(body.wname || '').slice(0, 60);
  const bname = String(body.bname || '').slice(0, 60);
  const reason = String(body.reason || '').slice(0, 20);          // motivo del final (checkmate/flag/resign/…)
  if (!gameId || !white || !black) return errJson('Faltan datos (gameId, white, black)', 400);
  if (white === black) return errJson('Una cuenta no puede jugar contra sí misma', 400);
  if (result !== 'w' && result !== 'b' && result !== 'draw') return errJson('result inválido', 400);
  await ensureRatingTables(env);

  // Idempotencia: si esta partida ya se rateó, devolvemos lo guardado sin re-aplicar.
  const prev = await env.DB.prepare('SELECT * FROM rated_games WHERE game_id=?1').bind(gameId).first();
  if (prev) {
    return jsonResp({
      already: true, category: prev.category,
      white: { rating: prev.white_after, delta: prev.white_after - prev.white_before },
      black: { rating: prev.black_after, delta: prev.black_after - prev.black_before },
    });
  }

  const rw = await getRating(env, white, category);
  const rb = await getRating(env, black, category);
  const Sw = result === 'w' ? 1 : result === 'draw' ? 0.5 : 0;
  const Sb = 1 - Sw;
  const Ew = 1 / (1 + Math.pow(10, (rb.rating - rw.rating) / 400));   // prob. esperada de que gane blancas
  const Eb = 1 - Ew;
  const newW = clampPlayerRating(rw.rating + playerK(rw.games) * (Sw - Ew));
  const newB = clampPlayerRating(rb.rating + playerK(rb.games) * (Sb - Eb));
  const now = Math.floor(Date.now() / 1000);

  // Persistir ambos ratings (+1 partida) y dejar el log de la partida, en una sola tanda.
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO ratings (user_id, category, rating, games, updated) VALUES (?1,?2,?3,1,?4) ' +
        'ON CONFLICT(user_id, category) DO UPDATE SET rating=?3, games=games+1, updated=?4')
        .bind(white, category, newW, now),
      env.DB.prepare('INSERT INTO ratings (user_id, category, rating, games, updated) VALUES (?1,?2,?3,1,?4) ' +
        'ON CONFLICT(user_id, category) DO UPDATE SET rating=?3, games=games+1, updated=?4')
        .bind(black, category, newB, now),
      env.DB.prepare('INSERT INTO rated_games (game_id, category, white_id, black_id, result, ' +
        'white_before, white_after, black_before, black_after, ts, moves, white_name, black_name, reason) ' +
        'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)')
        .bind(gameId, category, white, black, result, rw.rating, newW, rb.rating, newB, now, moves, wname, bname, reason),
    ]);
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }

  return jsonResp({
    category,
    white: { rating: newW, delta: newW - rw.rating, games: rw.games + 1, prov: ratingIsProv(rw.games + 1) },
    black: { rating: newB, delta: newB - rb.rating, games: rb.games + 1, prov: ratingIsProv(rb.games + 1) },
  });
}

// GET /rating/games?user=<usuario>[&limit=N]  — PÚBLICO (mismo criterio que /u/): historial de
// partidas rateadas de un jugador, ya "orientado" hacia él (rival, color, resultado, delta).
// LIVIANO: NO trae las jugadas (esas se bajan por /rating/game?id= al abrir la partida) → así se
// puede traer TODO el historial barato y el gráfico de progreso usa la serie completa. Más nuevas 1º.
async function ratingGames(request, reqUrl, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const handle = String(reqUrl.searchParams.get('user') || '').trim().slice(0, 40);
  if (!handle) return errJson('Falta el usuario', 400);
  let limit = parseInt(reqUrl.searchParams.get('limit') || '500', 10);
  if (!(limit > 0)) limit = 500;
  limit = Math.min(limit, 1000);
  await ensureUserTables(env);
  const u = await env.DB.prepare('SELECT id, username FROM usuarios WHERE LOWER(username)=LOWER(?1)').bind(handle).first();
  if (!u) return errJson('Este jugador no tiene perfil en el sitio', 404);
  await ensureRatingTables(env);
  let rows;
  try {
    rows = await env.DB.prepare(
      'SELECT game_id, category, white_id, black_id, result, white_before, white_after, ' +
      'black_before, black_after, ts, white_name, black_name, reason FROM rated_games ' +   // sin moves (livianas)
      'WHERE white_id=?1 OR black_id=?1 ORDER BY ts DESC LIMIT ?2'
    ).bind(u.id, limit).all();
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  const list = ((rows && rows.results) || []).map((r) => {
    const iAmWhite = (r.white_id === u.id);
    const color = iAmWhite ? 'w' : 'b';
    const before = iAmWhite ? r.white_before : r.black_before;
    const after = iAmWhite ? r.white_after : r.black_after;
    // resultado desde MI punto de vista
    let outcome = 'draw';
    if (r.result === 'w') outcome = iAmWhite ? 'win' : 'loss';
    else if (r.result === 'b') outcome = iAmWhite ? 'loss' : 'win';
    return {
      gameId: r.game_id, category: r.category, ts: r.ts,
      color, opponent: (iAmWhite ? r.black_name : r.white_name) || 'Invitado',
      outcome, before, after, delta: (after != null && before != null) ? (after - before) : null,
      reason: r.reason || '',
    };
  });
  return jsonResp({ id: u.id, username: u.username, games: list });
}

// GET /rating/game?id=<gameId>  — PÚBLICO: UNA partida por su id (para el link compartible
// ?vg=<gameId>). Devuelve los datos crudos que el cliente necesita para armar el PGN y abrirla
// en el visor. 404 si no existe.
async function ratingGame(request, reqUrl, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const id = String(reqUrl.searchParams.get('id') || '').trim().slice(0, 80);
  if (!id) return errJson('Falta el id', 400);
  await ensureRatingTables(env);
  let r;
  try {
    r = await env.DB.prepare(
      'SELECT game_id, category, white_id, black_id, result, white_before, white_after, ' +
      'black_before, black_after, ts, moves, white_name, black_name FROM rated_games WHERE game_id=?1'
    ).bind(id).first();
  } catch (e) { return errJson('D1 error: ' + e.message, 500); }
  if (!r) return errJson('Partida no encontrada', 404);
  return jsonResp({
    gameId: r.game_id, category: r.category, ts: r.ts, result: r.result,
    white: r.white_name || 'Blancas', black: r.black_name || 'Negras',
    whiteBefore: r.white_before, whiteAfter: r.white_after,
    blackBefore: r.black_before, blackAfter: r.black_after,
    moves: r.moves || '',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESO DE EJERCICIOS ATADO A LA CUENTA — /puz/progress
// ─────────────────────────────────────────────────────────────────────────────
// El progreso de táctica (rating, resueltos, rachas, calendario) vivía SÓLO en el
// navegador (localStorage). Acá lo guardamos por usuario así viaja entre dispositivos.
// No es competitivo (es progreso personal), así que alcanza con guardar el "blob" que
// arma el cliente; no hace falta recalcularlo en el servidor.
//   GET  /puz/progress  (Bearer) → { progress: <blob|null>, solved }
//   POST /puz/progress  (Bearer, body = blob JSON) → { ok:true }
const PUZ_PROGRESS_MAX = 200000;   // tope de tamaño del blob (~200 KB, de sobra)

async function ensurePuzProgressTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS user_puzzle (' +
    'user_id TEXT PRIMARY KEY, data TEXT, solved INTEGER, updated INTEGER)'
  ).run();
}

async function puzProgress(request, env) {
  if (!env.DB) return errJson('Falta el binding D1 (DB)', 500);
  const u = await sessionUser(request, env);
  if (!u) return errJson('No autenticado', 401);
  await ensurePuzProgressTable(env);

  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, solved FROM user_puzzle WHERE user_id=?1').bind(u.id).first();
    if (!row || !row.data) return jsonResp({ progress: null, solved: 0 });
    let progress = null;
    try { progress = JSON.parse(row.data); } catch (e) { progress = null; }
    return jsonResp({ progress, solved: row.solved || 0 });
  }

  if (request.method === 'POST') {
    const text = await request.text();
    if (!text || text.length > PUZ_PROGRESS_MAX) return errJson('Blob inválido o demasiado grande', 400);
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return errJson('JSON inválido', 400); }
    if (!obj || typeof obj !== 'object') return errJson('Blob inválido', 400);
    const solved = Math.max(0, Math.floor(+obj.solved || +obj.n || 0));
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        'INSERT INTO user_puzzle (user_id, data, solved, updated) VALUES (?1,?2,?3,?4) ' +
        'ON CONFLICT(user_id) DO UPDATE SET data=?2, solved=?3, updated=?4'
      ).bind(u.id, text, solved, now).run();
    } catch (e) { return errJson('D1 error: ' + e.message, 500); }
    return jsonResp({ ok: true });
  }

  return errJson('Método no soportado', 405);
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
