// 🏷️ Una VERSIÓN POR ARCHIVO (auditoría 22/10/2026, Fase 5): arma data/versiones.js, la listita que dice
// con qué número pedir cada archivo grande de data/. Lo corre solo publicar-web.cmd, al final de los pasos
// que arman datos (así ve los archivos tal como se van a publicar).
//
// Uso:  node herramientas/versiones-datos.mjs          (desde la carpeta ajedrez-argentino)
//
// Por qué: antes había UNA sola versión para todos los datos (__DATA_TS__, la hora del guardado). Cada
// publicación cambiaba la dirección de book.json (8,4 MB), puzzles.json, las partidas… y la gente los volvía
// a bajar enteros aunque no hubieran cambiado. Ahora el número de cada archivo sale de su CONTENIDO: si no
// cambió, la dirección es la misma y el navegador usa la copia que ya tiene.
//
// Qué NO entra (siguen con __DATA_TS__, ver _dataV en index.html):
//   data/t, data/p, data/cr → son miles de archivos chicos; la lista pesaría más que lo que ahorra.
//   live-*.json             → los cambia el teléfono (editar.html) sin pasar por este paso.
//   og.json, online*.json   → se piden sin versión (la función de la portada y la tarjeta En línea).
// Los pedazos de partidas (data/gi, data/ob) tampoco van uno por uno: su número viaja adentro de su propio
// índice (gi/indice.json, ob/indice.json), que sí está acá.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(RAIZ, 'data');

// Qué archivos llevan número propio. Rutas relativas a data/, con "/" (igual que las pide la web).
export function archivosVersionados(dir) {
  const out = [];
  const raiz = ['book.json', 'puzzles.json', 'practice.json', 'aperturas-stats.json', 'datos.json',
                'cumples-historicos.json', 'portada.json', 'cr-nombres.json', 'chesscom-eventos.json'];
  raiz.forEach((f) => { if (fs.existsSync(path.join(dir, f))) out.push(f); });
  fs.readdirSync(dir).filter((f) => /^games_\d+\.json$/.test(f)).forEach((f) => out.push(f));
  ['planes', 'lecciones'].forEach((sub) => {
    const d = path.join(dir, sub);
    if (fs.existsSync(d)) fs.readdirSync(d).filter((f) => f.endsWith('.json')).forEach((f) => out.push(sub + '/' + f));
  });
  ['gi/indice.json', 'ob/indice.json'].forEach((f) => { if (fs.existsSync(path.join(dir, f))) out.push(f); });
  return out.sort();
}

// El número de un archivo: 10 letras de su huella (sha1). Mismo contenido → mismo número.
export function huella(buf) { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10); }

export function armarVersiones(dir) {
  const v = {};
  archivosVersionados(dir).forEach((f) => { v[f] = huella(fs.readFileSync(path.join(dir, f))); });
  return v;
}

export function textoVersiones(v) {
  return '// Lo arma herramientas/versiones-datos.mjs al publicar: NO editar a mano.\n'
       + 'window.__DATA_VS__=' + JSON.stringify(v) + ';\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const v = armarVersiones(DATA);
    const txt = textoVersiones(v), dest = path.join(DATA, 'versiones.js');
    const antes = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
    if (antes !== txt) fs.writeFileSync(dest, txt);
    console.log('Versiones de los datos: ' + Object.keys(v).length + ' archivos' + (antes === txt ? ' (sin cambios).' : '.'));
  } catch (e) {
    console.log('No se pudieron armar las versiones de los datos (' + (e && e.message || e) + '). Se publica igual: la web usa la version general.');
  }
}
