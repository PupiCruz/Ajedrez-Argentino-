// Ratings online (Chess.com y Lichess) para la tarjeta "En línea" de los perfiles.
//
//   node herramientas/online/actualizar.mjs
//
// Lee qué cuenta es de quién (`window.__ONLINE_CUENTAS__`, lo que se carga en el perfil en modo autor y
// viaja en data/embedded-data.js al apretar 💾 Guardar datos en mi carpeta), les pide los ratings a los
// dos sitios y escribe:
//   · data/online.json       → lo que lee la tarjeta: { ts, cc: { usuario: {...} }, li: { usuario: {...} } }
//   · data/online-hist.json  → una "foto" por mes de Chess.com (su API no da historial): { usuario: [{ d, b, u, r }] }
// Lo corre solo publicar-web.cmd antes de commitear: la bajada completa, UNA vez por día; en las otras publicaciones
// del día sólo pide las cuentas nuevas (con --todo, todo). Si algo falla, avisa y deja los archivos como estaban.
//
// Cuidados (plan PLAN-RATINGS-ONLINE.md): a Chess.com DE A UNO con una pausa (en paralelo devuelve 429), con
// un User-Agent que diga quiénes somos; a Lichess en UN solo pedido para todos. Las cuentas cerradas o
// suspendidas NO se publican (se avisan acá). No se guarda "visto por última vez": hay menores en el ranking.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UA = 'ChessArgentino (https://chessargentino.ar; ratings de los perfiles)';
const PAUSA_CC = 350;

// ── Lo que se puede probar sin internet (lo usa test-web.mjs) ─────────────────────────────

// Saca `window.__ONLINE_CUENTAS__={...};` de un archivo de datos (embedded-data.js / manifest.js).
export function leerCuentas(js) {
  const m = /window\.__ONLINE_CUENTAS__=(\{.*?\});\s*$/m.exec(String(js || ''));
  if (!m) return {};
  try { const o = JSON.parse(m[1]); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}

// Qué cuentas tiene cada jugador, por su NÚMERO en la web (el mismo de ?jugador= y de data/og.json): lo usa el
// bot de Discord (vivo-worker) para el /jugador y los avisos de los torneos titulados de Chess.com. Las cuentas
// están por fide_id; el número sale del ranking guardado en el mismo archivo (window.__EMBEDDED_PLAYERS__).
export function indicePorId(cuentas, js) {
  const m = /^window\.__EMBEDDED_PLAYERS__=(.*);\s*$/m.exec(String(js || ''));
  let ov = null; try { ov = m ? JSON.parse(m[1]) : null; } catch (e) {}
  const pl = ov ? (ov.players || []).concat(ov.additionals || []) : [];
  const out = {};
  for (const p of pl) {
    const c = p && p.fide_id && cuentas[String(p.fide_id)];
    if (!c || (!c.cc && !c.li && !(c.mias || []).length)) continue;
    out[p.id] = {};
    if (c.cc) out[p.id].cc = String(c.cc).toLowerCase();
    if (c.li) out[p.id].li = String(c.li).toLowerCase();
    if (c.clases) out[p.id].clases = 1;   // 🎓 tildado por el autor: el bot dice "Podés consultarle por clases"
    // ✏️ Las redes que cargó el autor a mano (16/10): el bot las muestra igual que la web.
    const mias = (c.mias || []).filter(r => r && r.red && /^https:\/\//.test(r.url || ''));
    if (mias.length) out[p.id].mias = mias.map(r => ({ red: r.red, url: r.url }));
  }
  return out;
}

// Una modalidad de Chess.com → { r, max } (sin partidas, o sin ninguna en el último año, null: un rating de una
// sola partida de hace años no dice nada).
const VIGENCIA = 365 * 864e5;
function _modCC(s, ahora) {
  if (!s || !s.last || !s.last.rating) return null;
  if (s.last.date && ahora - s.last.date * 1000 > VIGENCIA) return null;
  const o = { r: s.last.rating };
  if (s.best && s.best.rating > s.last.rating) o.max = s.best.rating;
  return o;
}
// player/{u} + player/{u}/stats → lo que se publica. null = no publicar (cerrada / suspendida).
export function normalizarCC(perfil, stats, ahora = Date.now()) {
  if (!perfil || /^closed/.test(perfil.status || '')) return null;
  const st = stats || {};
  const o = {};
  if (perfil.title) o.title = perfil.title;
  const b = _modCC(st.chess_blitz, ahora), u = _modCC(st.chess_bullet, ahora), r = _modCC(st.chess_rapid, ahora);
  if (b) o.blitz = b;
  if (u) o.bullet = u;
  if (r) o.rapid = r;
  return o;
}
// Una modalidad de Lichess → { r, prov } (sin partidas, null). "prov" = provisorio (Lichess le pone "?").
function _modLI(p) {
  if (!p || !p.games || !p.rating) return null;
  const o = { r: p.rating };
  if (p.prov) o.prov = 1;
  return o;
}
// Un usuario de POST /api/users → lo que se publica. null = no publicar (cerrada / suspendida).
export function normalizarLI(u) {
  if (!u || u.disabled || u.tosViolation || u.closed) return null;
  const pf = u.perfs || {};
  const o = {};
  if (u.title && u.title !== 'BOT') o.title = u.title;
  const b = _modLI(pf.blitz), bu = _modLI(pf.bullet), r = _modLI(pf.rapid);
  if (b) o.blitz = b;
  if (bu) o.bullet = bu;
  if (r) o.rapid = r;
  return o;
}

// 🔗 Las redes que comparte el jugador (lo mismo que _onlRedes / _onlRedesCC del index.html; el banco compara).
// Sólo se publican de los jugadores con el tilde "Mostrar sus redes" del autor (cuentas[fide].redes = 1).
const REDES = { 'youtube.com': 'YouTube', 'twitch.tv': 'Twitch', 'kick.com': 'Kick', 'instagram.com': 'Instagram', 'x.com': 'X', 'twitter.com': 'X', 'tiktok.com': 'TikTok', 'facebook.com': 'Facebook' };
const REDES_NO = /^(p|reel|reels|stories|status|i|home|explore|intent|share|sharer|hashtag|search|watch|shorts|playlist|results|videos|groups|events|photo|photos|story\.php|permalink\.php|login|signup|directory|tv|live)$/i;
export function extraerRedes(textos) {
  const out = [], vistos = {};
  const re = /(?:^|[\s(\[<"'|,;:])(?:https?:\/\/)?(?:www\.|m\.|mobile\.)?(youtube\.com|twitch\.tv|kick\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|facebook\.com)\/([^\s<>"'\)\]|,;]+)/gi;
  const txt = ' ' + (textos || []).filter(Boolean).join('\n');
  let m;
  while ((m = re.exec(txt)) && out.length < 6) {
    const dom = m[1].toLowerCase(), segs = m[2].split(/[\/?#]/);
    let h = segs[0];
    if (dom === 'youtube.com' && /^(c|channel|user)$/i.test(h) && segs[1]) h = h + '/' + segs[1];
    else if (dom === 'youtube.com' && h.charAt(0) !== '@') continue;
    if (!h || REDES_NO.test(h) || !/^@?[A-Za-z0-9._-]{2,60}(\/[A-Za-z0-9._-]{2,60})?$/.test(h)) continue;
    const url = 'https://' + (dom === 'twitter.com' ? 'x.com' : dom) + '/' + h.replace(/\.+$/, '');
    if (vistos[url.toLowerCase()]) continue;
    vistos[url.toLowerCase()] = 1;
    out.push({ red: REDES[dom], url });
  }
  return out;
}
export function redesCC(perfil) {
  const tipos = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };
  return ((perfil && perfil.streaming_platforms) || []).filter(x => x && tipos[x.type] && /^https:\/\//.test(x.channel_url || ''))
    .slice(0, 3).map(x => ({ red: tipos[x.type], url: x.channel_url }));
}

// 🎓 ¿Tiene perfil de ENTRENADOR? (16/10, pedido del autor) Ninguna de las dos APIs lo dice: Lichess contesta 200 en
// lichess.org/coach/{usuario} si lo tiene (404 si no), y la página del perfil de Chess.com trae "isCoach: true" (y la
// insignia "badges-coach"). Las listas por país no sirven: la de Lichess le contesta 403 a un script y la de Chess.com,
// sin iniciar sesión, muestra sólo la primera página. → true / false / null (no se pudo saber).
export function esCoachCC(html) {
  const t = String(html || '');
  if (/isCoach:\s*true/.test(t) || /"class":"badges-coach"/.test(t)) return true;
  if (/isCoach:\s*false/.test(t)) return false;
  return null;
}
// Qué cuentas revisar hoy: las que nunca se revisaron o hace más de COACH_DIAS, de a COACH_TOPE por sitio (así la
// primera vez se reparte en varios días y no alarga cada publicación). cache = { usuario: { t, c } }.
export const COACH_DIAS = 14, COACH_TOPE = 20;
export function coachPendientes(cache, usuarios, ahora, tope = COACH_TOPE) {
  const c = cache || {};
  return usuarios.filter(u => !c[u] || !(ahora - c[u].t < COACH_DIAS * 864e5))
    .sort((a, b) => ((c[a] && c[a].t) || 0) - ((c[b] && c[b].t) || 0)).slice(0, tope);
}

// La foto del mes de Chess.com: pisa la del mes en curso, agrega la del mes nuevo. `mes` = "2026-10".
export function fotoMensual(hist, usuario, datos, mes) {
  const h = (hist && typeof hist === 'object') ? hist : {};
  if (!datos) return h;
  const foto = { d: mes };
  if (datos.blitz) foto.b = datos.blitz.r;
  if (datos.bullet) foto.u = datos.bullet.r;
  if (datos.rapid) foto.r = datos.rapid.r;
  if (Object.keys(foto).length === 1) return h;   // sin ninguna modalidad: nada que guardar
  const lista = Array.isArray(h[usuario]) ? h[usuario].filter(x => x && x.d !== mes) : [];
  lista.push(foto);
  lista.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  h[usuario] = lista;
  return h;
}

// ── Lo que sale a internet ──────────────────────────────────────────────────────────────────

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function pedirCC(ruta) {
  for (let intento = 0; intento < 2; intento++) {
    const r = await fetch('https://api.chess.com/pub/' + ruta, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (r.status === 404 || r.status === 410) return { noExiste: true };
    if (r.status === 429) { await dormir(5000); continue; }   // UNA espera y un reintento, nunca en loop
    if (!r.ok) throw new Error('Chess.com respondió ' + r.status + ' en ' + ruta);
    return { json: await r.json() };
  }
  throw new Error('Chess.com sigue frenando los pedidos (429)');
}

// ¿Qué hay que pedir? Una bajada COMPLETA por día (hora argentina); en las otras publicaciones del día, sólo las
// cuentas nuevas (las que no están en el online.json de antes). Pedido del autor (15/10): bajar todo tardaba ~2
// minutos en cada publicar-web.cmd, y nadie mira la variación de rating online varias veces por día.
// --todo en la línea de comandos fuerza la completa. → { completo, cc: [usuarios], li: [usuarios] }
const diaAR = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
export function quePedir(viejo, usCC, usLI, ahora, forzar) {
  const completo = !!forzar || !viejo || !viejo.ts || diaAR(viejo.ts) !== diaAR(ahora);
  if (completo) return { completo, cc: usCC.slice(), li: usLI.slice() };
  return { completo, cc: usCC.filter(u => !(viejo.cc || {})[u]), li: usLI.filter(u => !(viejo.li || {})[u]) };
}

const UA_WEB = { 'User-Agent': UA, 'Accept': 'text/html' };
async function coachLI(u) {
  const r = await fetch('https://lichess.org/coach/' + encodeURIComponent(u), { headers: UA_WEB });
  if (r.status === 404) return false;
  if (r.ok) return true;
  return null;
}
async function coachCC(u) {
  const r = await fetch('https://www.chess.com/member/' + encodeURIComponent(u), { headers: UA_WEB });
  if (!r.ok) return null;
  return esCoachCC(await r.text());
}
// Revisa los pendientes de un sitio (de a uno, con pausa) y anota en la cache. → cuántos revisó.
async function revisarCoaches(cache, usuarios, pedir, pausa) {
  let n = 0;
  for (const u of coachPendientes(cache, usuarios, Date.now())) {
    try { const c = await pedir(u); if (c !== null) { cache[u] = { t: Date.now(), c: c ? 1 : 0 }; n++; } } catch (e) {}
    await dormir(pausa);
  }
  return n;
}

async function main() {
  const fuente = ['data/embedded-data.js', 'data/manifest.js'].map(f => path.join(RAIZ, f)).find(f => fs.existsSync(f));
  if (!fuente) { console.log('Ratings online: no encontré data/embedded-data.js. No toco nada.'); return; }
  const jsDatos = fs.readFileSync(fuente, 'utf8');
  const cuentas = leerCuentas(jsDatos);
  const ids = Object.keys(cuentas);
  if (!ids.length) { console.log('Ratings online: todavía no hay cuentas cargadas en los perfiles. Nada que bajar.'); return; }

  const usCC = [...new Set(ids.map(i => cuentas[i] && cuentas[i].cc).filter(Boolean).map(u => String(u).toLowerCase()))];
  const usLI = [...new Set(ids.map(i => cuentas[i] && cuentas[i].li).filter(Boolean).map(u => String(u).toLowerCase()))];
  // Los de "Mostrar sus redes": sus redes se publican; las del resto no (y si el autor sacó el tilde, se borran).
  const conRedes = { cc: new Set(), li: new Set() };
  for (const i of ids) for (const s of ['cc', 'li']) if (cuentas[i] && cuentas[i].redes && cuentas[i][s]) conRedes[s].add(String(cuentas[i][s]).toLowerCase());
  const archOnline = path.join(RAIZ, 'data', 'online.json');
  let viejo = null;
  try { viejo = JSON.parse(fs.readFileSync(archOnline, 'utf8')); } catch (e) {}
  const plan = quePedir(viejo, usCC, usLI, Date.now(), process.argv.includes('--todo'));
  // Un tilde nuevo de redes en una cuenta que ya estaba: se pide aunque ya se haya bajado hoy.
  if (!plan.completo && viejo) for (const s of ['cc', 'li']) for (const u of conRedes[s]) if (viejo[s] && viejo[s][u] && !viejo[s][u].redes && !plan[s].includes(u)) plan[s].push(u);

  // Lo de antes que sigue valiendo: las cuentas que siguen cargadas (las que el autor sacó, se van).
  const salida = { ts: plan.completo ? Date.now() : viejo.ts, cc: {}, li: {}, j: indicePorId(cuentas, jsDatos) };
  if (!plan.completo) {
    for (const s of ['cc', 'li']) for (const u of (s === 'cc' ? usCC : usLI)) if (viejo[s] && viejo[s][u]) {
      salida[s][u] = Object.assign({}, viejo[s][u]);
      if (!conRedes[s].has(u)) delete salida[s][u].redes;   // le sacaron el tilde
    }
  }
  // 🎓 Entrenadores: en la bajada del día (de a 20 por sitio) y las cuentas nuevas (no en cada publicación). Los dos
  // sitios a la vez y MIENTRAS se bajan los ratings (son otras páginas: no alarga la publicación).
  const archCoach = path.join(RAIZ, 'herramientas', 'online', 'entrenadores.json');
  let coach = { cc: {}, li: {} };
  try { const x = JSON.parse(fs.readFileSync(archCoach, 'utf8')); if (x && x.cc && x.li) coach = x; } catch (e) {}
  const marcarCoach = () => { for (const st of ['cc', 'li']) for (const u in salida[st]) { if (coach[st][u] && coach[st][u].c) salida[st][u].coach = 1; else delete salida[st][u].coach; } };
  const coachListo = (plan.completo || plan.cc.length || plan.li.length)
    ? Promise.all([revisarCoaches(coach.cc, plan.completo ? usCC : plan.cc, coachCC, 600), revisarCoaches(coach.li, plan.completo ? usLI : plan.li, coachLI, 1000)])
      .then(([a, b]) => { if (a || b) { fs.writeFileSync(archCoach, JSON.stringify(coach)); console.log('Ratings online: perfiles de entrenador revisados: ' + a + ' de Chess.com y ' + b + ' de Lichess.'); } })
      .catch(() => {})
    : Promise.resolve();

  if (!plan.completo && !plan.cc.length && !plan.li.length) {
    marcarCoach();
    const hora = new Date(viejo.ts - 3 * 3600e3).toISOString().slice(11, 16);
    const nuevo = JSON.stringify(salida);
    if (nuevo !== JSON.stringify(viejo)) fs.writeFileSync(archOnline, nuevo);   // por si sacaste alguna cuenta
    console.log('Ratings online: ya se bajaron hoy a las ' + hora + ' y no hay cuentas nuevas. No pido nada (para forzar: --todo).');
    return;
  }
  console.log('Ratings online: ' + (plan.completo ? 'la bajada del día, ' : 'sólo lo nuevo (cuentas o tildes de redes), ') + plan.cc.length + ' de Chess.com y ' + plan.li.length + ' de Lichess…');

  const avisos = [];
  let nCC = 0, nLI = 0;
  for (const u of plan.cc) {
    try {
      const p = await pedirCC('player/' + encodeURIComponent(u));
      if (p.noExiste) { avisos.push('Chess.com: la cuenta "' + u + '" no existe.'); continue; }
      await dormir(PAUSA_CC);
      const s = await pedirCC('player/' + encodeURIComponent(u) + '/stats');
      const d = normalizarCC(p.json, s.json);
      if (!d) avisos.push('Chess.com: "' + u + '" está CERRADA (' + p.json.status + '). No se muestra en la web.');
      else { if (conRedes.cc.has(u)) d.redes = redesCC(p.json); salida.cc[u] = d; nCC++; }
    } catch (e) { avisos.push('Chess.com: "' + u + '" falló (' + e.message + ').'); }
    await dormir(PAUSA_CC);
  }

  for (let i = 0; i < plan.li.length; i += 300) {   // la API acepta hasta 300 por pedido
    const tanda = plan.li.slice(i, i + 300);
    try {
      const r = await fetch('https://lichess.org/api/users', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'User-Agent': UA }, body: tanda.join(',') });
      if (!r.ok) throw new Error('respondió ' + r.status);
      const lista = await r.json();
      const vistos = new Set();
      for (const x of lista) {
        const k = String(x.id || x.username || '').toLowerCase();
        vistos.add(k);
        const d = normalizarLI(x);
        if (!d) avisos.push('Lichess: "' + k + '" está cerrada o suspendida. No se muestra en la web.');
        else { if (conRedes.li.has(k)) d.redes = extraerRedes([(x.profile || {}).bio, (x.profile || {}).links]); salida.li[k] = d; nLI++; }
      }
      tanda.filter(k => !vistos.has(k)).forEach(k => avisos.push('Lichess: la cuenta "' + k + '" no existe.'));
    } catch (e) { avisos.push('Lichess: el pedido falló (' + e.message + ').'); }
  }

  // En la bajada del día, si NO llegó nada de ninguno de los dos (sin internet, por ejemplo), no se pisa lo publicado.
  await coachListo;
  if (plan.completo && !nCC && !nLI) {
    console.log('Ratings online: no llegó ningún dato. Dejo data/online.json como estaba (se reintenta en la próxima publicación).');
    avisos.forEach(a => console.log('   ⚠️  ' + a));
    return;
  }
  // Una cuenta que hoy falló por la red conserva lo de la vez anterior (mejor eso que borrarle la tarjeta).
  if (viejo) {
    for (const sitio of ['cc', 'li']) {
      for (const u of plan[sitio]) {
        const fallo = avisos.some(a => a.indexOf('"' + u + '" falló') >= 0 || (sitio === 'li' && /^Lichess: el pedido falló/.test(a)));
        if (!salida[sitio][u] && fallo && viejo[sitio] && viejo[sitio][u]) salida[sitio][u] = viejo[sitio][u];
      }
    }
  }
  marcarCoach();
  fs.writeFileSync(archOnline, JSON.stringify(salida));

  const archHist = path.join(RAIZ, 'data', 'online-hist.json');
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(archHist, 'utf8')); } catch (e) {}
  const hoy = new Date(), mes = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  for (const u of plan.cc) if (salida.cc[u]) hist = fotoMensual(hist, u, salida.cc[u], mes);
  fs.writeFileSync(archHist, JSON.stringify(hist));

  console.log('Ratings online: listo (' + nCC + ' de Chess.com, ' + nLI + ' de Lichess).');
  avisos.forEach(a => console.log('   ⚠️  ' + a));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.log('Ratings online: se cortó (' + e.message + '). Dejo todo como estaba.'); });
}
