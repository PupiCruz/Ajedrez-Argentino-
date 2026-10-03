/* ═══════════════════════════════════════════════════════════════════════
   build-aperturas-arbol.js  —  script de UNA sola vez (Node)

   Genera assets/aperturas-arbol.json: la lista de aperturas CON SUS JUGADAS, para la
   portada del explorador (Partidas → 🌳 Aperturas): tarjetas por familia y el árbol
   Familia → Variante → Subvariante.

   Formato: { "v": 1, "a": [ [eco, nombre, jugadas, piezas, dueño], … ] }
     - nombre  = el MISMO de assets/aperturas.js (traducido y con los overrides de la
                 casa), buscado por la posición final de la línea.
     - jugadas = SAN separadas por espacio, sin números ni "+"/"#" (igual que el índice
                 de partidas, así se comparan directo con g.m).
     - piezas  = 1er campo del FEN (para dibujar el tablerito de la tarjeta).
     - dueño   = 0 si la apertura es de las blancas, 1 si es de las negras (para "los argentinos
                 que más la juegan").
   Ordenado por largo de la línea (la más corta primero).

   Las líneas salen de lichess-org/chess-openings (CC0). Se bajan a la carpeta temporal.
   Uso:  node build-aperturas-arbol.js
═══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = __dirname;
const Chess = require(path.join(ROOT, 'assets', 'chess.min.js')).Chess;

// La traducción es la de build-aperturas.js (se toma su función `translate` sin correr su main).
// NO se usan los nombres de assets/aperturas.js: ahí los overrides de _ECO_TABLE ("Siciliana:
// Najdorf 6.Bc4") mezclan otro estilo y rompen la jerarquía Familia: Variante, Sub.
function loadTranslate() {
  const src = fs.readFileSync(path.join(ROOT, 'build-aperturas.js'), 'utf8');
  const ctx = { require, __dirname: ROOT, console };
  vm.createContext(ctx);
  vm.runInContext(src.slice(0, src.indexOf('// ── Main')) + ';this.translate = translate;', ctx);
  return ctx.translate;
}

// Repaso de la traducción palabra por palabra, por tramo (lo que va entre ":" y ","):
// orden ("Cuatro Caballos Variante" → "Variante Cuatro Caballos", "Invertida Siciliana" →
// "Siciliana Invertida") y género ("Ataque Inglesa" → "Ataque Inglés").
const MASC = 'Ataque|Sistema|Gambito|Contragambito|Peón|Contraataque|Avance|Cambio|Esquema|Final|Fianchetto|Orden|Centro|Medio';
const ADJ = {
  Cerrada: 'Cerrado', Tranquila: 'Tranquilo', 'Clásica': 'Clásico', Ortodoxa: 'Ortodoxo', Moderna: 'Moderno',
  Polaca: 'Polaco', Holandesa: 'Holandés', Inglesa: 'Inglés', Acelerada: 'Acelerado', Diferida: 'Diferido',
  'Española': 'Español', Francesa: 'Francés', Escandinava: 'Escandinavo', Mexicana: 'Mexicano', Rusa: 'Ruso',
  'Húngara': 'Húngaro', 'Simétrica': 'Simétrico', Abierta: 'Abierto', Retrasada: 'Retrasado', Italiana: 'Italiano',
  Siciliana: 'Siciliano', Escocesa: 'Escocés', Vienesa: 'Vienés', Alemana: 'Alemán', Danesa: 'Danés',
  Noruega: 'Noruego', Sueca: 'Sueco', Belga: 'Belga', Americana: 'Americano', Africana: 'Africano',
  Australiana: 'Australiano', Canadiense: 'Canadiense', Checa: 'Checo', Eslava: 'Eslavo', India: 'Indio',
  Agresiva: 'Agresivo', Lenta: 'Lento', 'Rápida': 'Rápido', Doble: 'Doble', Falsa: 'Falso', Nueva: 'Nuevo',
  Antigua: 'Antiguo', Larga: 'Largo', Corta: 'Corto', Defensiva: 'Defensivo', Invertida: 'Invertido'
};
const MASC_ADJ = new RegExp('\\b(' + MASC + ')((?: [A-ZÁÉÍÓÚÑ][\\wáéíóúñü-]*)*?) (' + Object.keys(ADJ).join('|') + ')\\b', 'g');
const FIN = /^(.+?) (Variante|Defensa|Gambito|Sistema|Ataque|Contraataque|Contragambito|Formación|Línea|Apertura)$/;
// Lo que la traducción dejó en inglés (barrido del 03/10/2026; el autor marcó "Anti-Qxd4 Move Order" y
// "Fully Aceptado", y pasó cómo se dicen: "Orden de Jugadas Anti-Dxd4", "Totalmente Aceptado").
// Se aplica sobre el nombre YA traducido, antes del repaso de orden y género.
const POST = [
  [/\bAnti-Qxd4 Move Order\b/g, 'Orden de Jugadas Anti-Dxd4'],
  [/\bAcelerada Move Order\b/g, 'Orden de Jugadas Acelerado'],
  [/\bflanco de rey Move Order\b/g, 'Orden de Jugadas por el Flanco de Rey'],
  [/\bMove Order\b/g, 'Orden de Jugadas'],
  [/\bFully Aceptado\b/g, 'Totalmente Aceptado'], [/\bHalf-Aceptado\b/g, 'Semiaceptado'],
  [/\bHyperaccelerated Dragón\b/g, 'Dragón Hiperacelerado'], [/\bHyperaccelerated Pterodactyl\b/g, 'Pterodáctilo Hiperacelerado'],
  [/\bFool's Mate\b/g, 'Mate del Loco'], [/\bNoah's Ark Trap\b/g, 'Trampa del Arca de Noé'], [/\bBeginner's Trap\b/g, 'Trampa del Principiante'],
  [/\bBrigg's Trap\b/g, 'Trampa Brigg'], [/\bMeadow Hay Trap\b/g, 'Trampa Meadow Hay'],
  [/\bLion's Cave\b/g, 'Cueva del León'], [/\bLion's Claw\b/g, 'Garra del León'], [/\bLion's Jaw\b/g, 'Mandíbula del León'],
  [/\bKing's Head Apertura\b/g, 'Apertura Cabeza de Rey'], [/\bKing David's Apertura\b/g, 'Apertura del Rey David'],
  [/\bChristiansen's Dream\b/g, 'Sueño de Christiansen'], [/\bPeresypkin's Sacrifice\b/g, 'Sacrificio Peresypkin'],
  [/\bSantasiere's Folly\b/g, 'Locura de Santasiere'], [/\bKitchener Folly\b/g, 'Locura Kitchener'],
  [/\bCaballo's Tour\b/g, 'Paseo del Caballo'], [/\bGambito Caballo de Rey's\b/g, 'Gambito del Caballo de Rey'],
  [/\bGambito Alfil's\b/g, 'Gambito de Alfil'], [/\bGambito Blackmar's Second\b/g, 'Segundo Gambito Blackmar'],
  [/\bSimagin's Improved\b/g, 'Simagin Mejorada'], [/\bSimagin's Lesser\b/g, 'Simagin Menor'],
  [/\bAtaque Fried Liver\b/g, 'Ataque del Hígado Frito'], [/\bAnti-Fried Liver\b/g, 'Anti-Hígado Frito'],
  [/\bRetrasada Castling Línea\b/g, 'Línea del Enroque Retrasado'], [/\bLínea Castling\b/g, 'Línea del Enroque'],
  [/\bLínea Forcing\b/g, 'Línea Forzada'], [/\bRooks Swap Línea\b/g, 'Línea del Cambio de Torres'],
  [/\bExtended Alfil Swap\b/g, 'Cambio de Alfil Extendido'], [/\bInverted Hanham\b/g, 'Hanham Invertida'],
  [/\bKing March Línea\b/g, 'Línea de la Marcha del Rey'], [/\bKing Walk\b/g, 'Paseo del Rey'], [/\bKing Pterodactyl\b/g, 'Pterodáctilo de Rey'],
  [/\bCentral Storming\b/g, 'Asalto Central'], [/\bCentro Holding\b/g, 'Sostén del Centro'], [/\bBig Clamp\b/g, 'Gran Tenaza'],
  [/\bBouncing Alfil\b/g, 'Alfil Saltarín'], [/\bEarly Deviations\b/g, 'Desvíos Tempranos'], [/\bEarly b3\b/g, 'b3 Temprano'],
  [/\bDefensa Compromised\b/g, 'Defensa Comprometida'], [/\bDefensa Improved Steinitz\b/g, 'Defensa Steinitz Mejorada'],
  [/\bCorrespondence Refutation\b/g, 'Refutación por Correspondencia'], [/\bPeón Push\b/g, 'Avance de Peón'], [/(^|[:,] *)Push$/g, '$1Avance'],
  [/(^|[:,] *)([^:,]+?) Trap\b/g, '$1Trampa $2'],
  // "Sicilian Invitation" = Invitación Siciliana (la invitación va delante; la cazó el autor el 03/10/2026).
  [/\bEscocesa Invitación Rehusado\b/g, 'Invitación Escocesa Rehusada'], [/\bGambito de Dama Invitación\b/g, 'Invitación al Gambito de Dama'],
  [/(^|[:,] *)([^:,]+?) Invitación\b/g, '$1Invitación $2'],
  [/\bThe Potato\b/g, 'La Papa'], [/\bLong Whip\b/g, 'Látigo Largo'], [/\bFishing Pole\b/g, 'Caña de Pescar'],
  [/\bAged Gibbon\b/g, 'Gibón Viejo'], [/\bHorsefly\b/g, 'Tábano'], [/\bBlack Mustang\b/g, 'Mustang Negro'], [/\bDoble Duck\b/g, 'Doble Pato'],
  [/\bChigorin Plan\b/g, 'Plan Chigorin'], [/\bWayward Queen\b/g, 'Dama Errante'], [/\bGambito Hungarian\b/g, 'Gambito Húngaro'],
  [/\bVienna Hybrid\b/g, 'Híbrido Vienés'], [/\bPhilidor: Lion\b/g, 'Philidor: León'], [/\bDefensa Norwegian\b/g, 'Defensa Noruega'],
  [/\bDefensa Pin\b/g, 'Defensa de la Clavada'], [/\bAtaque Siberian\b/g, 'Ataque Siberiano'], [/, Swiss\b/g, ', Suiza'],
  [/\bFull Symmetry Línea\b/g, 'Línea de Simetría Total'], [/\bGreat Snake\b/g, 'Gran Serpiente'], [/\bBig Centro\b/g, 'Gran Centro'],
  [/\bSmall Centro\b/g, 'Centro Pequeño'], [/: Hawk\b/g, ': Halcón'], [/\bActon Extension\b/g, 'Extensión Acton'],
  [/\bAtaque Hippopotamus\b/g, 'Ataque Hipopótamo'], [/\bCentral Break\b/g, 'Ruptura Central'], [/\bMad Dog\b/g, 'Perro Loco'],
  [/\bGambito Wild Muzio\b/g, 'Gambito Muzio Salvaje'], [/, Slow$/g, ', Lenta'], [/\bFirst Jaenisch\b/g, 'Primera Jaenisch'],
  [/\bGambito Portuguese\b/g, 'Gambito Portugués'], [/: Swedish\b/g, ': Sueca'], [/\bFrancesa Connection\b/g, 'Conexión Francesa'],
  [/\bPirc Connection\b/g, 'Conexión Pirc'], [/\bSistema Prickly Peón Pass\b/g, 'Sistema Prickly Pawn Pass'],
];
// Jugadas dentro del nombre ("con Nc6", "Anti-Qxd4") con las letras de las piezas en castellano.
const PIEZA = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };
function castellanizar(nombre) {
  for (const [re, por] of POST) nombre = nombre.replace(re, por);
  nombre = nombre.replace(/\b([KQRBN])(x?[a-h][1-8])\b/g, (m, p, r) => PIEZA[p] + r);
  // "Ataque Bird's", "Defensa Keene's", "Línea Kramnik's": el posesivo inglés sobra.
  return nombre.replace(/\b([A-ZÁÉÍÓÚÑ][\w-]*)'s\b/g, '$1');
}
function repasar(nombre) {
  nombre = castellanizar(nombre);
  const [fam, resto] = nombre.split(/:\s*/, 2);
  const tramo = s => {
    s = s.trim();
    let inv = false, m = s.match(/^Invertida (.+)$/);
    if (m) { s = m[1]; inv = true; }
    m = s.match(FIN); if (m && !/^(Variante|Defensa|Gambito|Sistema|Ataque)\b/.test(m[1])) s = m[2] + ' ' + m[1];
    if (inv) s += ' Invertida';
    return s.replace(MASC_ADJ, (x, n, mid, a) => n + mid + ' ' + ADJ[a]);
  };
  // Lichess escribe la misma variante de dos maneras ("Paulsen Variation" y "Paulsen"): sin el
  // "Variante" delante de un nombre propio quedan unificadas en el árbol. "Variante del Avance" queda.
  const sinVar = s => s.replace(/^Variante (?=[A-ZÁÉÍÓÚÑ0-9])/, '');
  // Otra pasada al final: algunas frases recién quedan armadas después de reordenar ("Fried Liver Ataque" →
  // "Ataque Fried Liver" → "Ataque del Hígado Frito").
  return castellanizar(resto === undefined ? tramo(fam) : tramo(fam) + ': ' + resto.split(/,\s*/).map(s => sinVar(tramo(s))).join(', '));
}
function get(url) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode)); return; }
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}
async function loadTsv(letter) {
  const local = path.join(os.tmpdir(), 'chess-openings-' + letter + '.tsv');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  console.log('  bajando ' + letter + '.tsv de GitHub…');
  const txt = await get('https://raw.githubusercontent.com/lichess-org/chess-openings/master/' + letter + '.tsv');
  fs.writeFileSync(local, txt);
  return txt;
}
// De quién es la apertura (0 = blancas, 1 = negras), por el nombre ORIGINAL en inglés. Manda el tramo
// más específico que lo diga ("Sicilian Defense: …, English Attack" → blancas):
//   - "Defense" → negras.
//   - "Gambit", "Attack", "Countergambit", "System", "Declined", "Accepted" → el que hizo la jugada
//     que le da el nombre: la última de la línea más corta donde aparece ese tramo. Así hay gambitos
//     de negras (Benko/Volga …3…b5, Letón, Englund, Elefante), el Ataque Marshall (8…d5) es de negras
//     y el "Gambito Benko Rehusado" es de blancas (el que lo rehúsa).
//   - "Opening", "Game" → blancas.
// Si ningún tramo lo dice, el que hizo la última jugada de su propia línea.
function tramosEn(nombreEn) {
  const p = nombreEn.split(/\s*[:,]\s*/), out = [];
  for (let i = 0; i < p.length; i++) out.push(p.slice(0, i + 1).join('|'));
  return out;
}
function dueno(nombreEn, plies, primera) {
  const p = nombreEn.split(/\s*[:,]\s*/), claves = tramosEn(nombreEn);
  for (let i = p.length - 1; i >= 0; i--) {
    if (/\b(Defense|Defence)\b/i.test(p[i])) return 1;
    if (/\b(Gambit|Attack|Countergambit|Counterattack|Counter-Gambit|System|Declined|Accepted)\b/i.test(p[i])) return primera[claves[i]] % 2 === 0 ? 1 : 0;
    if (/\b(Opening|Game)\b/i.test(p[i])) return 0;
  }
  return plies % 2 === 0 ? 1 : 0;
}
function pgnToSans(pgn) {
  return pgn.replace(/\d+\.(\.\.)?/g, ' ').replace(/[+#!?]/g, '').trim().split(/\s+/).filter(Boolean);
}

(async function main() {
  console.log('Generando árbol de aperturas…');
  const translate = loadTranslate();
  const porLinea = {}, out = [], porEpd = {};
  let repetidas = 0, malas = 0;
  for (const letter of ['a', 'b', 'c', 'd', 'e']) {
    const lines = (await loadTsv(letter)).split('\n');
    for (const line of lines) {
      if (!line || line.startsWith('eco\t')) continue;
      const [eco, nombreEn, pgn] = line.split('\t');
      if (!pgn) continue;
      const ch = new Chess(), sans = [];
      let ok = true;
      for (const s of pgnToSans(pgn)) { const mv = ch.move(s); if (!mv) { ok = false; break; } sans.push(mv.san.replace(/[+#]/g, '')); }
      if (!ok) { malas++; continue; }
      const jug = sans.join(' '), nombre = repasar(translate(nombreEn));
      // Para el visor: el nombre de cada POSICIÓN (la línea más corta que llega a ella).
      const epd = ch.fen().split(' ').slice(0, 4).join(' ');
      if (sans.length && (!porEpd[epd] || sans.length < porEpd[epd][0])) porEpd[epd] = [sans.length, eco, nombre];
      if (!sans.length || porLinea[jug]) { repetidas++; continue; }
      porLinea[jug] = true;
      out.push([eco, nombre, jug, ch.fen().split(' ')[0], nombreEn]);   // el dueño se calcula al final
    }
  }
  // Jugadas de la primera línea (la más corta) de cada tramo del nombre en inglés, para dueno().
  const primera = {};
  for (const r of out) { const p = tramosEn(r[4]), n = r[2].split(' ').length; for (const k of p) if (!(k in primera) || n < primera[k]) primera[k] = n; }
  for (const r of out) r[4] = dueno(r[4], r[2].split(' ').length, primera);
  out.sort((a, b) => a[2].split(' ').length - b[2].split(' ').length || (a[2] < b[2] ? -1 : 1));
  const json = JSON.stringify({ v: 1, a: out });
  const outPath = path.join(ROOT, 'assets', 'aperturas-arbol.json');
  fs.writeFileSync(outPath, json);
  const fams = new Set(out.map(r => r[1].split(':')[0].trim()));
  console.log('✔ assets/aperturas-arbol.json  (' + out.length + ' líneas, ' + fams.size + ' familias, '
    + Math.round(json.length / 1024) + ' KB; ' + repetidas + ' repetidas, ' + malas + ' inválidas)');

  // El visor (rótulo dorado arriba del gráfico) usa assets/aperturas.js. Se le pisan los nombres con los
  // del árbol, así dice lo mismo que el explorador y tocarlo lleva a esa apertura (03/10/2026). Las
  // posiciones que sólo tenía por _ECO_TABLE (no están en lichess) quedan como estaban.
  const apPath = path.join(ROOT, 'assets', 'aperturas.js');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(apPath, 'utf8'), ctx);
  const AP = ctx.window.__APERTURAS__;
  let cambiados = 0, nuevos = 0;
  for (const epd in porEpd) {
    const v = porEpd[epd][1] + '\t' + porEpd[epd][2];
    if (!(epd in AP)) nuevos++; else if (AP[epd] !== v) cambiados++;
    AP[epd] = v;
  }
  const n = Object.keys(AP).length;
  fs.writeFileSync(apPath,
    '/* Generado por build-aperturas.js y build-aperturas-arbol.js — NO editar a mano.\n' +
    '   Base: lichess-org/chess-openings (CC0), traducida al castellano en build.\n' +
    '   Índice por EPD (FEN sin relojes) para reconocer transposiciones.\n' +
    '   Los nombres son los MISMOS del árbol del explorador (build-aperturas-arbol.js los pisa).\n' +
    '   Valor = "ECO\\tNombre". ' + n + ' posiciones. */\n' +
    'window.__APERTURAS__ = ' + JSON.stringify(AP).replace(/</g, '\\u003c') + ';\n');
  console.log('✔ assets/aperturas.js  (' + n + ' posiciones; ' + cambiados + ' nombres cambiados, ' + nuevos + ' nuevas)');
  console.log('\n⚠️  Si algo cambió, subí _AP_ASSET_V en index.html: /assets/* se guarda UN AÑO en el navegador del\n'
    + '   visitante (_headers) y sin otra versión seguiría viendo los archivos viejos.');
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
