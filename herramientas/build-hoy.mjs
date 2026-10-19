// Calendario "un día como hoy": barre data/games_N.json, se queda con las partidas de argentinos que
// tienen fecha COMPLETA (año.mes.día) y deja, para cada día del año, las mejores en data/hoy/MM.json.
// El bot (vivo-worker, comando /hoy) las muestra de a 10, de la más antigua a la más moderna.
//
// Uso:  node herramientas/build-hoy.mjs          (desde la carpeta ajedrez-argentino)
//
// Registro de cada partida (array, en este orden):
//   [fecha "AAAA.MM.DD", blancas, negras, resultado, evento, torneoId, indice, eloB, eloN, eco, jugadas, quienEsArg]
//   quienEsArg: 1 = blancas, 2 = negras, 3 = las dos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = (...p) => path.join(RAIZ, 'data', ...p);
const POR_DIA = 60;          // cuántas guarda por día
const MIN_PLIES = 30;        // sin partidas cortitas
const MIN_JUG_PERFIL = 10;   // un perfil con menos partidas no cuenta para saber el nombre del argentino

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const apellido = (s) => norm(String(s).split(',')[0]);

// 1) Quiénes son los argentinos: el nombre que más aparece en el archivo de cada perfil (data/p/<id>.json).
const argNombres = new Set();          // nombres completos normalizados
const porTorneo = new Map();           // torneoId → Set(apellidos de los perfiles dueños)
const manifestTxt = fs.readFileSync(D('manifest.js'), 'utf8');
const M = JSON.parse(manifestTxt.slice(manifestTxt.indexOf('window.__MANIFEST__=') + 20).split('\n')[0].replace(/;$/, ''));
const nombreDe = {};
for (const f of fs.readdirSync(D('p'))) {
  const pid = f.replace('.json', '');
  let A; try { A = JSON.parse(fs.readFileSync(D('p', f), 'utf8')); } catch (e) { continue; }
  if (!Array.isArray(A)) continue;
  const c = {}; let n = 0;
  for (const it of A) {
    const pg = it && it.pgn; if (typeof pg !== 'string') continue; n++;
    for (const m of pg.matchAll(/\[(?:White|Black) "([^"]*)"\]/g)) c[m[1]] = (c[m[1]] || 0) + 1;
  }
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  if (top && n >= MIN_JUG_PERFIL) { nombreDe[pid] = top[0]; argNombres.add(norm(top[0])); }
}
for (const [pid, ts] of Object.entries(M.playerIndex || {})) {
  if (!nombreDe[pid]) continue;
  const ap = apellido(nombreDe[pid]);
  for (const t of ts) { if (!porTorneo.has(String(t))) porTorneo.set(String(t), new Set()); porTorneo.get(String(t)).add(ap); }
}
console.log('Perfiles con nombre:', Object.keys(nombreDe).length, '· nombres de argentinos:', argNombres.size);

const esArg = (nom, t) => {
  const n = norm(nom);
  if (argNombres.has(n)) return true;
  const s = porTorneo.get(String(t));
  return !!(s && s.has(apellido(nom)));
};

// 2) Barrer las partidas.
const porDia = {};
let total = 0, conFecha = 0, deArg = 0, vistos = new Set();
const archivos = fs.readdirSync(D()).filter((f) => /^games_\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
for (const f of archivos) {
  for (const g of JSON.parse(fs.readFileSync(D(f), 'utf8'))) {
    total++;
    const m = String(g.d || '').match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (!m) continue;
    const mes = +m[2], dia = +m[3];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;
    if (mes === 1 && dia === 1) continue;        // el 1/1 es "no sé el día": 26.000 partidas sin día real
    conFecha++;
    const ba = esArg(g.w, g.t), na = esArg(g.b, g.t);
    if (!ba && !na) continue;
    if ((g.pl || 0) < MIN_PLIES) continue;
    if (g.r !== '1-0' && g.r !== '0-1' && g.r !== '1/2-1/2') continue;
    const clave = norm(g.w) + '|' + norm(g.b) + '|' + g.d + '|' + g.r + '|' + String(g.m || '').slice(0, 40);
    if (vistos.has(clave)) continue;
    vistos.add(clave); deArg++;
    const anio = +m[1];
    const elo = Math.max(g.we || 0, g.be || 0);
    let p = elo / 100;
    if (g.r !== '1/2-1/2') p += 4;
    if (ba && na) p += 3;
    if ((g.pl || 0) >= 50) p += 1;
    if (g.e) p += 1;
    p += Math.max(0, 2026 - anio) / 8;           // las viejas pesan más: dan sensación de historia
    const k = m[2] + '-' + m[3];
    (porDia[k] = porDia[k] || []).push({ g, p, arg: (ba ? 1 : 0) + (na ? 2 : 0) });
  }
}
console.log({ total, conFecha, deArg, dias: Object.keys(porDia).length });

// 3) Nombre del torneo (sólo de las elegidas).
const nombreTorneo = new Map();
for (const t of M.tournaments || []) nombreTorneo.set(String(t.id), t.name);
const torneoNombre = (t) => {
  t = String(t);
  if (nombreTorneo.has(t)) return nombreTorneo.get(t);
  try { const T = JSON.parse(fs.readFileSync(D('t', t + '.json'), 'utf8')); nombreTorneo.set(t, T.name || ''); }
  catch (e) { nombreTorneo.set(t, ''); }
  return nombreTorneo.get(t);
};
const limpiarEv = (ev, tn) => {
  ev = String(ev || '').trim();
  if (!ev || ev === '?' || /^round\s*\d+\s*:/i.test(ev) || /^ronda\s*\d+/i.test(ev)) ev = String(tn || '').trim();
  return ev.replace(/\s+/g, ' ').slice(0, 90);
};

// 4) Elegir las mejores por día y dejarlas de la más antigua a la más moderna.
fs.mkdirSync(D('hoy'), { recursive: true });
const meses = {};
let guardadas = 0, vacios = 0;
for (let mes = 1; mes <= 12; mes++) {
  const MM = String(mes).padStart(2, '0'); meses[MM] = {};
  for (let dia = 1; dia <= 31; dia++) {
    const k = MM + '-' + String(dia).padStart(2, '0');
    const L = porDia[k];
    if (!L) { if (!(mes === 2 && dia > 29) && !([4, 6, 9, 11].includes(mes) && dia > 30) && k !== '01-01') vacios++; continue; }
    const mejores = L.sort((a, b) => b.p - a.p).slice(0, POR_DIA)
      .sort((a, b) => a.g.d.localeCompare(b.g.d) || b.p - a.p);
    meses[MM][k] = mejores.map(({ g, arg }) => [g.d, g.w, g.b, g.r, limpiarEv(g.ev, torneoNombre(g.t)), String(g.t), g.gi, g.we || 0, g.be || 0, g.e || '', g.pl || 0, arg]);
    guardadas += mejores.length;
  }
  fs.writeFileSync(D('hoy', MM + '.json'), JSON.stringify(meses[MM]));
}
console.log('Guardadas:', guardadas, '· días sin ninguna:', vacios);
for (let mes = 1; mes <= 12; mes++) { const MM = String(mes).padStart(2, '0'); console.log(MM + '.json', fs.statSync(D('hoy', MM + '.json')).size, 'bytes'); }
