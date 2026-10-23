// 🧩 PARTIDAS POR PARTES (auditoría 22/10/2026, Fase 5, I34): corta la base de partidas publicada
// (data/games_0.json, games_1.json…, ~280.000 partidas, 78 MB) en pedazos chicos, para que la web baje sólo
// el que necesita. Antes, buscar una partida, el explorador «Jugada por jugada», «Partidas de esta apertura»
// y «la partida original» de un ejercicio bajaban la base ENTERA (13,5 MB comprimidos): en un teléfono de
// gama baja la pestaña se podía cerrar. Lo corre solo publicar-web.cmd (después de que el autor guardó).
//
// Uso:  node herramientas/armar-indices-partidas.mjs          (desde la carpeta ajedrez-argentino)
//
// Arma dos carpetas. Los games_N.json se siguen publicando igual: los usan la búsqueda que no trae ningún
// apellido (sólo año, ECO o un nombre de pila muy común), que todavía baja la base entera, y el modo autor.
//
//   data/gi/  BÚSQUEDA POR JUGADOR
//     indice.json   { v, n, sp, k: { clave: paquete }, p: [[renglones, número]], l: { letra: número } }
//     l-<letra>.json  los jugadores con alguna palabra del nombre que empieza con esa letra: [[nombre, partidas]]
//     p<i>.json       un PAQUETE de partidas. Cada jugador tiene una "clave" por cada palabra de su APELLIDO
//                     (lo de antes de la coma: "Perez Gonzalez, Juan" → perez y gonzalez; sin coma, todas las
//                     palabras), recortada a lo que haga falta para que ninguna clave junte más de CUB
//                     partidas ("g", "go", "gonzalez"…: sp = los comienzos que se partieron). Sus partidas van
//                     en el paquete de cada una de sus claves. Las claves se reparten en PAQUETES (400) por su
//                     huella: cada apellido cae siempre en el mismo, así una publicación sólo cambia los de los
//                     jugadores nuevos, y no son miles de archivos (Cloudflare acepta 20.000 en total).
//     Para buscar "Gonzalez Juan" la web baja l-g.json y l-j.json, mira qué palabra le hace bajar MENOS y baja
//     sólo esos paquetes: con un apellido, casi siempre uno o dos (≈100-500 KB). Después filtra como siempre.
//     Los renglones de acá NO traen las jugadas (la partida completa se baja al abrirla, como siempre).
//
//   data/ob/  EXPLORADOR DE APERTURAS (sólo las partidas que suman al árbol: sin na=1)
//     indice.json   { v, hoja, nodos: { línea: { n, nx, h } }, hojas: { línea: [k, número] } }
//                   La línea es "e4 c5 Nf3" ("" = la posición inicial). Un NODO es una línea con más de
//                   HOJA partidas: trae su total (n), las jugadas siguientes ya contadas (nx: [jugada,
//                   partidas, ganan blancas, tablas, ganan negras]) y el número (h) de n<k>.json, sus TOP
//                   mejores por Elo. Una HOJA es la primera línea con HOJA partidas o menos: h<k>.json
//                   trae TODAS sus partidas y la web cuenta ahí, como antes.
//
// Las partidas van como renglones cortos: [w, b, d, r, e, we, be, pl, ev, t, gi, na, m, n] (ev = número
// en la lista de eventos del archivo, n = puesto en la base entera, para mantener el orden de siempre).
// El número de cada archivo es su huella: si no cambió, la web usa la copia que ya tiene.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(RAIZ, 'data');

export const CUB = 4000;     // partidas por clave (salvo un apellido solo que tenga más) y por paquete de la búsqueda
export const PAQUETES = 400;  // paquetes de la búsqueda (cada apellido cae siempre en el mismo; NO cambiar sin motivo)
export const HOJA = 3000;    // partidas como mucho en una hoja del explorador (la más pesada ≈ 150 KB comprimida)
export const TOP = 100;      // mejores por Elo que se guardan de cada nodo del explorador

// ── Lo mismo que index.html (normStr / nameTokens / _gpApellido / _gpClave). El banco compara los dos lados. ──
export function normStr(s) {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function nameTokens(s) { return normStr(s).split(' ').filter((t) => t.length > 1); }
// Las palabras del apellido: lo de antes de la coma; sin coma, todas.
export function apellido(nombre) {
  const s = String(nombre || ''), i = s.indexOf(',');
  return nameTokens(i >= 0 ? s.slice(0, i) : s);
}
// La clave de una palabra del apellido: su comienzo, tan largo como se haya partido (sp).
export function clave(t, sp) {
  let k = t.slice(0, 1);
  while (sp.has(k) && t.length > k.length) k = t.slice(0, k.length + 1);
  return k;
}
export function clavesDe(nombre, sp) {
  const a = apellido(nombre);
  return a.length ? [...new Set(a.map((t) => clave(t, sp)))] : [''];
}
// Qué comienzos hay que partir para que ninguna clave junte más de `limite` partidas (salvo UN apellido solo).
export function partirApellidos(jug, limite) {
  const sp = new Set(), porLetra = new Map();
  jug.forEach((c, nm) => { apellido(nm).forEach((t) => { if (!porLetra.has(t[0])) porLetra.set(t[0], []); porLetra.get(t[0]).push([t, c]); }); });
  (function rec(grupos) {
    grupos.forEach((items, pre) => {
      const tot = items.reduce((s, x) => s + x[1], 0);
      if (tot <= limite || !items.some((x) => x[0].length > pre.length)) return;
      sp.add(pre);
      const hijos = new Map();
      items.forEach((x) => { if (x[0].length === pre.length) return; const k = x[0].slice(0, pre.length + 1); if (!hijos.has(k)) hijos.set(k, []); hijos.get(k).push(x); });
      rec(hijos);
    });
  })(porLetra);
  return sp;
}
const huella = (txt) => crypto.createHash('sha1').update(txt).digest('hex').slice(0, 10);
const avgElo = (g) => { const we = g.we || 0, be = g.be || 0; return (we && be) ? (we + be) / 2 : (we || be || 0); };

// Un archivo de partidas: { ev: [eventos], g: [renglones] }. sinJugadas: la búsqueda no las necesita.
export function archivoPartidas(lista, sinJugadas) {
  const ev = [], evi = new Map();
  const g = lista.map(({ g, n }) => {
    let e = evi.get(g.ev || ''); if (e == null) { e = ev.length; ev.push(g.ev || ''); evi.set(g.ev || '', e); }
    return [g.w || '', g.b || '', g.d || '', g.r || '', g.e || '', g.we || 0, g.be || 0, g.pl || 0, e,
            g.t != null ? String(g.t) : '', g.gi != null ? g.gi : null, g.na || 0, sinJugadas ? '' : (g.m || ''), n];
  });
  return JSON.stringify({ ev, g });
}

export function leerBase(dir) {
  const partes = fs.readdirSync(dir).map((f) => /^games_(\d+)\.json$/.exec(f)).filter(Boolean)
    .map((m) => +m[1]).sort((a, b) => a - b);
  let todas = [];
  partes.forEach((i) => { todas = todas.concat(JSON.parse(fs.readFileSync(path.join(dir, 'games_' + i + '.json'), 'utf8'))); });
  return todas.map((g, n) => ({ g, n }));
}

// Devuelve { 'gi/indice.json': texto, 'gi/p0.json': texto, … , 'ob/…': … }.
export function armarIndices(base, opc = {}) {
  const cub = opc.cub || CUB, hoja = opc.hoja || HOJA, top = opc.top || TOP;
  const out = {};
  // ── gi: claves por apellido, juntadas en paquetes + lista de jugadores por letra
  const jug = new Map();
  base.forEach((x) => { [x.g.w || '', x.g.b || ''].forEach((nm) => { if (nm) jug.set(nm, (jug.get(nm) || 0) + 1); }); });
  const sp = partirApellidos(jug, cub);
  const porClave = new Map(), memo = new Map();
  const cl = (nm) => { let r = memo.get(nm); if (!r) { r = clavesDe(nm, sp); memo.set(nm, r); } return r; };
  base.forEach((x) => {
    new Set(cl(x.g.w).concat(cl(x.g.b))).forEach((k) => { if (!porClave.has(k)) porClave.set(k, []); porClave.get(k).push(x.n); });
  });
  const iGi = { v: 2, n: base.length, sp: [...sp].sort(), k: {}, p: [], l: {} };
  // Cada clave va SIEMPRE al mismo paquete (por su huella), así una publicación con partidas nuevas cambia sólo los
  // paquetes de esos apellidos. (Antes se llenaban en fila: una partida nueva corría todos los de atrás y se volvían a
  // bajar los 230 archivos en cada publicación.)
  const nPaq = opc.paquetes || PAQUETES;   // fijo: si cambiara, se moverían todos los apellidos de paquete
  const paqs = Array.from({ length: nPaq }, () => new Set()), dePaq = {};
  [...porClave.keys()].sort().forEach((k) => {
    let x = 2166136261; for (let i = 0; i < k.length; i++) { x ^= k.charCodeAt(i); x = Math.imul(x, 16777619); }
    const p = (x >>> 0) % nPaq;
    porClave.get(k).forEach((n) => paqs[p].add(n));
    dePaq[k] = p;
  });
  iGi.p = paqs.map(() => null);   // p[i] = [partidas, número] del paquete i (null = vacío, no se escribe)
  paqs.forEach((s, p) => {
    if (!s.size) return;
    const ns = [...s].sort((a, b) => a - b), t = archivoPartidas(ns.map((n) => base[n]), true);
    out['gi/p' + p + '.json'] = t; iGi.p[p] = [ns.length, huella(t)];
  });
  Object.keys(dePaq).sort().forEach((k) => { iGi.k[k] = dePaq[k]; });
  const letras = {};
  [...jug.entries()].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1)).forEach(([nm, c]) => {
    new Set(nameTokens(nm).map((t) => t[0])).forEach((L) => { (letras[L] = letras[L] || []).push([nm, c]); });
  });
  Object.keys(letras).sort().forEach((L) => { const t = JSON.stringify(letras[L]); out['gi/l-' + L + '.json'] = t; iGi.l[L] = huella(t); });
  out['gi/indice.json'] = JSON.stringify(iGi);

  // ── ob: árbol de aperturas partido en hojas
  const iOb = { v: 1, hoja, nodos: {}, hojas: {} };
  let kN = 0, kH = 0;
  const conM = base.filter((x) => !x.g.na).map((x) => ({ x, m: (x.g.m || '').split(/\s+/).filter(Boolean) }));
  (function partir(items, linea, depth) {
    const lin = linea.join(' ');
    // Hoja: pocas partidas, o ninguna sigue más allá (la base guarda sólo las primeras jugadas de cada una).
    if (items.length <= hoja || depth >= 40 || !items.some((it) => it.m.length > depth)) {
      const t = archivoPartidas(items.map((it) => it.x));
      out['ob/h' + kH + '.json'] = t; iOb.hojas[lin] = [kH, huella(t)]; kH++;
      return;
    }
    // Jugadas siguientes contadas como _obCompute: en el orden en que aparecen y después por cantidad.
    const tally = new Map(), hijos = new Map();
    items.forEach((it) => {
      const nx = it.m[depth]; if (!nx) return;
      let t = tally.get(nx); if (!t) { t = [nx, 0, 0, 0, 0]; tally.set(nx, t); hijos.set(nx, []); }
      t[1]++; const r = it.x.g.r; if (r === '1-0') t[2]++; else if (r === '1/2-1/2') t[3]++; else if (r === '0-1') t[4]++;
      hijos.get(nx).push(it);
    });
    const nx = [...tally.values()].sort((a, b) => b[1] - a[1]);
    const mejores = items.map((it) => it.x).slice().sort((a, b) => avgElo(b.g) - avgElo(a.g)).slice(0, top);
    const t = archivoPartidas(mejores);
    out['ob/n' + kN + '.json'] = t; iOb.nodos[lin] = { n: items.length, nx, h: [kN, huella(t)] }; kN++;
    hijos.forEach((arr, san) => partir(arr, linea.concat(san), depth + 1));
  })(conM, [], 0);
  out['ob/indice.json'] = JSON.stringify(iOb);
  return out;
}

// Escribe sólo lo que cambió (así git no ve cambios de más) y borra los pedazos que sobran.
export function escribirIndices(dir, archivos) {
  let escritos = 0, borrados = 0;
  ['gi', 'ob'].forEach((sub) => { fs.mkdirSync(path.join(dir, sub), { recursive: true }); });
  Object.entries(archivos).forEach(([rel, txt]) => {
    const f = path.join(dir, rel);
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === txt) return;
    fs.writeFileSync(f, txt); escritos++;
  });
  ['gi', 'ob'].forEach((sub) => {
    fs.readdirSync(path.join(dir, sub)).forEach((f) => {
      if (!archivos[sub + '/' + f] && /\.json$/.test(f)) { fs.unlinkSync(path.join(dir, sub, f)); borrados++; }
    });
  });
  return { escritos, borrados };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const t0 = Date.now();
    const base = leerBase(DATA);
    if (!base.length) throw new Error('no hay data/games_*.json');
    const arch = armarIndices(base);
    const r = escribirIndices(DATA, arch);
    const mayor = Math.max(...Object.values(arch).map((t) => Buffer.byteLength(t)));
    console.log('Partidas por partes: ' + base.length + ' partidas en ' + Object.keys(arch).length + ' archivos ('
      + r.escritos + ' nuevos o cambiados, ' + r.borrados + ' borrados; el mas grande ' + (mayor / 1048576).toFixed(1)
      + ' MB) en ' + Math.round((Date.now() - t0) / 1000) + ' s.');
    if (mayor > 20 * 1048576) console.log('  OJO: un pedazo pasa de 20 MB (Cloudflare rechaza los de mas de 25 MiB).');
  } catch (e) {
    console.log('No se pudieron armar las partidas por partes (' + (e && e.message || e) + '). Se publica igual: la web baja la base entera, como antes.');
  }
}
