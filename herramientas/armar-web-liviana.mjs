// 🪶 LA PÁGINA LIVIANA (auditoría 22/10/2026, Fase 5): arma web.html, la copia de index.html que recibe la gente.
// Lo corre solo publicar-web.cmd. index.html sigue siendo EL archivo de verdad: es el que se edita, el que abre el
// modo autor y el que lee el banco de pruebas (que recorta funciones por nombre: por eso no se puede achicar el
// original). La función de la portada (functions/index.js) sirve web.html en "/" y, si no está, index.html.
//
// Uso:  node herramientas/armar-web-liviana.mjs          (desde la carpeta ajedrez-argentino)
//
// Qué le saca (nada cambia lo que hace la página):
//   · los comentarios del HTML, del CSS y del JavaScript (~1,3 MB) y la sangría de los renglones;
//   · los espacios de más del CSS y del JavaScript (con esbuild, el mismo que usa wrangler: SIN cambiar nombres ni
//     el orden de nada, sólo espacios y comentarios);
//   · la lista vieja de jugadores escrita en el archivo (PLAYERS, 158 KB): en la web siempre la reemplaza la del
//     manifest (__EMBEDDED_PLAYERS__) antes de usarla.
// Si algo sale mal (no está esbuild, un <script> no se puede leer), BORRA web.html: la web sigue con index.html entero,
// como antes, y nunca con una copia vieja.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// La huella del index.html del que salió (sin importar los finales de renglón): el banco avisa si quedó vieja.
export function huellaFuente(html) { return crypto.createHash('sha1').update(String(html).replace(/\r\n/g, '\n')).digest('hex').slice(0, 12); }

// esbuild viene con wrangler en vivo-worker (esta misma PC). Sin él no se arma la copia.
export function buscarEsbuild() {
  const lugares = [path.join(RAIZ, 'node_modules'), path.join(RAIZ, '..', 'vivo-worker', 'node_modules')];
  for (const l of lugares) {
    try { return createRequire(path.join(l, 'x.js'))('esbuild'); } catch (e) {}
  }
  return null;
}

// Saca la lista vieja de jugadores del <script> que la trae (sólo ese renglón de datos, hasta su "];").
export function sinPlayers(js) {
  const i = js.indexOf('var PLAYERS = [');
  if (i < 0) return js;
  const f = js.indexOf('\n];', i);
  if (f < 0) return js;
  return js.slice(0, i) + 'var PLAYERS = [];' + js.slice(f + 3);
}

export function armarLiviana(html, esbuild) {
  const src = String(html).replace(/\r\n/g, '\n');
  const fuente = huellaFuente(src);
  const re = /<!--[\s\S]*?-->|<(script|style|textarea|pre)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let out = '', k = 0, m, scripts = 0, estilos = 0;
  const texto = (t) => t.replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n');
  while ((m = re.exec(src))) {
    out += texto(src.slice(k, m.index));
    k = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;                       // comentario del HTML: afuera
    const tag = m[1].toLowerCase(), attrs = m[2], cuerpo = m[3];
    const abre = '<' + m[1] + attrs + '>', cierra = '</' + m[1] + '>';
    if (tag === 'script') {
      const ty = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
      if (/\bsrc\s*=/i.test(attrs) || !cuerpo.trim() || (ty && !/^(text\/javascript|application\/javascript|module)$/i.test(ty))) { out += m[0]; continue; }
      let js = esbuild.transformSync(sinPlayers(cuerpo), { loader: 'js', minifyWhitespace: true, legalComments: 'none', charset: 'utf8' }).code;
      js = js.replace(/<\/(script)/gi, '<\\/$1');                 // por si acaso: nunca un </script> adentro
      out += abre + js.replace(/\n$/, '') + cierra; scripts++;
    } else if (tag === 'style') {
      out += abre + esbuild.transformSync(cuerpo, { loader: 'css', minifyWhitespace: true, legalComments: 'none', charset: 'utf8' }).code.replace(/\n$/, '') + cierra; estilos++;
    } else {
      out += m[0];                                                // textarea / pre: tal cual (ahí los espacios se ven)
    }
  }
  out += texto(src.slice(k));
  // La marca de qué index.html la armó, justo después de <head>.
  out = out.replace(/<head([^>]*)>/i, (h) => h + '<meta name="aa-fuente" content="' + fuente + '">');
  return { html: out, fuente, scripts, estilos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = path.join(RAIZ, 'web.html');
  try {
    const esbuild = buscarEsbuild();
    if (!esbuild) throw new Error('no encontre esbuild (viene con vivo-worker)');
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    const r = armarLiviana(html, esbuild);
    const antes = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
    if (antes !== r.html) fs.writeFileSync(dest, r.html);
    console.log('Pagina liviana: ' + (Buffer.byteLength(html) / 1048576).toFixed(1) + ' MB -> ' + (Buffer.byteLength(r.html) / 1048576).toFixed(1)
      + ' MB (' + r.scripts + ' scripts, ' + r.estilos + ' estilos)' + (antes === r.html ? ', sin cambios.' : '.'));
  } catch (e) {
    try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (_) {}
    console.log('No se pudo armar la pagina liviana (' + (e && e.message || e) + '). Se publica igual: la gente recibe index.html entero, como antes.');
  }
}
