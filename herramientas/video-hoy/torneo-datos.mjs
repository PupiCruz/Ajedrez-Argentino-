// 🏆 Los datos para el VIDEO RESUMEN de un torneo, sacados de lo que ya publica la web (nada de motor ni de navegador):
//   data/manifest.js      → la ficha del torneo (nombre, sede, fechas, flyer, categorías), los jugadores y sus fotos
//   data/cr/<clave>.json  → el cuadro de cada categoría con la Radiografía HORNEADA (stats: podio, premios, batacazos…)
//   data/t/<id>.json      → los jugadones de las rondas (colgadas con bri: 1), los que barrió y aprobó el autor
//   data/fl, data/ph, assets/flags → flyer, fotos y banderas
//
// Uso suelto:  node torneo-datos.mjs <torneoId> [salida.json]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const DATA = path.join(RAIZ, 'data');

// La tabla federación → bandera es la misma de la web (_FED_ISO y _FED_HIST_FLAG del index.html, una línea cada una).
let _feds = null;
function banderas() {
  if (_feds) return _feds;
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const leer = (n) => { const m = new RegExp('^var ' + n + ' = (\\{.*\\});', 'm').exec(html); return m ? JSON.parse(m[1]) : {}; };
  _feds = Object.assign({}, leer('_FED_HIST_FLAG'), leer('_FED_ISO'));
  return _feds;
}
export function banderaDe(fed) {
  const iso = banderas()[String(fed || '').toUpperCase()];
  const f = iso && path.join(RAIZ, 'assets', 'flags', iso + '.svg');
  return f && fs.existsSync(f) ? f : null;
}

let _man = null;
function manifest() {
  if (_man) return _man;
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(DATA, 'manifest.js'), 'utf8'), ctx);
  _man = ctx.window;
  return _man;
}

// Nombres para emparejar con las fotos: sin tildes, en minúscula, palabras ordenadas ("Carrizo, Luciano Ariel" = "Luciano Ariel Carrizo").
const palabras = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((x) => x.length > 1);
let _fotos = null;
function indiceFotos() {
  if (_fotos) return _fotos;
  const W = manifest(), P = W.__EMBEDDED_PLAYERS__ || {}, fotos = W.__PHOTO_INDEX__ || {};
  _fotos = [];
  for (const j of [].concat(P.players || [], P.additionals || [])) {
    if (!j || j.id == null || !fotos[j.id]) continue;
    const f = path.join(DATA, 'ph', j.id + '.' + fotos[j.id]);
    if (fs.existsSync(f)) _fotos.push({ p: new Set(palabras(j.name)), f });
  }
  return _fotos;
}
// La foto de un jugador por su nombre: mismas palabras, o todas las del perfil dentro del nombre del torneo (y una sola así).
export function fotoDe(nombre) {
  const p = palabras(nombre);
  if (p.length < 2) return null;
  const set = new Set(p), L = indiceFotos();
  const igual = L.find((x) => x.p.size === set.size && [...x.p].every((w) => set.has(w)));
  if (igual) return igual.f;
  const dentro = L.filter((x) => x.p.size >= 2 && [...x.p].every((w) => set.has(w)));
  return dentro.length === 1 ? dentro[0].f : null;
}

const natural = (n) => { const s = String(n || '').trim(), i = s.indexOf(','); return i < 0 ? s : (s.slice(i + 1).trim() + ' ' + s.slice(0, i).trim()).trim(); };
const leerJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

// Una persona del podio o de un premio → lo que dibuja el video.
const persona = (x) => x && ({
  nombre: x.nombre || natural(x.raw), titulo: x.titulo || '', fed: x.fed || '', bandera: banderaDe(x.fed), foto: fotoDe(x.raw || x.nombre),
  puntos: x.puntos != null ? String(x.puntos) : x.match != null ? String(x.match) : '', pos: x.pos || x.puesto || null,   // equipos: puntos de match
});

// "+116 sobre su Elo" (en los torneos por equipos la Radiografía no trae sobreElo: se calcula).
const sobreSuElo = (x) => { const d = x.sobreElo != null ? x.sobreElo : (x.rp && x.elo ? x.rp - x.elo : null); return d == null ? '' : (d > 0 ? '+' : '') + d + ' sobre su Elo'; };

// Los premios de la Radiografía que entran en el video, en orden de interés (el video toma los primeros que haya).
function premiosDe(st) {
  const pr = st.premios || {}, out = [];
  const bat = (st.batacazos || [])[0];
  if (bat) out.push({ k: 'batacazo', icono: '💥', titulo: 'El batacazo', nombre: bat.ganador, foto: fotoDe(bat.ganadorRaw || bat.ganador),
    detalle: 'Le ganó a ' + (bat.perdedorTitulo ? bat.perdedorTitulo + ' ' : '') + bat.perdedor + ' (' + bat.perdedorElo + ')', dato: '+' + bat.diff + ' de Elo', sub: 'Ronda ' + bat.ronda });
  if (pr.mejorRp && pr.mejorRp.rp) out.push({ k: 'rp', icono: '📈', titulo: 'Mejor performance', nombre: pr.mejorRp.nombre, foto: fotoDe(pr.mejorRp.raw),
    detalle: 'Elo ' + pr.mejorRp.elo + ' → jugó como', dato: String(pr.mejorRp.rp), sub: sobreSuElo(pr.mejorRp) });
  if (pr.sobreElo && pr.sobreElo.rp && pr.sobreElo.sobreElo != null && (!pr.mejorRp || pr.sobreElo.raw !== pr.mejorRp.raw)) out.push({ k: 'sobre', icono: '🚀', titulo: 'Jugó por encima de su Elo', nombre: pr.sobreElo.nombre, foto: fotoDe(pr.sobreElo.raw),
    detalle: 'Elo ' + pr.sobreElo.elo + ' → performance ' + pr.sobreElo.rp, dato: '+' + pr.sobreElo.sobreElo, sub: 'sobre su Elo' });
  if (pr.revelacion) out.push({ k: 'revelacion', icono: '🌟', titulo: 'La revelación', nombre: pr.revelacion.nombre, foto: fotoDe(pr.revelacion.raw),
    detalle: 'Arrancó ' + pr.revelacion.desde + '.º en el ranking inicial', dato: pr.revelacion.hasta + '.º', sub: 'terminó' });
  if (pr.racha && pr.racha.n >= 4) out.push({ k: 'racha', icono: '🔥', titulo: 'La racha', nombre: pr.racha.nombre, foto: fotoDe(pr.racha.raw),
    detalle: 'victorias seguidas', dato: String(pr.racha.n), sub: '' });
  if (pr.sub20 && pr.sub20.pos) out.push({ k: 'sub20', icono: '🧒', titulo: 'Mejor sub-20', nombre: pr.sub20.nombre, foto: fotoDe(pr.sub20.raw),
    detalle: pr.sub20.edad ? pr.sub20.edad + ' años' : '', dato: pr.sub20.pos + '.º', sub: pr.sub20.puntos + ' puntos' });
  if (pr.femenina && pr.femenina.pos) out.push({ k: 'femenina', icono: '♛', titulo: 'Mejor femenina', nombre: pr.femenina.nombre, foto: fotoDe(pr.femenina.raw),
    detalle: '', dato: pr.femenina.pos + '.º', sub: pr.femenina.puntos + ' puntos' });
  if (pr.mas50 && pr.mas50.pos) out.push({ k: 'mas50', icono: '🎖️', titulo: 'Mejor +50', nombre: pr.mas50.nombre, foto: fotoDe(pr.mas50.raw),
    detalle: pr.mas50.edad ? pr.mas50.edad + ' años' : '', dato: pr.mas50.pos + '.º', sub: '' });
  return out;
}

// Las pantallas de la Radiografía: cada una es un ranking (top 3) o la de los destacados (un premio por renglón).
// Fila = { nombre, foto, icono?, etiqueta (arriba, en dorado), detalle (gris), dato (grande, a la derecha), sub }.
function pantallasDe(st, d) {
  const P = [], pr = st.premios || {}, ord = ['1.º', '2.º', '3.º'];
  const bat = (st.batacazos || []).slice().sort((a, b) => b.diff - a.diff).slice(0, 3);
  if (bat.length) P.push({ k: 'batacazos', titulo: bat.length > 1 ? 'Los batacazos' : 'El batacazo', filas: bat.map((b, i) => ({
    nombre: b.ganador, foto: fotoDe(b.ganadorRaw || b.ganador), etiqueta: bat.length > 1 ? ord[i] + ' · Ronda ' + b.ronda : 'Ronda ' + b.ronda,
    detalle: 'Le ganó a ' + (b.perdedorTitulo ? b.perdedorTitulo + ' ' : '') + b.perdedor + ' (' + b.perdedorElo + ')', dato: '+' + b.diff, sub: 'de Elo de diferencia' })) });
  const rp = (st.topRp || []).filter((x) => x.rp).slice(0, 3);
  if (rp.length) P.push({ k: 'performances', titulo: rp.length > 1 ? 'Las mejores performances' : 'La mejor performance', filas: rp.map((x, i) => ({
    nombre: x.nombre, foto: fotoDe(x.raw || x.nombre), etiqueta: ord[i] + (x.titulo ? ' · ' + x.titulo : ''),
    detalle: 'Elo ' + x.elo + ' → jugó como', dato: String(x.rp), sub: sobreSuElo(x) })) });
  const gan = (st.topGain || []).filter((x) => x.delta > 0).slice(0, 3);
  if (gan.length) P.push({ k: 'elo', titulo: gan.length > 1 ? 'Los que más Elo sumaron' : 'El que más Elo sumó', filas: gan.map((x, i) => ({
    nombre: x.nombre, foto: fotoDe(x.raw || x.nombre), etiqueta: ord[i] + (x.titulo ? ' · ' + x.titulo : ''), detalle: '', dato: '+' + x.delta, sub: 'puntos de Elo' })) });
  const ap = ((d && d.aperturas && d.aperturas.top) || []).filter((x) => x.cantidad > 0).slice(0, 3);
  if (ap.length >= 2) P.push({ k: 'aperturas', titulo: 'Las aperturas más jugadas', filas: ap.map((x, i) => ({
    nombre: x.nombre, icono: '♞', etiqueta: ord[i],
    detalle: (x.vars || []).slice(0, 2).map((v) => v.nombre).join(' · '), dato: Math.round(x.pct) + '%', sub: x.cantidad + ' partidas' })) });
  // Destacados: un premio por renglón (los que haya)
  const des = [];
  if (pr.revelacion) des.push({ nombre: pr.revelacion.nombre, foto: fotoDe(pr.revelacion.raw), etiqueta: 'La revelación', detalle: 'Arrancó ' + pr.revelacion.desde + '.º en el ranking inicial', dato: pr.revelacion.hasta + '.º', sub: 'terminó' });
  if (pr.racha && pr.racha.n >= 3) des.push({ nombre: pr.racha.nombre, foto: fotoDe(pr.racha.raw), etiqueta: 'La racha', detalle: 'victorias seguidas', dato: String(pr.racha.n), sub: 'al hilo' });
  if (pr.sub20 && pr.sub20.pos) des.push({ nombre: pr.sub20.nombre, foto: fotoDe(pr.sub20.raw), etiqueta: 'Mejor sub-20', detalle: pr.sub20.edad ? pr.sub20.edad + ' años' : '', dato: pr.sub20.pos + '.º', sub: pr.sub20.puntos ? pr.sub20.puntos + ' puntos' : '' });
  if (pr.femenina && pr.femenina.pos) des.push({ nombre: pr.femenina.nombre, foto: fotoDe(pr.femenina.raw), etiqueta: 'Mejor femenina', detalle: '', dato: pr.femenina.pos + '.º', sub: pr.femenina.puntos ? pr.femenina.puntos + ' puntos' : '' });
  if (pr.mas50 && pr.mas50.pos) des.push({ nombre: pr.mas50.nombre, foto: fotoDe(pr.mas50.raw), etiqueta: 'Mejor +50', detalle: pr.mas50.edad ? pr.mas50.edad + ' años' : '', dato: pr.mas50.pos + '.º', sub: '' });
  if (pr.mesa1 && pr.mesa1.n >= 3) des.push({ nombre: pr.mesa1.nombre, foto: fotoDe(pr.mesa1.raw), etiqueta: 'Dueño de la mesa 1', detalle: 'rondas jugando en la primera mesa', dato: String(pr.mesa1.n), sub: 'rondas' });
  if (des.length) P.push({ k: 'destacados', titulo: 'Otros destacados', filas: des.slice(0, 5) });
  return P;
}

// Cómo se definió, en una frase (sale debajo del campeón).
function definicionDe(st) {
  const d = st.definicion || {}, c = st.campeon || {};
  if (d.puntajePerfecto) return 'Puntaje perfecto';
  if (d.invicto && d.ventajaPuntos) return 'Invicto y con ' + d.ventajaPuntos + ' de ventaja';
  if (d.invicto) return 'Campeón invicto';
  if (d.ventajaPuntos) return 'Con ' + d.ventajaPuntos + ' de ventaja';
  if (d.desempate) return 'Se definió por desempate' + (d.coLideres > 2 ? ' entre ' + d.coLideres : '');
  return c.puntos ? c.puntos + ' puntos' : '';
}

// Los jugadones publicados del torneo (de todas las rondas), por categoría. El orden: el de más Elo primero.
function jugadonesDe(T) {
  const out = [];
  for (const rk of Object.keys((T && T.colgadas) || {})) {
    const cat = rk.split('|')[0];
    for (const it of T.colgadas[rk].items || []) {
      if (!it.bri || !it.fenAntes || !it.sol || !it.sol[0]) continue;
      const juegaBlancas = / w /.test(it.fen), quien = juegaBlancas ? it.w : it.b, rival = juegaBlancas ? it.b : it.w;
      out.push({ cat: cat === '' ? null : +cat, ronda: String(it.r || '').split('.')[0], mesa: String(it.r || '').split('.')[1] || '',
        fenAntes: it.fenAntes, jug: it.jug, jugSan: it.jugSan, fen: it.fen, sol: it.sol[0], solSan: (it.solSan || [])[0] || '',
        quien: natural(quien), rival: natural(rival), quienElo: +(juegaBlancas ? it.wElo : it.bElo) || 0, rivalElo: +(juegaBlancas ? it.bElo : it.wElo) || 0,
        blancas: juegaBlancas, foto: fotoDe(quien), res: it.res || '' });
    }
  }
  return out.sort((a, b) => Math.max(b.quienElo, b.rivalElo) - Math.max(a.quienElo, a.rivalElo));
}

export function datosTorneo(id, { maxJugadones = 3 } = {}) {
  const W = manifest();
  const t = (W.__MANIFEST__.tournaments || []).find((x) => x.id === id);
  if (!t) throw new Error('No encuentro el torneo ' + id + ' en data/manifest.js (¿está publicado?)');
  const cats = (t.categories || []).length >= 2 ? t.categories : [null];
  const T = leerJson(path.join(DATA, 't', id + '.json'));
  const jug = jugadonesDe(T);
  const flyerRel = t.flyerUrl && ((W.__FLYER_REDIRECT__ || {})[t.flyerUrl] || (/^data\//.test(t.flyerUrl) ? t.flyerUrl : null));
  const flyer = flyerRel && fs.existsSync(path.join(RAIZ, flyerRel)) ? path.join(RAIZ, flyerRel) : null;

  const categorias = [];
  cats.forEach((c, i) => {
    const d = leerJson(path.join(DATA, 'cr', 'cr2_tz_' + id + (c ? '_c' + i : '') + '.json'));
    const st = d && d.stats;
    if (!st || !st.podio || !st.podio.length) return;   // sin Radiografía horneada (torneo sin terminar o sin datos): se saltea
    categorias.push({
      nombre: c ? c.name : '', i: c ? i : null, equipos: !!st.esEquipos,
      podio: st.podio.slice(0, 3).map(persona),
      definicion: definicionDe(st),
      jugadores: (st.esEquipos ? (st.torneo || {}).equipos : (st.torneo || {}).jugadores) || 0, rondas: (st.torneo || {}).rondas || 0,
      premios: premiosDe(st),
      pantallas: pantallasDe(st, d),
      jugadones: jug.filter((j) => (c ? j.cat === i : true)).slice(0, maxJugadones),
    });
  });
  if (!categorias.length) throw new Error('El torneo no tiene la Radiografía horneada en ninguna categoría (¿está finalizado y publicado?)');

  const st0 = leerJson(path.join(DATA, 'cr', 'cr2_tz_' + id + (cats[0] ? '_c0' : '') + '.json'));
  const tor = (st0 && st0.stats && st0.stats.torneo) || {};
  return {
    id, nombre: t.name, sede: t.location || tor.sede || '', fechas: t.tournamentDates || tor.fechas || '', flyer,
    jugadores: categorias.reduce((n, c) => n + c.jugadores, 0), rondas: tor.rondas || 0, paises: tor.paises || 0,
    link: 'chessargentino.ar', url: 'https://chessargentino.ar/?torneo=' + encodeURIComponent(id),
    categorias,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , id, salida] = process.argv;
  if (!id) { console.log('Uso: node torneo-datos.mjs <torneoId> [salida.json]'); process.exit(1); }
  const D = datosTorneo(id);
  if (salida) fs.writeFileSync(salida, JSON.stringify(D, null, 1));
  console.log(D.nombre, '·', D.categorias.length, 'categoría(s) · flyer:', !!D.flyer);
  for (const c of D.categorias) console.log(' -', c.nombre || '(única)', '| podio:', c.podio.map((p) => p.nombre + (p.foto ? ' 📷' : '') + (p.bandera ? ' 🏳' : '')).join(' / '),
    '| premios:', c.premios.map((p) => p.k).join(','), '| jugadones:', c.jugadones.length, '|', c.definicion);
}
