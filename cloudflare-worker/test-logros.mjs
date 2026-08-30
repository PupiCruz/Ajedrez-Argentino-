// ─────────────────────────────────────────────────────────────────────────────
// Banco de pruebas de los LOGROS del perfil (Fase 4 de donaciones/colaboradores).
// No necesita instalar nada: node test-logros.mjs
//
// Saca la función real del worker (no una copia) y le da partidas de mentira, para
// comprobar las reglas finas: qué corta una racha, cuándo es "miniatura", cuándo se
// gana el dragón, los niveles, y que los logros SECRETOS no se filtren en "te faltan".
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./cr-proxy-worker.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Recorte: desde el comentario del motor hasta el final de calcularLogros.
const desde = src.indexOf('const LOGROS_SECRETOS');
const finMarca = src.indexOf('\n}\n', src.indexOf('async function calcularLogros'));
if (desde < 0 || finMarca < 0) { console.error('No pude recortar el motor de logros del worker'); process.exit(1); }
const bloque = src.slice(desde, finMarca + 3);

// patronVigente vive fuera del recorte: se le pasa igual que en el worker.
const fabricar = new Function('patronVigente', bloque + '\nreturn calcularLogros;');
const calcularLogros = fabricar((u) => !!(u && Number(u) > Math.floor(Date.now() / 1000)));

// ── Base de mentira: env.DB con las dos consultas que hace el motor ──
function fakeEnv(partidas, mates) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              all: async () => ({ results: sql.includes('SELECT moves') ? (mates || []) : partidas }),
            };
          },
        };
      },
    },
  };
}

const AHORA = Math.floor(Date.now() / 1000);
const YO = 'u1';
// Atajo para armar una partida. gane: 'si'|'no'|'tablas'.
function P(gane, extra = {}) {
  const res = gane === 'si' ? 'w' : gane === 'no' ? 'b' : 'draw';
  return {
    category: extra.cat || 'blitz', result: res, white_id: YO, black_id: 'otro',
    white_before: extra.mio == null ? 1500 : extra.mio,
    black_before: extra.suyo == null ? 1500 : extra.suyo,
    reason: extra.reason || 'resign',
  };
}
const USUARIO_NUEVO = { created_at: AHORA - 86400, patron_until: 0 };

let fallos = 0, total = 0;
function ok(cond, texto, detalle) {
  total++;
  if (cond) { console.log('  ok   | ' + texto + (detalle !== undefined ? '  → ' + detalle : '')); }
  else { fallos++; console.log('  MAL  | ' + texto + (detalle !== undefined ? '  → ' + detalle : '')); }
}
const tiene = (r, id) => r.logros.some((l) => l.id === id);
const falta = (r, id) => r.faltan.some((l) => l.id === id);
const nivel = (r, id) => (r.logros.find((l) => l.id === id) || {}).niv || 0;

console.log('\n=== 1. Cuenta recién creada, sin jugar nada ===');
{
  const r = await calcularLogros(fakeEnv([]), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'debut'), 'sin partidas no hay Debut');
  ok(tiene(r, 'pionero'), 'pero sí es "De los primeros" (cuenta del primer año)');
  ok(falta(r, 'debut'), 'y Debut aparece en "te faltan"');
  ok(!falta(r, 'pionero'), 'pionero NUNCA se lista como pendiente (ya no se puede conseguir)');
  ok(!falta(r, 'ahogado') && !falta(r, 'cincuenta'), 'los dos secretos tampoco se listan');
  ok(r.logros.length === 1, 'una sola medalla', r.logros.length);
}

console.log('\n=== 2. Rachas: qué las corta ===');
{
  // Ganar, ganar, TABLAS, ganar, ganar → la mejor racha es 2, no 4.
  const r = await calcularLogros(fakeEnv([P('si'), P('si'), P('tablas'), P('si'), P('si')]), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'racha'), 'las tablas cortan la racha (2 y 2, no llega a 3)');
}
{
  const r = await calcularLogros(fakeEnv([P('si'), P('si'), P('si')]), YO, null, USUARIO_NUEVO);
  ok(nivel(r, 'racha') === 1, 'tres seguidas = Racha nivel 1', nivel(r, 'racha'));
}
{
  const cinco = [P('si'), P('si'), P('si'), P('si'), P('si')];
  const r = await calcularLogros(fakeEnv(cinco), YO, null, USUARIO_NUEVO);
  ok(nivel(r, 'racha') === 2, 'cinco seguidas = nivel 2', nivel(r, 'racha'));
  ok(!r.logros.some((l) => l.id === 'racha' && l.niv === 1) || nivel(r, 'racha') === 2,
    'la medalla SUBE de nivel, no se duplica');
  ok(r.logros.filter((l) => l.id === 'racha').length === 1, 'y aparece una sola vez');
}
{
  // Perder también corta.
  const r = await calcularLogros(fakeEnv([P('si'), P('si'), P('no'), P('si')]), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'racha'), 'perder corta la racha');
}

console.log('\n=== 3. Cómo terminó la partida ===');
{
  const r = await calcularLogros(fakeEnv([P('si', { reason: 'checkmate' })]), YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'mate'), 'ganar por mate da Jaque mate');
}
{
  const r = await calcularLogros(fakeEnv([P('no', { reason: 'checkmate' })]), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'mate'), 'que te den mate NO cuenta');
}
{
  const r = await calcularLogros(fakeEnv([P('si', { reason: 'flag' })]), YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'tiempo'), 'ganar por tiempo da Sobre la hora');
}
{
  const r = await calcularLogros(fakeEnv([P('tablas', { reason: 'stalemate' })]), YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'ahogado'), 'rey ahogado da el secreto Ahogado');
  ok(!falta(r, 'ahogado'), 'y no se anuncia');
}
{
  const r = await calcularLogros(fakeEnv([P('tablas', { reason: 'fifty' })]), YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'cincuenta'), 'la regla de las 50 da su medalla');
}
{
  const r = await calcularLogros(fakeEnv([P('tablas', { reason: 'threefold' })]), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'ahogado') && !tiene(r, 'cincuenta'), 'la repetición no da ninguna de las dos');
}

console.log('\n=== 4. Mataste al dragón (le ganás a uno más fuerte) ===');
{
  const r = await calcularLogros(fakeEnv([P('si', { mio: 1500, suyo: 1700 })]), YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'dragon'), 'exactamente 200 de diferencia alcanza');
}
{
  const r = await calcularLogros(fakeEnv([P('si', { mio: 1500, suyo: 1699 })]), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'dragon'), '199 no alcanza');
}
{
  const r = await calcularLogros(fakeEnv([P('no', { mio: 1500, suyo: 1900 })]), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'dragon'), 'perder contra uno más fuerte no cuenta');
}
{
  // Con negras: la diferencia se mide al revés y tiene que seguir funcionando.
  const conNegras = [{ category: 'blitz', result: 'b', white_id: 'otro', black_id: YO,
    white_before: 1800, black_before: 1500, reason: 'resign' }];
  const r = await calcularLogros(fakeEnv(conNegras), YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'dragon'), 'también vale jugando con negras');
}

console.log('\n=== 5. Miniatura (mate rápido) ===');
{
  const veinte = Array(40).fill('e4').join(' ');    // 40 medias jugadas = 20 jugadas
  const r = await calcularLogros(fakeEnv([P('si', { reason: 'checkmate' })], [{ moves: veinte }]),
    YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'miniatura'), 'mate en 20 jugadas es miniatura');
}
{
  const sesenta = Array(60).fill('e4').join(' ');   // 30 jugadas
  const r = await calcularLogros(fakeEnv([P('si', { reason: 'checkmate' })], [{ moves: sesenta }]),
    YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'miniatura'), 'mate en 30 jugadas no');
}
{
  const r = await calcularLogros(fakeEnv([P('si', { reason: 'checkmate' })], [{ moves: '' }]),
    YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'miniatura'), 'una partida sin jugadas guardadas no regala la miniatura');
}

console.log('\n=== 6. Los tres ritmos ===');
{
  const tres = [P('si', { cat: 'bullet' }), P('si', { cat: 'blitz' }), P('si', { cat: 'rapid' })];
  const r = await calcularLogros(fakeEnv(tres), YO, null, USUARIO_NUEVO);
  ok(tiene(r, 'ritmos'), 'jugar bullet, blitz y rápida lo da');
}
{
  const dos = [P('si', { cat: 'bullet' }), P('si', { cat: 'blitz' }), P('si', { cat: 'blitz' })];
  const r = await calcularLogros(fakeEnv(dos), YO, null, USUARIO_NUEVO);
  ok(!tiene(r, 'ritmos'), 'repetir un ritmo no cuenta como otro');
}

console.log('\n=== 7. Niveles de Kilometraje ===');
for (const [n, esperado] of [[9, 0], [10, 1], [49, 1], [50, 2], [250, 3], [1000, 3]]) {
  const r = await calcularLogros(fakeEnv(Array(n).fill(P('tablas'))), YO, null, USUARIO_NUEVO);
  ok(nivel(r, 'km') === esperado, n + ' partidas → nivel ' + esperado, nivel(r, 'km'));
}

console.log('\n=== 8. Ejercicios ===');
{
  const blob = JSON.stringify({ solved: 120, bestStreak: 16, days: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1 } });
  const r = await calcularLogros(fakeEnv([]), YO, blob, USUARIO_NUEVO);
  ok(nivel(r, 'puz') === 2, '120 resueltos → Resolvedor nivel 2', nivel(r, 'puz'));
  ok(nivel(r, 'punteria') === 2, 'racha de 16 → Puntería nivel 2', nivel(r, 'punteria'));
  ok(nivel(r, 'dias') === 1, '8 días distintos → Constancia nivel 1', nivel(r, 'dias'));
}
{
  const r = await calcularLogros(fakeEnv([]), YO, 'esto no es json', USUARIO_NUEVO);
  ok(!tiene(r, 'puz'), 'un progreso corrupto no rompe nada');
}

console.log('\n=== 9. La casa ===');
{
  const conCaballito = { created_at: AHORA - 86400, patron_until: AHORA + 86400 * 30 };
  const r = await calcularLogros(fakeEnv([]), YO, null, conCaballito);
  ok(tiene(r, 'colab'), 'con el caballito vigente da Colaborador');
}
{
  const vencido = { created_at: AHORA - 86400, patron_until: AHORA - 10 };
  const r = await calcularLogros(fakeEnv([]), YO, null, vencido);
  ok(!tiene(r, 'colab'), 'con el caballito vencido, no');
  ok(falta(r, 'colab'), 'y vuelve a aparecer como pendiente');
}
{
  const viejo = { created_at: AHORA - 400 * 86400, patron_until: 0 };
  const r = await calcularLogros(fakeEnv([]), YO, null, viejo);
  ok(tiene(r, 'aniversario'), 'más de un año de cuenta da Un año acá');
}

console.log('\n=== 10. Ninguna medalla se repite ===');
{
  const muchas = [];
  for (let i = 0; i < 60; i++) muchas.push(P('si', { reason: 'checkmate', cat: ['bullet', 'blitz', 'rapid'][i % 3], suyo: 1900 }));
  // Una ganada por tiempo y las dos carambolas, para que de verdad no quede NADA pendiente.
  muchas.push(P('si', { reason: 'flag' }));
  muchas.push(P('tablas', { reason: 'stalemate' }));
  muchas.push(P('tablas', { reason: 'fifty' }));
  const blob = JSON.stringify({ solved: 600, bestStreak: 40, days: Object.fromEntries(Array(120).fill(0).map((_, i) => ['d' + i, 1])) });
  const r = await calcularLogros(fakeEnv(muchas, [{ moves: Array(30).fill('e4').join(' ') }]),
    YO, blob, { created_at: AHORA - 400 * 86400, patron_until: AHORA + 86400 });
  const ids = r.logros.map((l) => l.id);
  ok(new Set(ids).size === ids.length, 'sin repetidas con todo desbloqueado', ids.length + ' medallas');
  ok(r.faltan.length === 0, 'y no queda nada pendiente', r.faltan.length);
  ok(ids.includes('miniatura') && ids.includes('dragon') && ids.includes('ritmos'), 'están las difíciles');
}

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + total + ' fallaron' : '✅ Las ' + total + ' pruebas pasaron.'));
process.exit(fallos ? 1 : 0);
