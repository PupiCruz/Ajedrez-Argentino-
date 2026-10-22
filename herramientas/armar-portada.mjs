// ☀️ Portada «Hoy» (PLAN-PORTADA-HOY, 21/10/2026): arma data/portada.json, el archivito CHICO que lee la
// portada. Así el visitante no tiene que bajar 1 MB de aperturas ni 250 KB de «un día como hoy» para
// ver una tarjeta. Lo corre solo publicar-web.cmd (después de que el autor guardó los datos).
//
// Uso:  node herramientas/armar-portada.mjs          (desde la carpeta ajedrez-argentino)
//
// Qué guarda:
//   ap    { "AAAA-MM-DD": apertura del día }  → la MISMA que Estudiar ese día: el cálculo se copia del
//                                               index.html (_apArbolPrep / _apDelDia), no se reescribe.
//   hoy   { "MM-DD": [partida, …] }           → las 3 primeras de data/hoy/MM.json (como el bot), próximos 40 días.
//   t     { idTorneo: { rd, s, eq, r, fin } } → horarios de ronda y los 3 primeros de la tabla de los
//                                               torneos con rondas entre hace 25 días y dentro de 21.
//   mom   [ jugadón, … ]                      → los ✨ jugadones aceptados de los últimos 10 días.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(RAIZ, ...p);
const DIA = 864e5;
const hoy0 = new Date(); hoy0.setHours(12, 0, 0, 0);
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const out = { v: 1, hecho: Date.now(), ap: {}, hoy: {}, t: {}, mom: [] };

// ── 1) Apertura del día: las funciones se sacan del index.html por nombre (como el banco de pruebas) ──
function extraerFuncion(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no está la función ' + nombre);
  let j = src.indexOf('{', i), n = 0;
  for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}' && --n === 0) break; }
  return src.slice(i, j + 1);
}
try {
  const html = fs.readFileSync(P('index.html'), 'utf8');
  const fns = ['_apPartes', '_apEtiqueta', '_apArbolPrep', '_apDelDia', '_apSt', '_apCount', '_apSlug', '_apPorSlug', '_apSlugDe', '_apNombreLargo']
    .map((n) => extraerFuncion(html, n)).join('\n');
  const arbol = JSON.parse(fs.readFileSync(P('assets', 'aperturas-arbol.json'), 'utf8'));
  const stats = JSON.parse(fs.readFileSync(P('data', 'aperturas-stats.json'), 'utf8'));
  // `Date` se reemplaza para que _apDelDia calcule la de CADA día de los próximos 30 (sin tocarle una coma).
  const fabrica = new Function('Date', 'arbol', 'stats', 'var _apA, _apS = stats;\n' + fns +
    '\n_apA = _apArbolPrep(arbol);\nreturn { delDia: _apDelDia, st: _apSt, slug: _apSlugDe, largo: _apNombreLargo, A: _apA };');
  for (let k = -1; k < 30; k++) {
    const dia = new Date(hoy0.getTime() + k * DIA);
    class FechaFija extends Date { constructor(...a) { if (a.length) super(...a); else super(dia.getTime()); } }
    const ap = fabrica(FechaFija, arbol, stats), n = ap.delDia();
    if (!n) continue;
    const r = ap.A.rows[n.main], s = ap.st(n) || [0, 0, 0, 0];
    out.ap[iso(dia)] = { id: n.id, nom: ap.largo(n), slug: ap.slug(n), eco: r ? r[0] : '', jug: r ? r[2] : '', fen: r ? r[3] : '', n: s[0], w: s[1], d: s[2], b: s[3] };
  }
  console.log('Apertura del día: ' + Object.keys(out.ap).length + ' días (hoy: ' + ((out.ap[iso(hoy0)] || {}).nom || '—') + ')');
} catch (e) { console.log('⚠️  Apertura del día: no se pudo (' + e.message + ').'); }

// ── 2) Un día como hoy: de data/hoy/MM.json, las 3 primeras de cada uno de los próximos 40 días ──
// Registro: [fecha, blancas, negras, resultado, evento, torneoId, indice, eloB, eloN, eco, jugadas, quienEsArg]
const meses = {};
for (let k = -1; k < 40; k++) {
  const d = new Date(hoy0.getTime() + k * DIA), mm = String(d.getMonth() + 1).padStart(2, '0'), md = mm + '-' + String(d.getDate()).padStart(2, '0');
  if (!(mm in meses)) { try { meses[mm] = JSON.parse(fs.readFileSync(P('data', 'hoy', mm + '.json'), 'utf8')); } catch (e) { meses[mm] = null; } }
  const lista = (meses[mm] && meses[mm][md]) || [];
  // Las 3 PRIMERAS de la lista, en el mismo orden que las muestra el bot (/hoy): si el autor no eligió con el
  // botón ☀️ del bot, la portada muestra éstas (pedido del autor 21/10). Las elegidas las pide la web al bot.
  const elegidas = lista.slice(0, 3);
  if (elegidas.length) out.hoy[md] = elegidas;
}
console.log('Un día como hoy: ' + Object.keys(out.hoy).length + ' días');

// ── 3) Torneos: horarios de ronda y punteros (de data/cr/<clave>.json) ──
const manTxt = fs.readFileSync(P('data', 'manifest.js'), 'utf8');
const crIdx = JSON.parse((manTxt.match(/window\.__CR_INDEX__=(\[.*?\]);/) || [, '[]'])[1]);
const desde = iso(new Date(hoy0.getTime() - 25 * DIA)), hasta = iso(new Date(hoy0.getTime() + 21 * DIA));
const porTorneo = {};
for (const k of crIdx) {
  const m = String(k).match(/^cr2_[a-z]+_(.+?)(_c(\d+))?$/);
  if (!m) continue;
  (porTorneo[m[1]] = porTorneo[m[1]] || []).push({ k, cat: m[3] == null ? -1 : +m[3] });
}
const top = (arr, f) => (arr || []).slice(0, 3).map(f);
for (const suf in porTorneo) {
  const claves = porTorneo[suf].sort((a, b) => a.cat - b.cat);   // la del torneo primero, después _c0, _c1…
  let info = null;
  for (const c of claves) {
    let j; try { j = JSON.parse(fs.readFileSync(P('data', 'cr', c.k + '.json'), 'utf8')); } catch (e) { continue; }
    const rd = j.roundDates || {}, fechas = Object.values(rd).map((x) => String(x).slice(0, 10));
    if (!fechas.some((f) => f >= desde && f <= hasta)) continue;
    const it = { rd };
    if (j.standings && j.standings.length) it.s = top(j.standings, (p) => [p.name || '', p.title || '', p.fed || '', p.pts != null ? p.pts : '']);
    const te = j.teamStandings && j.teamStandings.teams;
    if (te && te.length && j.teamStandings.kind !== 'initial') it.eq = top(te, (q) => [q.name || '', q.fed || '', q.mp != null ? q.mp : (q.pts != null ? q.pts : '')]);
    if (j.standingsRound != null) it.r = j.standingsRound;
    if (j.standingsFinal) it.fin = 1;
    if (c.cat >= 0) it.cat = c.cat;
    info = it; break;
  }
  // Los 3 primeros de CADA categoría (Resultados prioriza la que ganó un argentino).
  if (info && claves.some((c) => c.cat >= 0)) {
    const cats = [];
    for (const c of claves) {
      if (c.cat < 0) continue;
      let j; try { j = JSON.parse(fs.readFileSync(P('data', 'cr', c.k + '.json'), 'utf8')); } catch (e) { continue; }
      if (j.standings && j.standings.length) cats.push({ c: c.cat, s: top(j.standings, (q) => [q.name || '', q.title || '', q.fed || '', q.pts != null ? q.pts : '']) });
    }
    if (cats.length > 1) info.cats = cats;
  }
  if (info) out.t[suf] = info;
}
console.log('Torneos con rondas cerca de hoy: ' + Object.keys(out.t).length);

// ── 4) Lo mejor de la semana: los ✨ jugadones aceptados (Momentos destacados) de los últimos 8 días, ENTEROS
// (con la solución y las alternativas): la portada los abre todos juntos en el tablero de jugadones de siempre.
// Cada uno lleva de qué torneo es (_tid, _tn) para el título y para "Ver la partida".
const desdeMom = iso(new Date(hoy0.getTime() - 8 * DIA)).replace(/-/g, '.');
for (const f of fs.readdirSync(P('data', 't'))) {
  if (!f.endsWith('.json')) continue;
  const txt = fs.readFileSync(P('data', 't', f), 'utf8');
  if (txt.indexOf('"bri"') < 0) continue;
  let j; try { j = JSON.parse(txt); } catch (e) { continue; }
  for (const rk in (j.colgadas || {})) {
    for (const it of (j.colgadas[rk].items || [])) {
      if (!it.bri || !it.fen || !it.sol || String(it.fecha || '') < desdeMom) continue;
      out.mom.push(Object.assign({}, it, { _tid: j.id, _tn: j.name || '' }));
    }
  }
}
// Los más nuevos primero; el mismo día, los de argentinos, los "claros" y los de más Elo.
const eloMax = (x) => Math.max(+x.wElo || 0, +x.bElo || 0);
out.mom.sort((a, b) => (String(b.fecha) > String(a.fecha) ? 1 : String(b.fecha) < String(a.fecha) ? -1 : 0) || ((b.arg || 0) - (a.arg || 0)) || ((b.clara ? 1 : 0) - (a.clara ? 1 : 0)) || (eloMax(b) - eloMax(a)));
out.mom = out.mom.slice(0, 40);
console.log('Jugadones de la semana: ' + out.mom.length);

fs.writeFileSync(P('data', 'portada.json'), JSON.stringify(out));
console.log('✓ data/portada.json (' + Math.round(fs.statSync(P('data', 'portada.json')).size / 1024) + ' KB)');
