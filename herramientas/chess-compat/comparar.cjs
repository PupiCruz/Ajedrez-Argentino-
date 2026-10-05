// Compara la librería vieja (chess-0.10.3-vieja.min.js) contra assets/chess.min.js (nueva + traductor)
// con partidas reales de data/t. Uso: node herramientas/chess-compat/comparar.cjs [partidas] [semilla]
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..', '..');
function cargarLib(f) { const m = { exports: {} }; new Function('module', 'exports', 'window', fs.readFileSync(f, 'utf8'))(m, m.exports, {}); return m.exports.Chess; }
const Vieja = cargarLib(path.join(__dirname, 'chess-0.10.3-vieja.min.js'));
const Nueva = cargarLib(path.join(raiz, 'assets', 'chess.min.js'));
const N = +process.argv[2] || 300; let semilla = +process.argv[3] || 12345;
function rnd() { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; }
const dif = {}; let comps = 0;
function J(x) { try { return JSON.stringify(x); } catch (e) { return 'ERR:' + e.message; } }
function corre(fn) { try { return J(fn()); } catch (e) { return 'THROW:' + e.message; } }
function cmp(tipo, a, b, ctx) {
  comps++;
  if (a === b) return;
  const d = dif[tipo] = dif[tipo] || { n: 0, ej: [] };
  d.n++; if (d.ej.length < 3) d.ej.push({ ctx: String(ctx).slice(0, 300), vieja: String(a).slice(0, 400), nueva: String(b).slice(0, 400) });
}
function par(tipo, fnV, fnN, ctx) { cmp(tipo, corre(fnV), corre(fnN), ctx); }
// Corre la MISMA función con las dos librerías.
function ambos(tipo, fn, ctx) { cmp(tipo, corre(() => fn(Vieja)), corre(() => fn(Nueva)), ctx); }
const SQS = []; for (const f of 'abcdefgh') for (const r of '12345678') SQS.push(f + r);

// ── 1) Partidas reales ──
const dir = path.join(raiz, 'data', 't');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
// 960, comentadas con +/- y la Olimpiada de OlimpBase (con variantes)
const especiales = ['1780929216419.json', '1780083735805.json', '1789770545658.json', 'tz_ob2002.json'];
const elegidos = new Set(especiales.filter(f => archivos.includes(f)));
while (elegidos.size < Math.min(archivos.length, Math.max(20, Math.ceil(N / 10)))) elegidos.add(archivos[Math.floor(rnd() * archivos.length)]);
let partidas = [];
for (const f of elegidos) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const gs = (d.games || []).filter(g => typeof g === 'string');
    const tope = especiales.includes(f) ? 25 : 10;
    for (let i = 0; i < gs.length && i < tope; i++) partidas.push({ f, pgn: gs[Math.floor(rnd() * gs.length)] });
  } catch (e) {}
}
partidas = partidas.slice(0, N);
console.log('Partidas a comparar:', partidas.length, 'de', elegidos.size, 'archivos');
const t0 = Date.now();
partidas.forEach((p, idx) => {
  const ctx = p.f + ' #' + idx;
  const movetext = p.pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, '').trim();
  const variantes = [['entero', p.pgn], ['sin headers', movetext], ['sin comentarios', p.pgn.replace(/\{[^}]*\}/g, '')],
    ['CRLF', p.pgn.replace(/\n/g, '\r\n')]];
  for (const [nom, txt] of variantes) for (const op of [undefined, { sloppy: true }]) {
    const v = new Vieja(), n = new Nueva(), et = nom + (op ? ' sloppy' : '');
    par('load_pgn ' + et, () => v.load_pgn(txt, op), () => n.load_pgn(txt, op), ctx);
    par('fen tras load_pgn ' + et, () => v.fen(), () => n.fen(), ctx);
    if (nom !== 'entero' || op) continue;
    par('header', () => v.header(), () => n.header(), ctx);
    par('history', () => v.history(), () => n.history(), ctx);
    par('history verbose', () => v.history({ verbose: true }), () => n.history({ verbose: true }), ctx);
    par('pgn', () => v.pgn(), () => n.pgn(), ctx);
    par('pgn ancho', () => v.pgn({ max_width: 72, newline_char: '\n' }), () => n.pgn({ max_width: 72, newline_char: '\n' }), ctx);
    const est = c => [c.turn(), c.in_check(), c.in_checkmate(), c.in_stalemate(), c.in_draw(), c.game_over(), c.insufficient_material(), c.in_threefold_repetition()];
    par('estado', () => est(v), () => est(n), ctx);
    par('board', () => v.board(), () => n.board(), ctx);
    for (let k = 0; k < 3; k++) { par('undo', () => v.undo(), () => n.undo(), ctx); par('fen tras undo', () => v.fen(), () => n.fen(), ctx); }
  }
  // ── 2) Recorrido jugada por jugada ──
  const v0 = new Vieja(); v0.load_pgn(p.pgn, { sloppy: true });
  const hist = v0.history({ verbose: true }), start = v0.header().FEN;
  const v = start ? new Vieja(start) : new Vieja(), n = start ? new Nueva(start) : new Nueva();
  hist.forEach((m, i) => {
    if (i % 4 === 0) {
      par('moves', () => v.moves(), () => n.moves(), ctx + ' j' + i);
      par('moves verbose', () => v.moves({ verbose: true }), () => n.moves({ verbose: true }), ctx + ' j' + i);
      const sq = SQS[Math.floor(rnd() * 64)], vb = rnd() < .5;
      par('moves square', () => v.moves({ square: sq, verbose: vb }), () => n.moves({ square: sq, verbose: vb }), ctx + ' ' + sq);
      par('get', () => v.get(sq), () => n.get(sq), ctx);
      const f = v.fen();
      par('new Chess(fen).fen', () => new Vieja(f).fen(), () => new Nueva(f).fen(), f);
      par('legal:false', () => new Vieja(f).moves({ legal: false }), () => new Nueva(f).moves({ legal: false }), f);
    }
    const formas = [[m.san], [m.from + m.to + (m.promotion || ''), { sloppy: true }], [{ from: m.from, to: m.to, promotion: m.promotion }],
      [m.from + '-' + m.to, { sloppy: true }], [m.san.replace(/[+#]/, ''), { sloppy: true }], [m.from + m.to], [{ from: m.from, to: m.to }]];
    const fo = formas[i % formas.length];
    par('move ' + (typeof fo[0] === 'object' ? 'objeto' : fo[1] ? 'sloppy' : 'san'), () => v.move(fo[0], fo[1]), () => n.move(fo[0], fo[1]), ctx + ' j' + i + ' ' + J(fo));
    if (v.history().length !== i + 1) { v.move(m.san, { sloppy: true }); }
    if (n.history().length !== i + 1) { n.move(m.san, { sloppy: true }); }
    par('fen recorrido', () => v.fen(), () => n.fen(), ctx + ' j' + i);
    if (i % 7 === 3) for (const malo of ['Ke9', 'xx', '', 'O-O', '0-0', '--', 'e4', 'Nf3', 'exd5', 'a1a8', 'nf3', 'Qh5+', 'e8=Q', 'bxa8=N', 'Nbd2', 'R1e1']) {
      const f = v.fen();
      ambos('move raro', C => { const c = new C(f); return [c.move(malo), c.move(malo, { sloppy: true }), c.fen()]; }, f + ' ' + malo);
    }
  });
  par('final estado', () => [v.in_check(), v.in_checkmate(), v.in_draw(), v.game_over(), v.in_threefold_repetition(), v.pgn()],
                      () => [n.in_check(), n.in_checkmate(), n.in_draw(), n.game_over(), n.in_threefold_repetition(), n.pgn()], ctx);
  if (idx % 50 === 0) console.log('  ' + idx + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
});

// ── 3) FEN raros, put/remove/clear, constantes ──
// Diferencias ACEPTADAS (no se prueban; ninguna pantalla las usa): peones en la 1.ª/8.ª fila
// (la vieja inventaba jugadas como "a"; ahora se descartan) y tablero SIN REY (la vieja daba 0
// jugadas o basura; la nueva da las pseudo-legales).
const fens = ['', 'x', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
  '8/8/8/8/8/8/8/8 w - - 0 1', '4k3/8/8/8/8/8/8/8 w - - 0 1', '8/8/8/8/8/8/8/4K3 w - - 0 1', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e3 0 1', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', '4k3/8/8/8/8/8/8/R3K2R w Kkq - 0 1',
  '4k3/8/8/8/8/8/8/4K2K w - - 0 1', '8/P7/8/8/8/8/8/k6K w - - 0 1', '4k3/8/8/8/8/8/8/4K3 w - - 0 0',
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 extra', '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', '7k/8/6K1/8/8/8/8/6Q1 w - - 0 1',
  'k7/8/8/8/8/8/8/K7 w - - 0 1', 'kb6/8/8/8/8/8/8/KB6 w - - 0 1', 'rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 3',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', '8/8/8/3k4/8/8/8/R3K2R w KQ - 0 1'];
for (const f of fens) {
  ambos('validate_fen', C => new C().validate_fen(f), f);
  ambos('new Chess(raro)', C => { const c = new C(f); return [c.fen(), c.header(), c.moves(), c.moves({ verbose: true }), c.in_check(), c.game_over(), c.pgn(), c.board()]; }, f);
  ambos('load(raro)', C => { const c = new C(); return [c.load(f), c.fen(), c.header()]; }, f);
  ambos('load_pgn con FEN', C => { const c = new C(); return [c.load_pgn('[SetUp "1"]\n[FEN "' + f + '"]\n\n*'), c.fen(), c.header(), c.pgn()]; }, f);
}
ambos('put/remove/clear', C => { const c = new C(); return [c.clear(), c.fen(), c.header(), c.put({ type: 'k', color: 'w' }, 'e1'), c.put({ type: 'k', color: 'w' }, 'e2'),
  c.put({ type: 'x', color: 'w' }, 'e2'), c.put({ type: 'q', color: 'b' }, 'z9'), c.put({ type: 'k', color: 'b' }, 'e8'), c.put({ type: 'r', color: 'w' }, 'h1'), c.fen(), c.header(),
  c.remove('h1'), c.remove('a5'), c.fen(), c.moves(), c.reset(), c.fen(), c.header(), c.move('e4'), c.put({ type: 'n', color: 'w' }, 'a3'), c.fen(), c.header()]; }, 'secuencia');
ambos('constantes', C => { const c = new C(); return [c.SQUARES, c.FLAGS, c.WHITE, c.BLACK, c.KING, c.square_color('a1'), c.square_color('h1'), c.square_color('x'), c.ascii(), c.perft(3)]; }, 'const');
ambos('sin new', C => C().fen(), 'Chess() sin new');
ambos('triple repetición', C => { const c = new C(); const o = []; ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(m => { c.move(m); o.push(c.in_threefold_repetition()); }); return [o, c.in_draw(), c.game_over(), c.pgn(), c.undo(), c.in_threefold_repetition()]; }, 'rep');
ambos('repetición con al paso', C => { const c = new C(); const o = []; ['e4', 'Nf6', 'Nf3', 'Ng8', 'Ng1', 'Nf6', 'Nf3', 'Ng8', 'Ng1', 'Nf6', 'Nf3', 'Ng8', 'Ng1'].forEach(m => { c.move(m); o.push(c.in_threefold_repetition()); }); return o; }, 'rep ep');
ambos('coronación sin pieza', C => { const c = new C('8/P7/8/8/8/8/8/k6K w - - 0 1'); return [c.moves({ verbose: true }).map(m => m.san), c.move({ from: 'a7', to: 'a8' }), c.move('a8', { sloppy: true }), c.fen()]; }, 'prom');
ambos('pgn con ... y headers', C => { const c = new C('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'); c.move('e5'); c.move('Nf3'); c.header('White', 'A', 'Black', 'B', 'Result', '1-0'); return [c.pgn(), c.pgn({ max_width: 10 }), c.header()]; }, 'pgn negras');
ambos('load_pgn newline_char', C => { const c = new C(); return [c.load_pgn('[White "A"]|[Black "B"]||1. e4 e5 2. Nf3 1-0', { newline_char: '\\|' }), c.header(), c.fen()]; }, 'nl');
ambos('load_pgn vacíos', C => ['', '*', '1-0', '[White "x"]\n\n', '[White "x"]\n\n1-0', '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 $1 {bien} Nc6 1/2-1/2', '1.e4 e5 2.Nf3 Nc6', '1. e4 e5 2. Ke2 Ke7 3. Ke1 Ke8 4. Ke2 Ke7 5. Ke1 Ke8 *']
  .map(t => { const c = new C(); return [c.load_pgn(t), c.fen(), c.header(), c.in_threefold_repetition()]; }), 'vacios');

console.log('\nComparaciones:', comps, '· tiempo', ((Date.now() - t0) / 1000).toFixed(0), 's');
const tipos = Object.keys(dif);
if (!tipos.length) console.log('✅ CERO diferencias');
else { console.log('❌ Diferencias en', tipos.length, 'tipos:'); for (const t of tipos) { console.log('\n■', t, '→', dif[t].n); for (const e of dif[t].ej) console.log(JSON.stringify(e, null, 1)); } process.exitCode = 1; }
