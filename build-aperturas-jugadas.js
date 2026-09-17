/* ═══════════════════════════════════════════════════════════════════════
   build-aperturas-jugadas.js  —  script de UNA sola vez (Node)

   Genera assets/aperturas-jugadas.json = { "<posición>": "d4 d5 Nc3 Nf6 Bf4", … }
   con las jugadas que llevan a cada posición de la base lichess-org/chess-openings (CC0).

   Para qué (16/09/2026): los arenas TEMÁTICOS de Lichess arrancan desde una posición y la
   API manda sólo el FEN, no las jugadas. Con esto la pantalla del torneo muestra "Se llega con
   1.d4 d5 2.Nc3 Nf6 3.Bf4" y "Analizar" abre la partida desde el principio (con libro y nombre
   de apertura), como la página de la apertura en lichess.org.

   - Va APARTE de assets/aperturas.js a propósito: sólo se baja cuando hay un temático.
   - Clave = piezas + turno + enroques (los 3 primeros campos del FEN). El al paso se deja afuera:
     Lichess y chess.js no siempre lo anotan igual.
   - Si varias líneas llegan a la misma posición, queda la MÁS CORTA.
   - Las jugadas se validan con la MISMA chess.js del sitio (assets/chess.min.js).

   Uso:  node build-aperturas-jugadas.js
   (Usa a.tsv..e.tsv de esta carpeta si están; si no, los baja de GitHub.)
═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = __dirname;
const Chess = require(path.join(ROOT, 'assets', 'chess.min.js')).Chess;

function get(url) {
  return new Promise((ok, mal) => {
    https.get(url, (r) => {
      if (r.statusCode !== 200) { mal(new Error('HTTP ' + r.statusCode + ' ' + url)); return; }
      let t = ''; r.setEncoding('utf8'); r.on('data', (c) => (t += c)); r.on('end', () => ok(t));
    }).on('error', mal);
  });
}
async function loadTsv(letter) {
  const local = path.join(ROOT, letter + '.tsv');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  console.log('  bajando ' + letter + '.tsv de GitHub…');
  return get('https://raw.githubusercontent.com/lichess-org/chess-openings/master/' + letter + '.tsv');
}
function pgnToSans(pgn) {
  return pgn.replace(/\d+\.(\.\.)?/g, ' ').replace(/[+#!?]/g, '').trim().split(/\s+/).filter(Boolean);
}

(async () => {
  const out = {};
  let filas = 0, malas = 0;
  for (const letter of ['a', 'b', 'c', 'd', 'e']) {
    const lines = (await loadTsv(letter)).split('\n');
    for (let i = 1; i < lines.length; i++) {
      const col = lines[i].split('\t');
      if (col.length < 3) continue;
      filas++;
      const sans = pgnToSans(col[2]);
      const ch = new Chess();
      let ok = true;
      for (const s of sans) { if (!ch.move(s)) { ok = false; break; } }
      if (!ok || !sans.length) { malas++; continue; }
      const key = ch.fen().split(' ').slice(0, 3).join(' ');
      const val = sans.join(' ');
      if (!out[key] || out[key].split(' ').length > sans.length) out[key] = val;
    }
  }
  const dest = path.join(ROOT, 'assets', 'aperturas-jugadas.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('Listo: ' + Object.keys(out).length + ' posiciones (' + filas + ' líneas, ' + malas + ' descartadas) → ' +
    path.relative(ROOT, dest) + ' · ' + Math.round(fs.statSync(dest).size / 1024) + ' KB');
  const jobava = out['rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/2N5/PPP1PPPP/R2QKBNR b KQkq'];
  console.log('Prueba (Rapport-Jobava): ' + jobava);
})().catch((e) => { console.error(e); process.exit(1); });
