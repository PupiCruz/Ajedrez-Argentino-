// 🧉 Cosecha de una partida para el video: abre la partida en la web (chessargentino.ar) con Chrome en segundo plano,
// deja que la web la analice (símbolos !! ! ?! ? ?? y "mejor era…") y le pregunta al Pupi qué dice en cada jugada.
// Así el video usa EXACTAMENTE las mismas reglas y frases que ve cualquiera en el visor.
//
// Uso suelto:  node cosechar.mjs <torneoId> <indice> salida/partida.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(AQUI, '../../data');
const WEB = 'https://chessargentino.ar/';

function buscarNavegador() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  return candidatos.find((p) => fs.existsSync(p)) || null;
}

const FIGURAS = { '♔': 'R', '♚': 'R', '♕': 'D', '♛': 'D', '♖': 'T', '♜': 'T', '♗': 'A', '♝': 'A', '♘': 'C', '♞': 'C' };
const letras = (s) => String(s || '').replace(/[♔♚♕♛♖♜♗♝♘♞]/g, (m) => FIGURAS[m]);
// El texto del globo llega duplicado ("Una colgada.Una colgada."): se queda con una sola mitad.
const sinDoble = (s) => { s = String(s || '').trim(); const h = s.length / 2; return (s.length % 2 === 0 && s.slice(0, h) === s.slice(h)) ? s.slice(0, h) : s; };
const natural = (n) => { const s = String(n || '?').trim(), i = s.indexOf(','); return i < 0 ? s : (s.slice(i + 1).trim() + ' ' + s.slice(0, i).trim()).trim(); };
const tag = (pgn, k) => { const m = new RegExp('\\[' + k + ' "([^"]*)"\\]').exec(pgn); return m ? m[1].trim() : ''; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function cosechar({ t, gi }, { log = () => {}, nombreEquipo = true } = {}) {
  // 1) La cabecera sale de los datos de esta carpeta (los mismos que publica la web).
  const T = JSON.parse(fs.readFileSync(path.join(DATA, 't', t + '.json'), 'utf8'));
  let pgn = T.games[gi];
  // Un torneo enorme sigue en <id>.p2.json, .p3.json… (como en la web).
  for (let k = 2, desde = T.games.length; !pgn && k <= (T.parts || 1); k++) {
    const g = JSON.parse(fs.readFileSync(path.join(DATA, 't', t + '.p' + k + '.json'), 'utf8')).games || [];
    if (gi < desde + g.length) pgn = g[gi - desde];
    desde += g.length;
  }
  if (!pgn) throw new Error('No encuentro la partida ' + gi + ' en el torneo ' + t);
  let evento = tag(pgn, 'Event');
  if (!evento || /^(Round|Ronda)\s*\d+\s*:/i.test(evento) || evento === '?') evento = T.name || evento;
  const ronda = (/^\d+/.exec(tag(pgn, 'Round')) || [''])[0];
  const exe = buscarNavegador();
  if (!exe) throw new Error('No encuentro Chrome ni Edge para abrir la web');

  // protocolTimeout: si la página se traba, cada pregunta se corta a los 3 minutos con error (con 0 esperaba para siempre).
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', protocolTimeout: 180000, args: ['--no-sandbox', '--window-size=1280,900', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    log('Abriendo la partida en la web…');
    await page.goto(WEB + '?torneo=' + encodeURIComponent(t) + '&partida=' + gi, { waitUntil: 'domcontentloaded', timeout: 120000 });
    // Ojo: _fa.nodes queda VACÍO al abrir una partida sin evaluaciones (faAutoShow): se espera a la partida en el visor, no al análisis.
    await page.waitForFunction("typeof _fa !== 'undefined' && typeof faGetNodes === 'function' && faGetNodes().length > 0 && !!document.querySelector('#chess-overlay.open') && typeof __pupi !== 'undefined'", { timeout: 180000, polling: 1000 });
    await page.evaluate("__pupi.si()");

    // 2) Que la partida esté analizada (con evaluaciones del PGN ya viene; si no, el motor de la web la analiza).
    const total = await page.evaluate('faGetNodes().length');
    const listasAhora = () => page.evaluate('(_fa.nodes.length >= ' + total + ' ? _fa.results.filter(Boolean).length : 0)');
    let listas = await listasAhora();
    if (listas < total) { log('La partida no trae evaluaciones: la analiza el motor de la web (puede tardar unos minutos)…'); await page.evaluate("if (!_fa.running) startFA()"); }
    const limite = Date.now() + 12 * 60e3;
    let ultimo = -1, quieto = 0;
    while (Date.now() < limite) {
      listas = await listasAhora();
      const corre = await page.evaluate('!!_fa.running');
      if (listas >= total && !corre) break;
      if (listas !== ultimo) { log('Analizadas ' + listas + ' de ' + total + ' posiciones…'); ultimo = listas; quieto = 0; }
      // El motor tarda en prender (startFA lo espera 20 s y se rinde): si no arrancó, se le vuelve a pedir.
      else if (!corre && ++quieto % 10 === 0) await page.evaluate("if (!_fa.running) startFA()");
      await esperar(3000);
    }
    if (listas < total) throw new Error('El análisis no terminó a tiempo (' + listas + ' de ' + total + ' posiciones)');
    await esperar(1500);   // que asienten los símbolos
    await page.evaluate("typeof faClassify === 'function' && faClassify()");

    // 4) Qué dice el Pupi en cada jugada (de a tandas, para no pasarse del tiempo de cada pedido).
    log('Le pregunto al Pupi jugada por jugada…');
    const pupi = {};
    for (let desde = 0; desde < total; desde += 20) {
      const trozo = await page.evaluate(`(async function () {
        var ml = [], n0 = cv.root; while (n0 && n0.children && n0.children.length && !n0.children[0].own) { n0 = n0.children[0]; ml.push(n0); }
        var out = [];
        for (var i = ${desde}; i < Math.min(${desde + 20}, ml.length); i++) {
          cvSetNode(ml[i]); var nag = ml[i].move.nag;
          await new Promise(function (r) { setTimeout(r, nag ? 2600 : 1100); });
          var t = document.querySelector('.pupi-t'), b = document.querySelector('.pupi-b'), av = document.querySelector('.pupi-av'), g = document.querySelector('.pupi-globo');
          out.push([i, av && av.getAttribute('data-cara'), t ? t.textContent : '', b ? b.innerText : '', g && g.classList.contains('pupi-chico') ? 1 : 0]);
        }
        return JSON.stringify(out); })()`).then(JSON.parse);
      for (const [i, cara, tt, bb, chico] of trozo) {
        let texto = sinDoble(tt), cuerpo = letras(String(bb || '').trim());
        if (!texto && !cuerpo) continue;
        if (texto === '(sonido de mate)') texto = '*sorbo de mate*';
        if (texto === '(cebando)') texto = '(cebando el mate…)';
        cuerpo = cuerpo.replace(/Es una (Ataque|Gambito|Sistema|Contraataque)/, 'Es un $1');
        pupi[i + 1] = { cara: cara || 'tranqui', t: letras(texto), b: cuerpo, chico: !!chico };
      }
      log('Pupi: ' + Math.min(desde + 20, total) + ' de ' + total + ' jugadas');
    }

    // 3) Jugadas con su símbolo y su evaluación (al final: los jugadones los confirma el motor mientras se recorre la partida).
    await page.evaluate("typeof faClassify === 'function' && faClassify()");
    const jugadas = await page.evaluate(`JSON.stringify(_fa.nodes.map(function (n, i) { var r = _fa.results[i] || {}; return [n.move.san, n.move.nag || '', r.mate !== undefined ? '#' + r.mate : (r.cp === undefined ? null : r.cp)]; }))`).then(JSON.parse);

    // 5) Los países en castellano, como los muestra la web.
    const pais = async (n) => (n ? await page.evaluate((x) => (typeof _paisES === 'function' ? _paisES(x) : x), n) : '');
    const eloDe = (k) => parseInt(tag(pgn, k), 10) || 0;
    return {
      fecha: tag(pgn, 'Date'), evento, ronda: ronda ? 'Ronda ' + ronda : '',
      blancas: { nombre: natural(tag(pgn, 'White')), equipo: await pais(tag(pgn, 'WhiteTeam')), elo: eloDe('WhiteElo') },
      negras: { nombre: natural(tag(pgn, 'Black')), equipo: await pais(tag(pgn, 'BlackTeam')), elo: eloDe('BlackElo') },
      resultado: tag(pgn, 'Result'), eco: tag(pgn, 'ECO'), link: 'chessargentino.ar', jugadas, pupi,
    };
  } finally { await browser.close().catch(() => {}); }
}

// Uso suelto desde la terminal
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , t, gi, salida] = process.argv;
  if (!t || gi === undefined || !salida) { console.log('Uso: node cosechar.mjs <torneoId> <indice> salida/partida.json'); process.exit(1); }
  const P = await cosechar({ t, gi: +gi }, { log: (m) => console.log(m) });
  fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(P, null, 1));
  console.log('Listo:', salida, '·', P.jugadas.length, 'jugadas ·', Object.keys(P.pupi).length, 'comentarios del Pupi');
}
