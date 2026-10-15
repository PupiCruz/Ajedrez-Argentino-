// Ratings online (Chess.com y Lichess) para la tarjeta "En línea" de los perfiles.
//
//   node herramientas/online/actualizar.mjs
//
// Lee qué cuenta es de quién (`window.__ONLINE_CUENTAS__`, lo que se carga en el perfil en modo autor y
// viaja en data/embedded-data.js al apretar 💾 Guardar datos en mi carpeta), les pide los ratings a los
// dos sitios y escribe:
//   · data/online.json       → lo que lee la tarjeta: { ts, cc: { usuario: {...} }, li: { usuario: {...} } }
//   · data/online-hist.json  → una "foto" por mes de Chess.com (su API no da historial): { usuario: [{ d, b, u, r }] }
// Lo corre solo publicar-web.cmd antes de commitear. Si algo falla, avisa y deja los archivos como estaban.
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
    if (!c || (!c.cc && !c.li)) continue;
    out[p.id] = {};
    if (c.cc) out[p.id].cc = String(c.cc).toLowerCase();
    if (c.li) out[p.id].li = String(c.li).toLowerCase();
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

async function main() {
  const fuente = ['data/embedded-data.js', 'data/manifest.js'].map(f => path.join(RAIZ, f)).find(f => fs.existsSync(f));
  if (!fuente) { console.log('Ratings online: no encontré data/embedded-data.js. No toco nada.'); return; }
  const jsDatos = fs.readFileSync(fuente, 'utf8');
  const cuentas = leerCuentas(jsDatos);
  const ids = Object.keys(cuentas);
  if (!ids.length) { console.log('Ratings online: todavía no hay cuentas cargadas en los perfiles. Nada que bajar.'); return; }

  const usCC = [...new Set(ids.map(i => cuentas[i] && cuentas[i].cc).filter(Boolean).map(u => String(u).toLowerCase()))];
  const usLI = [...new Set(ids.map(i => cuentas[i] && cuentas[i].li).filter(Boolean).map(u => String(u).toLowerCase()))];
  console.log('Ratings online: ' + usCC.length + ' cuenta(s) de Chess.com y ' + usLI.length + ' de Lichess…');

  const avisos = [];
  const salida = { ts: Date.now(), cc: {}, li: {}, j: indicePorId(cuentas, jsDatos) };

  for (const u of usCC) {
    try {
      const p = await pedirCC('player/' + encodeURIComponent(u));
      if (p.noExiste) { avisos.push('Chess.com: la cuenta "' + u + '" no existe.'); continue; }
      await dormir(PAUSA_CC);
      const s = await pedirCC('player/' + encodeURIComponent(u) + '/stats');
      const d = normalizarCC(p.json, s.json);
      if (!d) avisos.push('Chess.com: "' + u + '" está CERRADA (' + p.json.status + '). No se muestra en la web.');
      else salida.cc[u] = d;
    } catch (e) { avisos.push('Chess.com: "' + u + '" falló (' + e.message + ').'); }
    await dormir(PAUSA_CC);
  }

  for (let i = 0; i < usLI.length; i += 300) {   // la API acepta hasta 300 por pedido
    const tanda = usLI.slice(i, i + 300);
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
        else salida.li[k] = d;
      }
      tanda.filter(k => !vistos.has(k)).forEach(k => avisos.push('Lichess: la cuenta "' + k + '" no existe.'));
    } catch (e) { avisos.push('Lichess: el pedido falló (' + e.message + ').'); }
  }

  // Si NO llegó nada de ninguno de los dos (sin internet, por ejemplo), no se pisa lo publicado.
  const nCC = Object.keys(salida.cc).length, nLI = Object.keys(salida.li).length;
  if (!nCC && !nLI) {
    console.log('Ratings online: no llegó ningún dato. Dejo data/online.json como estaba.');
    avisos.forEach(a => console.log('   ⚠️  ' + a));
    return;
  }
  // Una cuenta que hoy falló por la red conserva lo de la vez anterior (mejor eso que borrarle la tarjeta).
  const archOnline = path.join(RAIZ, 'data', 'online.json');
  try {
    const viejo = JSON.parse(fs.readFileSync(archOnline, 'utf8'));
    for (const sitio of ['cc', 'li']) {
      const lista = sitio === 'cc' ? usCC : usLI;
      for (const u of lista) {
        const fallo = avisos.some(a => a.indexOf('"' + u + '" falló') >= 0 || (sitio === 'li' && /^Lichess: el pedido falló/.test(a)));
        if (!salida[sitio][u] && fallo && viejo[sitio] && viejo[sitio][u]) salida[sitio][u] = viejo[sitio][u];
      }
    }
  } catch (e) {}
  fs.writeFileSync(archOnline, JSON.stringify(salida));

  const archHist = path.join(RAIZ, 'data', 'online-hist.json');
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(archHist, 'utf8')); } catch (e) {}
  const hoy = new Date(), mes = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  for (const u of Object.keys(salida.cc)) hist = fotoMensual(hist, u, salida.cc[u], mes);
  fs.writeFileSync(archHist, JSON.stringify(hist));

  console.log('Ratings online: listo (' + nCC + ' de Chess.com, ' + nLI + ' de Lichess).');
  avisos.forEach(a => console.log('   ⚠️  ' + a));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.log('Ratings online: se cortó (' + e.message + '). Dejo todo como estaba.'); });
}
