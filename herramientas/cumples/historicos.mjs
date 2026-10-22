// 🎂 «Nació un día como hoy»: los ajedrecistas argentinos de Wikidata con fecha de nacimiento (22/10/2026).
//
//   node herramientas/cumples/historicos.mjs        (desde la carpeta ajedrez-argentino)
//
// Escribe data/cumples-historicos.json: [{ n: nombre, md: "MM-DD", a: año, m: año de muerte (0 si vive, -1 si se sabe
// que murió pero no cuándo), f: número FIDE si tiene, w: link a Wikipedia en castellano }].
// Entran los de Wikidata con ocupación «ajedrecista» y nacionalidad argentina y la fecha con DÍA. Los que están en
// nuestro ranking (por número FIDE) NO van acá: ésos se cargan con el lápiz del perfil o con «🎂 Buscar cumpleaños en
// Wikidata» (lo decide el autor). No se corre en cada publicación: una vez y cada tanto (la lista casi no cambia).
// La usa herramientas/armar-portada.mjs (portada «Hoy» y el saludo del bot).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UA = 'ChessArgentino (https://chessargentino.ar; cumpleaños de ajedrecistas argentinos)';

// Las filas de Wikidata → la lista (sin los del ranking, sin repetidos, sin los que no tienen nombre).
export function armarLista(filas, fidesDelRanking) {
  const ya = new Set((fidesDelRanking || []).map(String)), vistos = new Set(), out = [];
  for (const b of filas || []) {
    const n = String((b.itemLabel || {}).value || '').trim();
    const dob = String((b.dob || {}).value || '').match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
    if (!n || /^Q\d+$/.test(n) || !dob) continue;                     // sin nombre en castellano ni inglés
    const f = b.fide ? String(b.fide.value).replace(/\D/g, '') : '';
    if (f && ya.has(f)) continue;                                    // está en el ranking: va por __CUMPLES__
    const clave = n + '|' + dob[0];
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const dod = b.dod ? String(b.dod.value).match(/^\+?(\d{4})-/) : null;
    const o = { n, md: dob[2] + '-' + dob[3], a: +dob[1], m: b.dod ? (dod ? +dod[1] : -1) : 0 };
    if (f) o.f = f;
    if (b.ar) o.w = String(b.ar.value);
    out.push(o);
  }
  return out.sort((x, y) => x.md.localeCompare(y.md) || x.a - y.a);
}

async function main() {
  // Los números FIDE del ranking salen del mismo archivo de datos que publica la web.
  let fides = [];
  try {
    const js = fs.readFileSync(path.join(RAIZ, 'data', 'embedded-data.js'), 'utf8');
    const m = /^window\.__EMBEDDED_PLAYERS__=(.*);\s*$/m.exec(js);
    const ov = m ? JSON.parse(m[1]) : null;
    fides = ov ? (ov.players || []).concat(ov.additionals || []).map((p) => p.fide_id).filter(Boolean) : [];
  } catch (e) { console.log('⚠️  No pude leer el ranking de data/embedded-data.js: van todos.'); }
  const q = `SELECT ?item ?itemLabel ?dob ?dod ?fide ?ar WHERE {
    ?item wdt:P106 wd:Q10873124 ; wdt:P27 wd:Q414 .
    ?item p:P569/psv:P569 [ wikibase:timeValue ?dob ; wikibase:timePrecision ?prec ] . FILTER(?prec >= 11)
    OPTIONAL { ?item wdt:P570 ?dod }
    OPTIONAL { ?item wdt:P1440 ?fide }
    OPTIONAL { ?ar schema:about ?item ; schema:isPartOf <https://es.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
  }`;
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!r.ok) { console.log('❌ Wikidata respondió ' + r.status + '. No toqué nada.'); process.exitCode = 1; return; }
  const lista = armarLista((await r.json()).results.bindings, fides);
  if (lista.length < 20) { console.log('❌ Llegaron sólo ' + lista.length + ': algo anda mal. No toqué nada.'); process.exitCode = 1; return; }
  fs.writeFileSync(path.join(RAIZ, 'data', 'cumples-historicos.json'), JSON.stringify(lista));
  console.log('🎂 data/cumples-historicos.json: ' + lista.length + ' ajedrecistas (' + lista.filter((x) => x.m).length + ' ya fallecidos).');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
