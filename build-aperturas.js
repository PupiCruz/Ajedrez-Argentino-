/* ═══════════════════════════════════════════════════════════════════════
   build-aperturas.js  —  script de UNA sola vez (Node)

   Genera assets/aperturas.js = window.__APERTURAS__ = { "<epd>": "ECO\tNombre ES", … }
   a partir de la base lichess-org/chess-openings (CC0), indexada por EPD (posición,
   FEN sin relojes) para reconocer TRANSPOSICIONES.

   - Los EPD se generan con la MISMA chess.js que usa la app (assets/chess.min.js),
     así las claves coinciden exacto con los node.fen del visor en runtime.
   - Traducción al castellano en build (runtime = cero trabajo).
   - Los nombres curados a mano de _ECO_TABLE (index.html) pisan al dataset (override).

   Uso:  node build-aperturas.js
   (Necesita a.tsv..e.tsv en la misma carpeta, o los baja de GitHub si hay internet.)
═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = __dirname;
const Chess = require(path.join(ROOT, 'assets', 'chess.min.js')).Chess;

// ── EPD desde un PGN/lista de SAN (misma chess.js que el runtime) ──────────
function epdFromSans(sans) {
  const ch = new Chess();
  for (const s of sans) {
    if (!ch.move(s)) return null; // jugada inválida → descartar la línea
  }
  return ch.fen().split(' ').slice(0, 4).join(' ');
}
// Lista de EPD progresivos (uno por jugada) desde una lista de SAN.
function epdsFromSans(sans) {
  const ch = new Chess(), out = [];
  for (const s of sans) {
    if (!ch.move(s)) break;
    out.push(ch.fen().split(' ').slice(0, 4).join(' '));
  }
  return out;
}
function pgnToSans(pgn) {
  return pgn.replace(/\d+\.(\.\.)?/g, ' ')       // quitar "1." / "1..."
            .replace(/[+#!?]/g, '')               // quitar símbolos
            .trim().split(/\s+/).filter(Boolean);
}

// ── Traducción inglés → castellano ─────────────────────────────────────────
// Fases: (1) frases largas (familias y variantes comunes), (2) palabras sueltas.
// Lo que no matchea queda en inglés a propósito (nombres propios: Najdorf, Grünfeld…).
const PHRASES = [
  // familias principales (antes del ":")
  ['Sicilian Defense', 'Siciliana'],
  ['Ruy Lopez', 'Española'],
  ['French Defense', 'Francesa'],
  ['Caro-Kann Defense', 'Caro-Kann'],
  ["Queen's Gambit Declined Accepted", 'Gambito de Dama Rehusado'],
  ["Queen's Gambit Declined", 'Gambito de Dama Rehusado'],
  ["Queen's Gambit Accepted", 'Gambito de Dama Aceptado'],
  ["Queen's Gambit", 'Gambito de Dama'],
  ["Queen's Pawn Game", 'Peón de Dama'],
  ["Queen's Pawn", 'Peón de Dama'],
  ["Queen's Indian Defense", 'India de Dama'],
  ["Queen's Indian Accelerated", 'India de Dama Acelerada'],
  ['Italian Game', 'Italiana'],
  ['English Opening', 'Inglesa'],
  ['English Defense', 'Defensa Inglesa'],
  ['English Orangutan', 'Inglesa Orangután'],
  ["King's Gambit Accepted", 'Gambito de Rey Aceptado'],
  ["King's Gambit Declined", 'Gambito de Rey Rehusado'],
  ["King's Gambit", 'Gambito de Rey'],
  ["King's Indian Defense", 'India de Rey'],
  ["King's Indian Attack", 'Ataque Indio de Rey'],
  ["King's Pawn Game", 'Peón de Rey'],
  ["King's Pawn Opening", 'Peón de Rey'],
  ["King's Pawn", 'Peón de Rey'],
  ["King's Knight Opening", 'Caballo de Rey'],
  ['Nimzo-Indian Defense', 'Nimzo-India'],
  ['Neo-Grünfeld Defense', 'Neo-Grünfeld'],
  ['Grünfeld Defense', 'Grünfeld'],
  ['Semi-Slav Defense Accepted', 'Semi-Eslava Aceptada'],
  ['Semi-Slav Defense', 'Semi-Eslava'],
  ['Slav Defense', 'Eslava'],
  ['Slav Indian', 'Eslava-India'],
  ['Dutch Defense', 'Holandesa'],
  ['Benoni Defense', 'Benoni'],
  ['Benko Gambit Accepted', 'Gambito Benko Aceptado'],
  ['Benko Gambit Declined', 'Gambito Benko Rehusado'],
  ['Benko Gambit', 'Gambito Benko'],
  ['Alekhine Defense', 'Alekhine'],
  ['Scotch Game', 'Escocesa'],
  ['Indian Defense', 'India'],
  ["Petrov's Defense", 'Petrov'],
  ['Petrov Defense', 'Petrov'],
  ['Four Knights Game', 'Cuatro Caballos'],
  ['Three Knights Opening', 'Tres Caballos'],
  ['Zukertort Opening', 'Zukertort'],
  ['Zukertort Defense', 'Defensa Zukertort'],
  ['Scandinavian Defense', 'Escandinava'],
  ['Philidor Defense', 'Philidor'],
  ['Réti Opening', 'Reti'],
  ['Nimzowitsch Defense', 'Nimzowitsch'],
  ['Vienna Gambit', 'Gambito Vienés'],
  ['Vienna Game', 'Vienesa'],
  ["Bishop's Opening", 'Apertura de Alfil'],
  ['Modern Defense', 'Moderna'],
  ['Catalan Opening', 'Catalana'],
  ['Pirc Defense', 'Pirc'],
  ['Bird Opening', 'Bird'],
  ['Tarrasch Defense', 'Tarrasch'],
  ['Bogo-Indian Defense', 'Bogo-India'],
  ['Old Indian Defense', 'India Antigua'],
  ['East Indian Defense', 'India Oriental'],
  ['Center Game Accepted', 'Partida del Centro Aceptada'],
  ['Center Game', 'Partida del Centro'],
  ['Ponziani Opening', 'Ponziani'],
  ['London System', 'Sistema Londres'],
  ['Colle System', 'Sistema Colle'],
  ['Trompowsky Attack', 'Trompowsky'],
  ['Torre Attack', 'Torre'],
  ['Nimzo-Larsen Attack', 'Nimzo-Larsen'],
  ['Blackmar-Diemer Gambit Accepted', 'Gambito Blackmar-Diemer Aceptado'],
  ['Blackmar-Diemer Gambit Declined', 'Gambito Blackmar-Diemer Rehusado'],
  ['Blackmar-Diemer Gambit', 'Gambito Blackmar-Diemer'],
  ['Danish Gambit Accepted', 'Gambito Danés Aceptado'],
  ['Danish Gambit Declined', 'Gambito Danés Rehusado'],
  ['Danish Gambit', 'Gambito Danés'],
  ['Latvian Gambit Accepted', 'Gambito Letón Aceptado'],
  ['Latvian Gambit', 'Gambito Letón'],
  ['Englund Gambit Declined', 'Gambito Englund Rehusado'],
  ['Englund Gambit', 'Gambito Englund'],
  ['Elephant Gambit', 'Gambito Elefante'],
  ['Irish Gambit', 'Gambito Irlandés'],
  ['Duras Gambit', 'Gambito Duras'],
  ['Blumenfeld Countergambit Accepted', 'Contragambito Blumenfeld Aceptado'],
  ['Blumenfeld Countergambit', 'Contragambito Blumenfeld'],
  ['Richter-Veresov Attack', 'Richter-Veresov'],
  ['Van Geet Opening', 'Van Geet'],
  ["Van't Kruijs Opening", "Van't Kruijs"],
  ['Hungarian Opening', 'Húngara'],
  ['Polish Opening', 'Polaca'],
  ['Polish Defense', 'Defensa Polaca'],
  ['Grob Opening', 'Grob'],
  ['Owen Defense', 'Owen'],
  ['Pterodactyl Defense', 'Pterodáctilo'],
  ['Rat Defense', 'Rata'],
  ['Mikenas Defense', 'Mikenas'],
  ['Mieses Opening', 'Mieses'],
  ['Portuguese Opening', 'Portuguesa'],
  ['Rubinstein Opening', 'Rubinstein'],
  ['Amar Opening', 'Amar'],
  ['Amsterdam Attack', 'Ataque Ámsterdam'],
  ['Barnes Opening', 'Barnes'],
  ['Barnes Defense', 'Defensa Barnes'],
  ['Ware Opening', 'Ware'],
  ['Ware Defense', 'Defensa Ware'],
  ['Sodium Attack', 'Ataque Sodio'],
  ['Saragossa Opening', 'Zaragozana'],
  ['Clemenz Opening', 'Clemenz'],
  ['Canard Opening', 'Canard'],
  ['Kádas Opening', 'Kádas'],
  ['Global Opening', 'Apertura Global'],
  ['Anderssen Opening', 'Anderssen'],
  ["Anderssen's Opening", 'Anderssen'],
  ['Dresden Opening', 'Dresde'],
  ['Valencia Opening', 'Valenciana'],
  ['Basque Opening', 'Vasca'],
  ['Paleface Attack', 'Ataque Cara Pálida'],
  ['Bongcloud Attack', 'Ataque Bongcloud'],
  ['Amazon Attack', 'Ataque Amazona'],
  ['Hippopotamus Defense', 'Hipopótamo'],
  ['Horwitz Defense', 'Horwitz'],
  ['Robatsch Defense', 'Robatsch'],
  ['Czech Defense', 'Checa'],
  ['Lion Defense', 'León'],
  ['Kangaroo Defense', 'Canguro'],
  ['Mexican Defense', 'Mexicana'],
  ['Australian Defense', 'Australiana'],
  ['St. George Defense', 'San Jorge'],
  ['Carr Defense', 'Carr'],
  ['Wade Defense', 'Wade'],
  ['Borg Defense', 'Borg'],
  ['Gunderam Defense', 'Gunderam'],
  ['Goldsmith Defense', 'Goldsmith'],
  ['Montevideo Defense', 'Montevideo'],
  ['Lemming Defense', 'Lemming'],
  ['Vulture Defense', 'Buitre'],
  ['Zaire Defense', 'Zaire'],
  ['Yusupov-Rubinstein System', 'Sistema Yusupov-Rubinstein'],
  ['Marienbad System', 'Sistema Marienbad'],
  ['Rapport-Jobava System', 'Sistema Rapport-Jobava'],
  ['Creepy Crawly Formation', 'Formación Creepy Crawly'],
  ['Fried Fox Defense', 'Zorro Frito'],
  ['Döry Defense', 'Döry'],
  ['Pseudo Queen’s Indian Defense', 'Pseudo India de Dama'],
  // sub-variantes frecuentes (después del ":")
  ['King’s English Variation', 'Variante del Rey'],
  ["King's English Variation", 'Variante del Rey'],
  ["King's English", 'del Rey'],
  ["King's Indian", 'India de Rey'],
  ["Queen's Indian", 'India de Dama'],
  ["Queen's Knight", 'Caballo de Dama'],
  ["King's Knight", 'Caballo de Rey'],
  ["Queen's Bishop", 'Alfil de Dama'],
  ["King's Bishop", 'Alfil de Rey'],
  ['Hedgehog', 'Erizo'],
  ['Normal Variation', 'Variante Normal'],
  ['Main Line', 'Línea Principal'],
  ['Exchange Variation', 'Variante de Cambio'],
  ['Classical Variation', 'Variante Clásica'],
  ['Modern Variations', 'Variantes Modernas'],
  ['Modern Variation', 'Variante Moderna'],
  ['Advance Variation', 'Variante del Avance'],
  ['Fianchetto Variation', 'Variante del Fianchetto'],
  ['Two Knights Variation', 'Variante de los Dos Caballos'],
  ['Two Knights Defense', 'Defensa de los Dos Caballos'],
  ['Exchange', 'Cambio'],
  ['Countergambit', 'Contragambito'],
  ['Gambit Accepted', 'Gambito Aceptado'],
  ['Gambit Declined', 'Gambito Rehusado'],
  ['Poisoned Pawn', 'Peón Envenenado'],
  ['Pawn Storm', 'Avalancha de Peones'],
];
const WORDS = {
  'Defense': 'Defensa', 'Defence': 'Defensa',
  'Attack': 'Ataque', 'Variation': 'Variante', 'Opening': 'Apertura',
  'Gambit': 'Gambito', 'Accepted': 'Aceptado', 'Declined': 'Rehusado',
  'System': 'Sistema', 'Game': 'Partida', 'Line': 'Línea', 'Lines': 'Líneas',
  'Classical': 'Clásica', 'Modern': 'Moderna', 'Advance': 'Avance',
  'Knights': 'Caballos', 'Knight': 'Caballo', 'Bishop': 'Alfil',
  'Deferred': 'Diferida', 'Delayed': 'Retrasada', 'Accelerated': 'Acelerada',
  'Fianchetto': 'Fianchetto', 'Center': 'Centro', 'Countergambit': 'Contragambito',
  'with': 'con', 'and': 'y', 'without': 'sin', 'the': 'la',
  // idiomas / adjetivos que quedan sueltos a mitad de nombre en líneas raras
  'Sicilian': 'Siciliana', 'French': 'Francesa', 'Dutch': 'Holandesa',
  'Indian': 'India', 'English': 'Inglesa', 'Spanish': 'Española',
  'Italian': 'Italiana', 'Russian': 'Rusa', 'German': 'Alemana',
  'Polish': 'Polaca', 'Scandinavian': 'Escandinava', 'Slav': 'Eslava',
  'Reversed': 'Invertida', 'Formation': 'Formación', 'Defensive': 'Defensiva',
  'Invitation': 'Invitación', 'Anglo-Slav': 'Anglo-Eslava',
  'Anglo-Dutch': 'Anglo-Holandesa', 'Anglo-Lithuanian': 'Anglo-Lituana',
  'Double': 'Doble', 'Quiet': 'Tranquila', 'Wing': 'de Flanco',
  'Two': 'Dos', 'Three': 'Tres', 'Four': 'Cuatro', 'Five': 'Cinco',
  'Counterattack': 'Contraataque', 'Countergambit': 'Contragambito',
  'Symmetrical': 'Simétrica', 'Open': 'Abierta', 'Closed': 'Cerrada',
  'Orthodox': 'Ortodoxa', 'Scotch': 'Escocesa', 'Dragon': 'Dragón',
  'Yugoslav': 'Yugoslava', 'Austrian': 'Austríaco', 'Traditional': 'Tradicional',
  'Positional': 'Posicional', 'Retreat': 'Retirada', 'Old': 'Antigua',
  'Pawn': 'Peón', 'Pawns': 'Peones', 'Anti': 'Anti',
  'West': 'Occidental', 'East': 'Oriental', 'Kingside': 'flanco de rey', 'Queenside': 'flanco de dama',
};
function esc(re){ return re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const PHRASE_RE = PHRASES.map(([en, es]) => [new RegExp(esc(en), 'g'), es]);
const WORD_RE = Object.keys(WORDS).map(w => [new RegExp('\\b' + esc(w) + '\\b', 'g'), WORDS[w]]);
// Reordenar "<adjetivo> <sustantivo>" → "<sustantivo> <adjetivo>" SOLO para adjetivos conocidos
// (en inglés el adjetivo va antes; en español, después). Whitelist para no tocar nombres propios.
const HEAD = 'Variante|Variantes|Ataque|Sistema|Defensa|Gambito|Apertura|Línea|Contragambito|Contraataque';
const ADJ = 'Ortodoxa|Clásica|Clásico|Moderna|Modernas|Tradicional|Posicional|Cerrada|Abierta|Simétrica|' +
            'Acelerada|Diferida|Retrasada|Austríaco|Yugoslava|Principal|Normal|Antigua|Invertida|Tranquila|' +
            'Central|Doble|Sämisch|Envenenado';
const REORDER_RE = new RegExp('\\b(' + ADJ + ') (' + HEAD + ')\\b', 'g');
// Reordenar "<NombrePropio> <sustantivo>" → "<sustantivo> <NombrePropio>" SOLO cuando el nombre es
// la PRIMERA palabra del segmento (tras inicio, ": " o ", "): así "Berlin Defensa"→"Defensa Berlin"
// pero "Max Lange Ataque" (nombre de 2 palabras) NO se rompe (Lange no está al inicio del segmento).
const LEAD_RE = new RegExp("(^|: |, )([A-ZÁÉÍÓÚÑ][\\wáéíóúñ'-]*) (" + HEAD + ")\\b", 'g');
function translate(name) {
  let s = name;
  for (const [re, es] of PHRASE_RE) s = s.replace(re, es);
  for (const [re, es] of WORD_RE) s = s.replace(re, es);
  s = s.replace(REORDER_RE, (m, adj, head) => head + ' ' + adj);
  s = s.replace(LEAD_RE, (m, sep, word, head) => sep + head + ' ' + word);
  return s.replace(/\s+/g, ' ').trim();
}

// ── Cargar los TSV (bajarlos si no están) ──────────────────────────────────
function get(url) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode)); return; }
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}
async function loadTsv(letter) {
  const local = path.join(ROOT, letter + '.tsv');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  console.log('  bajando ' + letter + '.tsv de GitHub…');
  const txt = await get('https://raw.githubusercontent.com/lichess-org/chess-openings/master/' + letter + '.tsv');
  fs.writeFileSync(local, txt);
  return txt;
}

// ── Override: nombres curados a mano de _ECO_TABLE (index.html) ─────────────
function loadEcoOverride() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const start = html.indexOf('var _ECO_TABLE = (function(){');
  if (start < 0) { console.warn('  ⚠ no encontré _ECO_TABLE en index.html — sin override'); return {}; }
  const end = html.indexOf('})();', start);
  const src = html.slice(start, end + 5);
  let T;
  try { T = eval(src.replace('var _ECO_TABLE =', '')); }
  catch (e) { console.warn('  ⚠ no pude evaluar _ECO_TABLE:', e.message); return {}; }
  // La tabla vieja era una base de arranque (no curada a mano por el autor): tiene abreviaturas
  // (KID:/QID:/GDA:/GD:) y nombres a medio traducir (Austrian Attack, King's English, Aceptado
  // Bishop, English Attack). Esas se SALTEAN: la base nueva de lichess (completa y ya traducida)
  // nombra esas posiciones mejor. Solo se conservan como override los nombres viejos que son buenos.
  // Skip si la entrada vieja tiene abreviatura (KID:/…) o CUALQUIER palabra inglesa cruda. El \b
  // no toca el español ("Gambito"≠"Gambit", "Sistema"≠"System", "Defensa"≠"Defense"): solo cae el
  // inglés a medio traducir → esas posiciones las nombra la base nueva (ya traducida).
  const SKIP = /\b(KID|QID|GDA|GD):|\b(Defense|Attack|Variation|Gambit|Opening|System|Accepted|Declined|Orthodox|Dragon|Poisoned|Bishop|King's|Pawn|Pawns|English|Open|Closed|Line)\b/;
  const ov = {};
  let ok = 0, skipped = 0;
  for (const [sanStr, eco, name] of T) {
    if (SKIP.test(name)) { skipped++; continue; }
    const epd = epdFromSans(sanStr.trim().split(/\s+/));
    if (epd) { ov[epd] = eco + '\t' + name; ok++; }
  }
  console.log('  override _ECO_TABLE: ' + ok + '/' + T.length + ' conservadas (' + skipped + ' salteadas: abreviatura o inglés → las nombra la base)');
  return ov;
}

// ── Main ───────────────────────────────────────────────────────────────────
(async function main() {
  console.log('Generando índice de aperturas…');
  const map = {};
  let total = 0, bad = 0;
  for (const letter of ['a', 'b', 'c', 'd', 'e']) {
    const tsv = await loadTsv(letter);
    const lines = tsv.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('eco\t')) continue;
      const [eco, name, pgn] = line.split('\t');
      if (!pgn) continue;
      const epd = epdFromSans(pgnToSans(pgn));
      if (!epd) { bad++; continue; }
      map[epd] = eco + '\t' + translate(name);
      total++;
    }
  }
  console.log('  dataset lichess: ' + total + ' posiciones (' + bad + ' descartadas)');

  // Override con los nombres curados (pisan al dataset).
  const ov = loadEcoOverride();
  for (const epd in ov) map[epd] = ov[epd];

  const keys = Object.keys(map);
  // Escapar "<" por las dudas (regla de la casa: nada de </script> suelto).
  const json = JSON.stringify(map).replace(/</g, '\\u003c');
  const out =
    '/* Generado por build-aperturas.js — NO editar a mano.\n' +
    '   Base: lichess-org/chess-openings (CC0), traducida al castellano en build.\n' +
    '   Índice por EPD (FEN sin relojes) para reconocer transposiciones.\n' +
    '   Valor = "ECO\\tNombre". ' + keys.length + ' posiciones. */\n' +
    'window.__APERTURAS__ = ' + json + ';\n';
  const outPath = path.join(ROOT, 'assets', 'aperturas.js');
  fs.writeFileSync(outPath, out);
  const kb = Math.round(out.length / 1024);
  console.log('✔ ' + outPath.replace(ROOT + path.sep, '') + '  (' + keys.length + ' posiciones, ' + kb + ' KB)');

  // Muestra de control.
  console.log('\nMuestras:');
  const samples = [
    ['1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6', ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6']],
    ['Nimzo por 1.d4', ['d4','Nf6','c4','e6','Nc3','Bb4']],
    ['Nimzo transpuesta 1.c4', ['c4','Nf6','Nc3','e6','d4','Bb4']],
    ['1.e4 e5 2.Nf3 Nc6 3.Bb5', ['e4','e5','Nf3','Nc6','Bb5']],
    ['Francesa avance', ['e4','e6','d4','d5','e5']],
  ];
  for (const [label, sans] of samples) {
    const epds = epdsFromSans(sans);
    let best = null;
    for (const e of epds) if (map[e]) best = map[e];
    console.log('  ' + label + '  →  ' + (best ? best.replace('\t', ' · ') : '(sin nombre)'));
  }
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
