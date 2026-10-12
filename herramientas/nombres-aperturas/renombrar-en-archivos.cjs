// Da vuelta "Antigua India" → "India Antigua" (y Benoni/Siciliana/Zukertort) en los archivos de aperturas.
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2], escribir = process.argv[3] === '--escribir';
const REEMPL = [
  ['Ataque Antiguo India', 'Ataque Indio Antiguo'],
  ['Antigua India', 'India Antigua'],
  ['Antigua Benoni', 'Benoni Antigua'],
  ['Antigua Siciliana', 'Siciliana Antigua'],
];
const files = ['assets/aperturas.js', 'assets/aperturas-arbol.json', 'assets/aperturas-jugadas.json',
  'data/aperturas-stats.json', 'data/puzzles.json', 'data/practice.json', 'data/book.json', 'data/datos.json']
  .concat(fs.readdirSync(path.join(ROOT, 'data/planes')).map(f => 'data/planes/' + f))
  .concat(process.argv[4] ? fs.readdirSync(process.argv[4]).filter(f => f.endsWith('.json')).map(f => path.join(process.argv[4], f)) : []);
for (const f of files) {
  const p = path.isAbsolute(f) ? f : path.join(ROOT, f); if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8'), cuenta = [];
  for (const [a, b] of REEMPL) { const n = s.split(a).length - 1; if (n) { cuenta.push(a + '×' + n); s = s.split(a).join(b); } }
  if (cuenta.length) {
    console.log(f + ': ' + cuenta.join(', '));
    if (escribir) {
      if (f.endsWith('.json')) JSON.parse(s);   // sigue siendo JSON válido
      fs.writeFileSync(p, s);
    }
  }
}
