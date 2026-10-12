const fs = require('fs');
global.window = {}; require(process.cwd() + '/assets/aperturas.js'); const A = window.__APERTURAS__;
const J = JSON.parse(fs.readFileSync('assets/aperturas-arbol.json', 'utf8'));
const linea = {}; for (const r of J.a) if (!linea[r[1]]) linea[r[1]] = r[2];
const PZ = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };
const cast = m => m.split(' ').map((s, i) => (i % 2 ? '' : (i / 2 + 1) + '.') + s.replace(/^[KQRBN]/, p => PZ[p])).join(' ');
// [buscar, reemplazo] en orden.
const R = [
  ['Contraataque Argentine', 'Contraataque Argentino'], ['Gambito Argentinian', 'Gambito Argentino'], [', Argentine', ', Argentina'],
  ['Ataque American', 'Ataque Americano'], ['Nimzo-American', 'Nimzo-Americana'], [', American', ', Americana'],
  ['Línea Armenian', 'Línea Armenia'], ['Defensa Arctic', 'Defensa Ártica'], ['Drunken Caballo', 'Caballo Borracho'], ['Drunken Cavalry', 'Caballería Borracha'],
  ['Gambito Australian', 'Gambito Australiano'], ['Defensa Baltic', 'Defensa Báltica'], ['Gambito Basque', 'Gambito Vasco'], ['Gambito Bavarian', 'Gambito Bávaro'],
  ['Bayonet', 'Bayoneta'], ['Battery', 'Batería'], ['Línea Blockade', 'Línea del Bloqueo'], ['Española: Bulgarian', 'Española: Búlgara'],
  ['Defensa Catalan Aceptado', 'Defensa Catalana Aceptada'], ['Neo-Catalan Rehusado', 'Neo-Catalana Rehusada'], [/\bCatalan\b/, 'Catalana'],
  ['Pirc: Chinese', 'Pirc: China'], ['Chinese Dragón', 'Dragón Chino'], ['Gambito Chinese', 'Gambito Chino'],
  ['Línea Alfil Check', 'Línea del Jaque de Alfil'], [', Check', ', Jaque'], ['Gambito Lion Claw', 'Gambito Garra del León'], ['Counterthrust', 'Contragolpe'], ['Crab', 'Cangrejo'],
  ['Czech-India', 'Checa-India'], ['Czech Benoni', 'Benoni Checa'], ['Czech', 'Checa'], ['Aceptado, Danish', 'Aceptado, Danesa'],
  ['Rare Defenses', 'Defensas Raras'], ['Línea Rare', 'Línea Rara'], ['Standard Development', 'Desarrollo Normal'], [', Development', ', Desarrollo'],
  ['Ataque Dynamic', 'Ataque Dinámico'], ['Eastern', 'Oriental'], ['Western', 'Occidental'], [/\bEdge\b/, 'Borde'], ['Elbow', 'Codo'],
  ['Endgame Offer', 'Oferta de Final'], ['Endgame', 'Final'], ['Finnish', 'Finlandesa'], ['Sozin, Flank', 'Sozin, Variante de Flanco'], ['Ataque Fluid', 'Ataque Fluido'],
  [', Forgotten', ', Olvidada'], ['Full Symmetry', 'Simetría Total'], ['Línea Full', 'Línea Completa'],
  ['Ataque Hungarian', 'Ataque Húngaro'], ['Hungarian Dragón', 'Dragón Húngaro'], ['Hungarian', 'Húngara'],
  [/(\S+) Hybrid/, 'Híbrida $1'], ['Icelandic-Palme', 'Islandés-Palme'], ['Defensa Icelandic', 'Defensa Islandesa'], ['Immediate Fianchetto', 'Fianchetto Inmediato'],
  ['Lesser Simagin', 'Simagin Menor'], ['Lithuanian', 'Lituana'], ['Fried Liver', 'Hígado Frito'], [', Long', ', Larga'], ['London', 'Londres'],
  ['Maltese Falcon', 'Halcón Maltés'], ['Defensa Mediterranean', 'Defensa Mediterránea'], ['Gambito Moscow', 'Gambito Moscú'], ['Moscow', 'Moscú'],
  ['Netherlands', 'Países Bajos'], ['New York', 'Nueva York'], ['New England', 'Nueva Inglaterra'], ['Gambito Norwegian', 'Gambito Noruego'], ['Norwegian', 'Noruega'],
  ['Outflank', 'Envolvente'], ['Metger Unpin', 'Desclavada Metger'], ['Unpin', 'Desclavada'], [/(: |, )Pin\b/, '$1Clavada'], ['Prague', 'Praga'], ['Primitive Pillsbury', 'Pillsbury Primitiva'],
  ['Queen Benoni Pterodactyl', 'Pterodáctilo Benoni de Dama'], ['Queen Pteranodon', 'Pteranodon de Dama'], ['Queen Pterodactyl', 'Pterodáctilo de Dama'],
  ['Peón Return', 'Devolución del Peón'], ['Defensa Romanian', 'Defensa Rumana'], ['Doble Peón Sacrifice', 'Sacrificio de Dos Peones'], ['Retrasada Alfil Sacrifice', 'Sacrificio de Alfil Retrasado'],
  ['Peón Sacrifice', 'Sacrificio de Peón'], ['Alfil Sacrifice', 'Sacrificio de Alfil'], ['Gambito Blackmar Second', 'Segundo Gambito Blackmar'],
  ['Sharp', 'Aguda'], ['Siberian', 'Siberiana'], ['Ataque Six Peones', 'Ataque de los Seis Peones'], ['Snake', 'Serpiente'], ['Lasker Simul Special', 'Especial de Simultáneas Lasker'],
  ['Defensa Standard', 'Defensa Normal'], ['Línea Standard', 'Línea Normal'], ['Gambito Swiss', 'Gambito Suizo'], ['Ware: Symmetric', 'Ware: Simétrica'],
  ['The Walrus', 'La Morsa'], ['The Squirrel', 'La Ardilla'], ['The Whale', 'La Ballena'], ['The Goblin', 'El Duende'],
  [/(\S+) Transfer\b/, 'Transposición a la $1'], ['Transpositional', 'por Transposición'], ['Ukrainian', 'Ucraniana'], ['Valencian', 'Valenciana'],
  ['Venice', 'Venecia'], ['Viennese', 'Vienés'], ['Vienna', 'Viena'], ['Berlin Wall', 'Muro de Berlín'], ['Warsaw', 'Varsovia'],
  ['Pterodactyl', 'Pterodáctilo'], ['Maróczy Bind', 'Formación Maróczy'], ['St. Petersburg', 'San Petersburgo'],
  ['Zurich', 'Zúrich'], ['Paris', 'París'], ['Copenhagen', 'Copenhague'], ['Cologne', 'Colonia'], ['Belgrade', 'Belgrado'], ['Brussels', 'Bruselas'],
  ['Lisbon', 'Lisboa'], ['Seville', 'Sevilla'], ['Stockholm', 'Estocolmo'], ['Cracow', 'Cracovia'], [/\bLeningrad\b/, 'Leningrado'], ['Edinburgh', 'Edimburgo'], ['Inglesa Rat', 'Rata Inglesa'],
  // orden y género
  ['Ataque Yugoslava', 'Ataque Yugoslavo'], ['Acelerada Dragón', 'Dragón Acelerado'], ['Retrasada Cambio', 'Cambio Retrasado'], ['Retrasada de Cambio', 'Cambio Retrasado'],
  ['Retrasada Fianchetto', 'Fianchetto Retrasado'], ['Diferida Fianchetto', 'Fianchetto Diferido'], ['Neo-Variante Moderna', 'Variante Neo-Moderna'], ['Semi-Variante Clásica', 'Variante Semi-Clásica'],
  ['Ultra-Variante Cambio Retrasado', 'Cambio Ultra-Retrasado'],
];
const DUDA = /\b(Spike|Wind|Inner Doll|Prickly Pawn Pass)\b/;
// Sólo palabras enteras: si no, "Siberian" se metía dentro de "Siberiano".
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RX = R.map(([a, b]) => [new RegExp('(?<![\\p{L}\\d])(?:' + (typeof a === 'string' ? esc(a) : a.source) + ')(?![\\p{L}\\d])', 'gu'), b]);
const filas = [];
for (const epd in A) {
  const [eco, nm] = A[epd].split('\t');
  let p = nm;
  for (const [re, b] of RX) p = p.replace(re, b);
  if (p !== nm || DUDA.test(nm)) filas.push({ eco, nm, p: p !== nm ? p : '¿? (lo dejé igual)', l: linea[nm] });
}
const vistos = new Set();
const uni = filas.filter(f => !vistos.has(f.nm) && vistos.add(f.nm)).sort((a, b) => a.nm.localeCompare(b.nm, 'es'));
const fam = n => n.split(':')[0];
const out = [
  'NOMBRES DE APERTURAS PARA REVISAR  (armado el 11/10/2026)',
  '===========================================================',
  '',
  'Son ' + uni.length + ' nombres que quedaron con palabras en inglés o mal ordenados.',
  'Cada renglón:   CÓDIGO  |  cómo dice hoy  →  lo que propongo',
  'Abajo, corridas, las jugadas para ubicarla.',
  '',
  'CÓMO CORREGIR:',
  '  - Si la propuesta está bien, no toques nada.',
  '  - Si no, escribí lo correcto DESPUÉS de la flecha →  (borrá lo mío).',
  '  - Si querés que quede como hoy, poné  =  después de la flecha.',
  '  - Los "¿?" son apodos o nombres propios que dejé igual: decidí vos.',
  '  - Las jugadas no hace falta tocarlas.',
  '  - Si ves un nombre mal que NO está en la lista, agregalo al final con el mismo formato.',
  '',
  'PREGUNTAS GENERALES (respondé acá abajo):',
  '  1) Hoy dice "Variante de Cambio" (112 nombres). Wikipedia dice "variante del cambio".',
  '     ¿Lo paso a "Variante del Cambio" en todos?  Respuesta: ',
  '  2) Otras cosas para cambiar en todos lados (ej.: una palabra que siempre está mal):',
  '     ',
];
let f0 = '';
for (const f of uni) {
  if (fam(f.nm) !== f0) { f0 = fam(f.nm); out.push('', '── ' + f0 + ' ' + '─'.repeat(Math.max(3, 60 - f0.length))); }
  out.push(f.eco + '  |  ' + f.nm + '  →  ' + f.p);
  if (f.l) out.push('         ' + cast(f.l));
}
out.push('', '── AGREGADOS (nombres mal que no estaban en la lista) ──', '');
fs.writeFileSync(process.argv[2], '﻿' + out.join('\r\n') + '\r\n');
console.log('nombres', uni.length, 'renglones', out.length);
