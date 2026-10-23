// ♟️ Eventos de Chess.com en la portada «Hoy» (23/10/2026): el Chess Club Showdown (arena por clubes de esports).
//
//   node herramientas/chesscom-eventos/armar.mjs
//
// Lee la lista de herramientas/chesscom-eventos/eventos.json y escribe data/chesscom-eventos.json, que la portada usa
// para mostrar el evento ANTES (fecha, cuenta regresiva, cómo anotarse y cómo terminó la edición anterior) y DESPUÉS
// (tabla de clubes, los argentinos, los mejores). En vivo no: la gente lo juega en Chess.com.
//
// De dónde sale cada cosa:
//   · la API pública (api.chess.com/pub/tournament/<slug>) → fecha, estado, ritmo, anotados.
//   · la PÁGINA del torneo (sólo cuando terminó) → la tabla de clubes y la de jugadores con país, club y rating. La
//     API no las da: la de un arena trae 25 jugadores sin puntos y la ronda da error. De los jugadores sólo se
//     publican las FIGURAS de cada club (los de más rating: Carlsen, Fausti…), no la lista entera (pedido del autor
//     23/10). Las figuras terminan arriba, así que alcanza con las primeras páginas (?players=N, de a 25), de a una
//     con pausa; se leen UNA vez y quedan guardadas (no se vuelven a pedir en cada publicación).
// Lo corre solo publicar-web.cmd. Si algo falla, deja el archivo como estaba.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UA_API = 'ChessArgentino (https://chessargentino.ar; portada)';
const UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PAUSA = 900;
const TOPE_PAGINAS = 24;   // 600 jugadores: las figuras de cada club están mucho más arriba
export const FIGURAS = 3;  // por club

// ── Lo que se puede probar sin internet (lo usa test-web.mjs) ─────────────────────────────

const _txt = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// La tabla «Club Results» de la página: [{ p, n, slug, img, jug, pts }] + el tope de jugadores que suman por club.
export function leerClubes(html) {
  html = String(html || '');
  const out = { clubes: [], tope: 0 };
  const mt = /(\d+)\s+max eligible scorers per club/i.exec(html);
  if (mt) out.tope = +mt[1];
  const i = html.indexOf('Club Results');
  if (i < 0) return out;
  const fin = html.indexOf('</table>', i);
  const tabla = html.slice(i, fin > 0 ? fin : undefined);
  const filas = tabla.split(/<tr\b[^>]*>/).slice(1);
  for (const f of filas) {
    const tds = f.split(/<td\b[^>]*>/).slice(1);
    if (tds.length < 4) continue;
    const p = +(_txt(tds[0]).replace('#', '')) || 0;
    const a = /href="https:\/\/www\.chess\.com\/club\/([a-z0-9-]+)"/i.exec(tds[1]);
    const img = /<img[^>]*src="(https:\/\/images\.chesscomfiles\.com\/[^"]+)"/i.exec(tds[1]);
    const n = _txt(tds[1]);
    if (!p || !a || !n) continue;
    out.clubes.push({ p, n, slug: a[1].toLowerCase(), img: img ? img[1] : '', jug: +_txt(tds[2]).replace(/\D/g, '') || 0, pts: +_txt(tds[3]).replace(/\D/g, '') || 0 });
  }
  return out;
}

// Los renglones de «Player Results» de una página: [{ p, u, t, pais, r, club, pts, g, e }].
export function leerJugadores(html) {
  const out = [];
  const filas = String(html || '').split('class="tournaments-live-view-results-row"').slice(1);
  for (const f of filas) {
    const rk = /tournaments-live-view-results-rank"[^>]*>\s*#?(\d+)/.exec(f);
    const u = /data-test-element="user-tagline-username"[^>]*>\s*([^<\s]+)\s*</.exec(f);
    if (!rk || !u) continue;
    const t = /class="cc-user-title-component[^"]*"[^>]*>\s*([A-Z]{1,4})\s*</.exec(f);
    const pais = /class="cc-country-flag-component[^"]*\bcountry-([a-z0-9]+)"/.exec(f);
    const club = /class="tournaments-live-view-club-name-link"[^>]*href="https:\/\/www\.chess\.com\/club\/([a-z0-9-]+)"/i.exec(f);
    const pts = /class="tournaments-live-view-total-score"[^>]*>\s*(\d+)/.exec(f);
    const ge = /v-tooltip="(\d+) wins?, (\d+) draws?/.exec(f);
    const r = /class="user-rating"[^>]*>\s*\((\d+)\)/.exec(f);
    const o = { p: +rk[1], u: u[1], pts: pts ? +pts[1] : 0 };
    if (t) o.t = t[1];
    if (pais) o.pais = pais[1];
    if (r) o.r = +r[1];
    if (club) o.club = club[1].toLowerCase();
    if (ge) { o.g = +ge[1]; o.e = +ge[2]; }
    out.push(o);
  }
  return out;
}

// Cuántas páginas tiene la lista de jugadores: el primer data-total-pages de la página (el segundo es el de las partidas).
export function paginasJugadores(html) {
  const m = /data-total-pages="(\d+)"/.exec(String(html || ''));
  return m ? +m[1] : 1;
}

// Lo que se publica de un evento terminado: los clubes, cada uno con sus FIGURAS (los de más rating que jugaron por
// él, con su puesto y sus puntos). ccAId = { usuarioDeChessCom: número de perfil } (data/online.json → j): así un
// argentino con perfil en la web lleva a su perfil.
export function resumirFinal(clubesInfo, jugadores, ccAId, clubesAR, banderas) {
  const vistos = new Set(), L = [];
  for (const j of jugadores) { const k = j.u.toLowerCase(); if (!vistos.has(k)) { vistos.add(k); L.push(j); } }
  const limpio = (j) => {
    const o = { p: j.p, u: j.u, pts: j.pts };
    if (j.t) o.t = j.t;
    if (j.r) o.r = j.r;
    if (j.pais && j.pais !== 'xx' && (!banderas || banderas.has(j.pais))) o.pais = j.pais;
    const id = ccAId[j.u.toLowerCase()];
    if (id) o.id = +id;
    return o;
  };
  const ar = new Set((clubesAR || []).map((s) => String(s).toLowerCase()));
  return {
    tope: clubesInfo.tope || 0,
    total: clubesInfo.clubes.reduce((s, c) => s + (c.jug || 0), 0),
    clubes: clubesInfo.clubes.map((c) => {
      const del = L.filter((j) => j.club === c.slug).sort((a, b) => ((b.r || 0) - (a.r || 0)) || (a.p - b.p));
      // + los argentinos con título o con perfil en la web, aunque no estén entre los de más rating (hasta 3 más).
      const arg = del.slice(FIGURAS).filter((j) => (j.pais === 'ar' && j.t) || ccAId[j.u.toLowerCase()]).slice(0, 3);
      const fig = del.slice(0, FIGURAS).concat(arg).map(limpio);
      return Object.assign({}, c, ar.has(c.slug) ? { ar: 1 } : {}, { fig });
    }),
  };
}

// Un evento según la API: { ini, fin, estado, ritmo, anot }.
export function datosApi(t, ahora = Date.now()) {
  const s = (t && t.settings) || {};
  const ini = t && t.start_time ? t.start_time * 1000 : 0;
  const fin = t && t.finish_time ? t.finish_time * 1000 : 0;
  let estado = 'prox';
  if (t && t.status === 'finished') estado = 'fin';
  else if (t && (t.status === 'in_progress' || (ini && ahora >= ini))) estado = 'vivo';
  const tc = String(s.time_control || '');
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc);
  const o = { ini, estado, anot: s.registered_user_count || 0 };
  if (fin) o.fin = fin;
  if (m) o.ritmo = Math.round(+m[1] / 60) + '+' + (m[2] || 0);
  return o;
}

// ── Ediciones que se encuentran solas (23/10: «pinta que se va a jugar todos los meses») ─────────────────────────────

const _norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const slugDe = (nombre) => _norm(nombre).replace(/ /g, '-');
// El número del arena en un link de Chess.com (/play/arena/31136288 o /tournament/live/arena/chess-club-showdown-31136288).
export function arenaId(url) {
  const m = /chess\.com\/(?:play\/arena\/|tournament\/live\/(?:arena\/)?(?:[a-z0-9-]*-)?)(\d{6,})/i.exec(String(url || ''));
  return m ? m[1] : '';
}
// Los torneos de la web cuyo NOMBRE es el de una serie → { ed: [{ serie, slug, link }], sinLink: [nombres] }.
export function edicionesDeTorneos(torneos, series) {
  const ed = [], sinLink = [];
  for (const t of torneos || []) {
    if (!t || !t.name) continue;
    const n = _norm(t.name);
    for (const [k, s] of Object.entries(series || {})) {
      if (!s.nombre || n.indexOf(_norm(s.nombre)) < 0) continue;
      const links = [t.chesscomUrl, t.weburl, t.regurl, t.crurl, t.crUrl];
      const id = links.map(arenaId).find(Boolean);
      if (id) ed.push({ serie: k, slug: slugDe(s.nombre) + '-' + id, link: links.find((u) => arenaId(u) === id) });
      else sinLink.push(t.name);
    }
  }
  return { ed, sinLink };
}
// La lista final: las de eventos.json (mandan) + las encontradas, sin repetir, con lo que se repite de su serie.
export function juntarEdiciones(cfg, auto) {
  const out = [], vistos = new Set();
  for (const e of (cfg.eventos || []).concat(auto || [])) {
    if (!e || !e.slug || vistos.has(e.slug)) continue;
    vistos.add(e.slug);
    const s = (cfg.series || {})[e.serie] || {};
    const o = { serie: e.serie, nombre: e.nombre || s.nombre || '', slug: e.slug, link: e.link || 'https://www.chess.com/tournament/live/arena/' + e.slug };
    if (e.ed) o.ed = +e.ed;
    const club = e.club || s.club;
    if (club && /^https:\/\/www\.chess\.com\/club\//.test(club.url || '')) o.club = { nombre: String(club.nombre || ''), url: club.url };
    const abre = +(e.abre || s.abre || 0);
    if (abre > 0) o.abre = abre;
    if (e.nota) o.nota = String(e.nota);
    out.push(o);
  }
  return out;
}
// Número de edición de las que no lo traen: la anterior de su serie (por fecha) + 1.
export function numerar(ev) {
  const ult = {};
  ev.slice().sort((a, b) => (a.ini || 0) - (b.ini || 0)).forEach((e) => {
    if (!e.ed) e.ed = (ult[e.serie] || 0) + 1;
    ult[e.serie] = Math.max(ult[e.serie] || 0, e.ed);
  });
  return ev;
}
// Los torneos publicados de la web: los cargados a mano (data/manifest.js) + los del teléfono (data/live-torneos.json).
function torneosDeLaWeb() {
  const out = [];
  try {
    const W = {};
    new Function('window', fs.readFileSync(path.join(RAIZ, 'data', 'manifest.js'), 'utf8'))(W);
    Object.values(W.__EMBEDDED_TZ__ || {}).forEach((t) => { if (t && t.name) out.push(t); });
    ((W.__MANIFEST__ || {}).tournaments || []).forEach((t) => { if (t && t.name) out.push(t); });
  } catch (e) {}
  try {
    const L = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'live-torneos.json'), 'utf8'));
    (Array.isArray(L.nuevos) ? L.nuevos : Object.values(L.nuevos || {})).forEach((t) => { if (t && t.name) out.push(t); });
  } catch (e) {}
  return out;
}

// ── Lo que sale a internet ─────────────────────────────

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function pedir(url, ua, json) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': json ? 'application/json' : 'text/html' } });
    if (r.status === 429) { await dormir(5000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
    return json ? r.json() : r.text();
  }
  throw new Error(url + ' → 429 (demasiados pedidos)');
}

async function leerPagina(slug) {
  const base = 'https://www.chess.com/tournament/live/arena/' + slug;
  const h1 = await pedir(base, UA_WEB, false);
  const clubes = leerClubes(h1);
  const jug = leerJugadores(h1);
  const n = Math.min(paginasJugadores(h1), TOPE_PAGINAS);
  for (let p = 2; p <= n; p++) {
    await dormir(PAUSA);
    const fila = leerJugadores(await pedir(base + '?players=' + p, UA_WEB, false));
    if (!fila.length) break;
    jug.push(...fila);
    if (p % 25 === 0) console.log('   … página ' + p + ' de ' + n);
  }
  return { clubes, jug };
}

function ccAIdDeOnline() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'online.json'), 'utf8'));
    const m = {};
    for (const [id, c] of Object.entries(o.j || {})) if (c && c.cc) m[String(c.cc).toLowerCase()] = id;
    return m;
  } catch (e) { return {}; }
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'herramientas', 'chesscom-eventos', 'eventos.json'), 'utf8'));
  const dest = path.join(RAIZ, 'data', 'chesscom-eventos.json');
  let antes = { ev: [] };
  try { antes = JSON.parse(fs.readFileSync(dest, 'utf8')); } catch (e) {}
  const viejo = {};
  (antes.ev || []).forEach((e) => { viejo[e.slug] = e; });
  const banderas = new Set(fs.readdirSync(path.join(RAIZ, 'assets', 'flags')).map((f) => f.replace(/\.svg$/, '')));
  const ccAId = ccAIdDeOnline();
  const ahora = Date.now();
  const auto = edicionesDeTorneos(torneosDeLaWeb(), cfg.series);
  auto.sinLink.forEach((n) => console.log('   ⚠️ El torneo «' + n + '» no tiene el link del arena de Chess.com (chess.com/play/arena/NÚMERO): pegalo en el campo Chess.com o Sitio web del torneo para que aparezca en la portada.'));
  const ev = [];
  for (const o of juntarEdiciones(cfg, auto.ed)) {
    const e = o, prev = viejo[o.slug] || {};
    try {
      Object.assign(o, datosApi(await pedir('https://api.chess.com/pub/tournament/' + e.slug, UA_API, true), ahora));
    } catch (err) {
      console.log('   ' + e.nombre + ' (' + e.slug + '): no respondió la API (' + err.message + '). Queda lo de la vez pasada.');
      if (prev.slug) ev.push(prev);
      continue;
    }
    if (!o.ini) { console.log('   ' + e.nombre + ' (' + e.slug + '): Chess.com no da la fecha; se deja afuera.'); continue; }
    // La tabla final se lee una vez; si se leyó en la primera hora después del final, otra más (por si se acomodó).
    const leidaFirme = prev.res && prev.leido && o.fin && prev.leido - o.fin > 3600e3;
    if (o.estado === 'fin' && leidaFirme) { o.res = prev.res; o.leido = prev.leido; }
    else if (o.estado === 'fin') {
      try {
        console.log('   ' + e.nombre + ' ' + e.ed + ': leyendo la tabla final (unos minutos)…');
        const { clubes, jug } = await leerPagina(e.slug);
        if (!clubes.clubes.length || !jug.length) throw new Error('la página no trajo las tablas');
        o.res = resumirFinal(clubes, jug, ccAId, cfg.clubesAR, banderas);
        o.leido = Date.now();
      } catch (err) {
        console.log('   ' + e.nombre + ' ' + e.ed + ': no se pudo leer la tabla (' + err.message + ').');
        if (prev.res) { o.res = prev.res; o.leido = prev.leido; }
      }
    }
    ev.push(o);
  }
  numerar(ev);
  const txt = JSON.stringify({ v: 1, ev });
  if (txt === JSON.stringify({ v: antes.v, ev: antes.ev })) { console.log('Eventos de Chess.com: sin cambios.'); return; }
  fs.writeFileSync(dest, txt);
  console.log('Eventos de Chess.com: ' + ev.map((x) => x.nombre + ' ' + x.ed + ' (' + x.estado + (x.res ? ', tabla de ' + x.res.total : '') + ')').join(' · '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => console.log('No se pudieron armar los eventos de Chess.com (' + (e && e.message || e) + '). Se publica igual con los de la vez pasada.'));
}
