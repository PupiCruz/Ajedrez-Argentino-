// Arma assets/chess.min.js = chess.js 1.4.0 + traductor a la API de la 0.10.3.
// Uso (desde la carpeta ajedrez-argentino):  node herramientas/chess-compat/armar.cjs
// Para comprimir usa el esbuild que trae vivo-worker (node_modules). Ver traductor.js.
const fs = require('fs'), path = require('path');
const aqui = __dirname;
let lib = fs.readFileSync(path.join(aqui, 'chess-1.4.0.js'), 'utf8');

// Las coronaciones en el mismo orden que la 0.10.3 (dama primero). Hay código que toma la
// primera jugada que coincide en origen y destino.
const viejo = 'const PROMOTIONS = [KNIGHT, BISHOP, ROOK, QUEEN];';
if (!lib.includes(viejo)) throw new Error('No encontré PROMOTIONS en chess-1.4.0.js');
lib = lib.replace(viejo, 'const PROMOTIONS = [QUEEN, ROOK, BISHOP, KNIGHT];');

const traductor = fs.readFileSync(path.join(aqui, 'traductor.js'), 'utf8');
const junto =
  'var Chess = (function () {\n' +
  'var __ChessNueva = (function () { var module = { exports: {} }, exports = module.exports;\n' +
  lib + '\nreturn module.exports; })();\n' +
  traductor + '\nreturn Chess;\n})();\n' +
  "if (typeof exports !== 'undefined') exports.Chess = Chess;\n";

const esbuild = require(path.join(aqui, '..', '..', '..', 'vivo-worker', 'node_modules', 'esbuild'));
const min = esbuild.transformSync(junto, { minify: true, target: 'es2020' }).code;
const cabecera =
  '/* chess.js 1.4.0 (c) Jeff Hlywa, BSD-2 — https://github.com/jhlywa/chess.js\n' +
  ' * + traductor a la API de chess.js 0.10.3 (herramientas/chess-compat). No editar a mano. */\n';
const destino = path.join(aqui, '..', '..', 'assets', 'chess.min.js');
fs.writeFileSync(destino, cabecera + min);
console.log('Listo:', destino, (fs.statSync(destino).size / 1024).toFixed(1) + ' KB');
