/* 🎵 Música en el Tablero (juegos/musica-en-el-tablero/): los datos que el Pupi cuenta entre partida y partida
   ("Pedile data de torneos"): los torneos que se juegan en la Argentina ahora o en las próximas semanas (data/manifest.js)
   y los "¿Sabías que…?" (data/datos.json). Las frases se arman en el juego con la fecha del día, así que el archivo no se
   pone viejo enseguida. Pesa unos 12 KB: el juego no tiene que bajar el manifest de 4 MB.
   Uso:  node herramientas/armar-datos-pupi.js   → juegos/musica-en-el-tablero/pupi-datos.json   (publicar-web.cmd lo corre solo)
   Es la copia para la web de ChessHero/herramientas/armar-datos-pupi.js (cambia sólo de dónde lee y dónde escribe).
   Las mismas reglas que el Pupi de la web (prototipos/comentarista/pupi.js: torneosDatos, tituloTorneo, articulo). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..'), WEB = path.join(RAIZ, 'data'), SALIDA = path.join(RAIZ, 'juegos', 'musica-en-el-tablero', 'pupi-datos.json');
const AR = /Argentina|Buenos Aires|CABA|C[oó]rdoba|Santa Fe|R[ií]o Negro|Chubut|San Luis|Corrientes|Entre R[ií]os|Mendoza|Tucum[aá]n|Salta|Jujuy|Neuqu[eé]n|La Pampa|Misiones|Chaco|Formosa|Santiago del Estero|Catamarca|La Rioja|San Juan|Santa Cruz|Tierra del Fuego/i;

function tituloTorneo(n) {   /* sin emojis ni comillas, sin lo que va después de " - ", y sin gritar */
  n = String(n || '').replace(/[☀-➿⭐⭕]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|️/g, ' ').replace(/["“”«»]/g, '')
    .replace(/(\S)- (\S)/g, '$1 - $2').replace(/\s+/g, ' ').trim();
  n = n.split(' - ')[0].replace(/-\s*R\$.*$/, '').replace(/[\s-]+$/, '');
  const lindo = s => s.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b[ivxlc]+\b/gi, w => /^(c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(w) && !/^(vi|li|ci)$/i.test(w) ? w.toUpperCase() : w);
  if (n === n.toUpperCase()) n = lindo(n).replace(/ (De|Del|La|El|Los|Las|Y|En|A)(?= )/g, m => m.toLowerCase());
  else if ((n.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) || []).filter(w => !/^[IVXLC]+$/.test(w)).length >= 2)
    n = n.replace(/[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ-]{3,}/g, w => /^[IVXLC]+$/.test(w) ? w : lindo(w));
  return n;
}
const articulo = n => /^((\d+°?|[IVXLC]+)\s+)?(Liga|Copa|Olimpiada|Final|Semifinal)/i.test(n) ? 'la' : 'el';   /* 'III Copa…' → la */

const win = {}; vm.runInNewContext(fs.readFileSync(path.join(WEB, 'manifest.js'), 'utf8'), { window: win });
const hoy = new Date().toISOString().slice(0, 10), torneos = [];
for (const [k, o] of Object.entries(win.__EMBEDDED_TZ__ || {})) {
  if (!o || !o.name || !o.startDate) continue;
  const loc = String(o.location || '').trim(), fin = o.endDate || o.startDate;
  if (!loc || / - /.test(loc) || !AR.test(loc) || fin < hoy) continue;
  const n = tituloTorneo(o.name);
  torneos.push({ k, n, art: articulo(n), ciudad: loc.split(',')[0].trim(), ini: o.startDate, fin });
}
let hechos = [];
try { hechos = JSON.parse(fs.readFileSync(path.join(WEB, 'datos.json'), 'utf8')).filter(d => d && d.t).map(d => String(d.t).trim()); } catch (e) {}
/* Sólo se escribe si cambió algo (la fecha "hecho" sola no cuenta): si no, publicar-web.cmd vería un cambio todos los días. */
let antes = null;
try { const v = JSON.parse(fs.readFileSync(SALIDA, 'utf8')); antes = JSON.stringify([v.torneos, v.hechos]); } catch (e) {}
if (antes === JSON.stringify([torneos, hechos])) console.log('pupi-datos.json: sin cambios (' + torneos.length + ' torneos · ' + hechos.length + ' datos)');
else { fs.writeFileSync(SALIDA, JSON.stringify({ hecho: hoy, torneos, hechos })); console.log('pupi-datos.json:', torneos.length, 'torneos ·', hechos.length, 'datos'); }
