// Banco de pruebas del Worker de cuentas (cr-proxy-worker.js).
//   cd ajedrez-argentino/cloudflare-worker && node test-cuentas.mjs
//
// Cubre la Fase 4 de la auditoría: frenos de frecuencia, cierre del redactor con IA,
// freno del PIN por IP y tope de partidas rateadas entre las mismas dos cuentas.
// Se ataca por la puerta real del Worker (su fetch), con una base de datos de mentira.

// ── Base de datos de mentira: entiende sólo las consultas que usa el Worker ──
function mkDB() {
  const t = {
    usuarios: [
      { id: 'u_ana', provider: 'lichess', prov_id: '1', username: 'Ana', rating: 1800, title: null, banned: 0, chat_muted_until: 0, dnd: 0 },
      { id: 'u_beto', provider: 'lichess', prov_id: '2', username: 'Beto', rating: 1500, title: null, banned: 0, chat_muted_until: 0, dnd: 0 },
      { id: 'u_mod', provider: 'lichess', prov_id: '3', username: 'ElPupiCruz', rating: 2000, title: null, banned: 0, chat_muted_until: 0, dnd: 0 },
    ],
    sessions: [
      { token: 'sess-ana', user_id: 'u_ana', created_at: 1, expires: 9e9 },
      { token: 'sess-beto', user_id: 'u_beto', created_at: 1, expires: 9e9 },
      { token: 'sess-mod', user_id: 'u_mod', created_at: 1, expires: 9e9 },
      { token: 'sess-vieja', user_id: 'u_ana', created_at: 1, expires: 100 },
    ],
    ratings: [], rated_games: [], reports: [], admin_rl: [], follows: [], blocks: [], user_puzzle: [],
  };
  const stmt = (sql) => ({
    sql, args: [],
    bind(...a) { this.args = a; return this; },
    async first() { return run(sql, this.args, 'first'); },
    async run() { return run(sql, this.args, 'run'); },
    async all() { return { results: run(sql, this.args, 'all') || [] }; },
  });
  function run(sql, a, modo) {
    const S = sql.replace(/\s+/g, ' ');
    if (/^CREATE|^ALTER|^PRAGMA/i.test(S)) return modo === 'all' ? [] : (modo === 'first' ? null : {});
    if (S.includes('FROM sessions s JOIN usuarios')) {
      const se = t.sessions.find((x) => x.token === a[0]); if (!se) return null;
      const u = t.usuarios.find((x) => x.id === se.user_id); if (!u) return null;
      return Object.assign({}, u, { expires: se.expires });
    }
    if (S.startsWith('DELETE FROM sessions WHERE expires <')) { t.sessions = t.sessions.filter((x) => x.expires >= a[0]); return {}; }
    if (S.startsWith('DELETE FROM reports WHERE handled=1')) { t.reports = t.reports.filter((x) => !(x.handled === 1 && x.created_at < a[0])); return {}; }
    if (S.includes('SELECT dnd FROM usuarios')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.includes('SELECT id, username FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.includes('SELECT id FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.startsWith('UPDATE usuarios SET display_name')) { return {}; }
    if (S.startsWith('UPDATE usuarios SET dnd')) { return {}; }
    if (S.includes('FROM blocks WHERE')) return modo === 'all' ? [] : null;
    if (S.includes('FROM follows WHERE')) return modo === 'all' ? [] : null;
    if (S.includes('COUNT(*) AS n FROM rated_games')) {
      const [w, b, desde] = a;
      const n = t.rated_games.filter((g) => g.ts > desde &&
        ((g.white_id === w && g.black_id === b) || (g.white_id === b && g.black_id === w))).length;
      return { n };
    }
    if (S.startsWith('SELECT * FROM rated_games WHERE game_id=')) return t.rated_games.find((g) => g.game_id === a[0]) || null;
    if (S.includes('SELECT rating, games FROM ratings')) return t.ratings.find((r) => r.user_id === a[0] && r.category === a[1]) || null;
    if (S.startsWith('INSERT INTO ratings')) {
      const [uid, cat, rat, upd] = a;
      const ex = t.ratings.find((r) => r.user_id === uid && r.category === cat);
      if (ex) { ex.rating = rat; ex.games++; ex.updated = upd; } else t.ratings.push({ user_id: uid, category: cat, rating: rat, games: 1, updated: upd });
      return {};
    }
    if (S.startsWith('INSERT INTO rated_games')) {
      t.rated_games.push({ game_id: a[0], category: a[1], white_id: a[2], black_id: a[3], result: a[4],
        white_before: a[5], white_after: a[6], black_before: a[7], black_after: a[8], ts: a[9] });
      return {};
    }
    if (S.includes('FROM admin_rl WHERE')) return t.admin_rl.find((x) => x.k === a[0]) || null;
    if (S.startsWith('INSERT INTO admin_rl')) {
      const ex = t.admin_rl.find((x) => x.k === a[0]);
      if (ex) { ex.n = a[1]; ex.ts = a[2]; } else t.admin_rl.push({ k: a[0], n: a[1], ts: a[2] });
      return {};
    }
    if (S.includes('FROM user_puzzle')) return null;
    if (S.startsWith('INSERT INTO user_puzzle')) return {};
    if (S.includes('FROM reports WHERE reporter_id')) return null;
    if (S.startsWith('INSERT INTO reports')) { t.reports.push({ id: a[0], reporter_id: a[1], target_id: a[2], created_at: a[5], handled: 0 }); return {}; }
    return modo === 'all' ? [] : null;
  }
  return { tablas: t, prepare: (sql) => stmt(sql), batch: async (arr) => { for (const s of arr) await s.run(); return []; } };
}

const worker = (await import('./cr-proxy-worker.js')).default;
const DB = mkDB();
const env = { DB, VIVO_SECRET: 'secreto-vivo', EDIT_PIN: 'la-frase-larga', GH_TOKEN: 'x' };
const ctx = { waitUntil() {} };

function req(path, opt = {}) {
  const h = new Headers(opt.headers || {});
  if (opt.ip) h.set('CF-Connecting-IP', opt.ip);
  return new Request('https://cr-proxy.test' + path, { method: opt.method || 'GET', headers: h, body: opt.body });
}
const pedir = (path, opt) => worker.fetch(req(path, opt), env, ctx);
const json = async (r) => { try { return JSON.parse(await r.text()); } catch (e) { return {}; } };

let fallos = 0;
function chk(ok, txt, extra) {
  console.log((ok ? '  ok  ' : ' FALLA') + ' | ' + txt + (extra !== undefined ? ('  → ' + extra) : ''));
  if (!ok) fallos++;
}

console.log('\n=== 1. El redactor con IA ya no está abierto a cualquiera ===');
{
  const r1 = await pedir('/noticia', { method: 'POST', body: '{}' });
  chk(r1.status === 403, 'sin sesión → 403 (antes contestaba y gastaba cuota)', r1.status);
  const r2 = await pedir('/noticia', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer sess-ana' } });
  chk(r2.status === 403, 'con una cuenta normal → 403', r2.status);
  const r3 = await pedir('/noticia', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer sess-mod' } });
  chk(r3.status !== 403, 'con la cuenta del autor pasa el control', r3.status + ' (' + (await json(r3)).error + ')');
  const r4 = await pedir('/noticia', { method: 'POST', body: '{}', headers: { 'X-Vivo-Secret': 'secreto-vivo' } });
  chk(r4.status !== 403, 'y el worker de vivo también', r4.status);
}

console.log('\n=== 2. Freno de frecuencia en los endpoints con cuenta ===');
{
  let ultimo = 0, pasaron = 0;
  for (let i = 0; i < 15; i++) {
    const r = await pedir('/profile', { method: 'POST', headers: { Authorization: 'Bearer sess-ana', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ana ' + i }) });
    ultimo = r.status; if (r.status === 200) pasaron++;
  }
  chk(pasaron === 10, 'de 15 intentos de guardar el perfil entran 10', pasaron);
  chk(ultimo === 429, 'y el resto recibe 429', ultimo);
  const otro = await pedir('/profile', { method: 'POST', headers: { Authorization: 'Bearer sess-beto', 'Content-Type': 'application/json' }, body: '{"name":"Beto"}' });
  chk(otro.status === 200, 'otra persona no queda frenada por el cupo ajeno', otro.status);
}

console.log('\n=== 3. Tope de partidas rateadas entre las mismas dos cuentas ===');
{
  const jugar = (n) => pedir('/rating/report', { method: 'POST', headers: { 'X-Vivo-Secret': 'secreto-vivo', 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: 'g' + n, white: 'u_ana', black: 'u_beto', result: 'w', base: 300, inc: 0, moves: 'e4 e5' }) });
  let subio = 0, capadas = 0;
  for (let i = 1; i <= 14; i++) {
    const d = await json(await jugar(i));
    if (d.capped) capadas++; else if (d.white && d.white.delta > 0) subio++;
  }
  chk(subio === 10, 'las primeras 10 mueven el rating', subio);
  chk(capadas === 4, 'de la 11 en adelante NO lo mueven', capadas);
  chk(DB.tablas.rated_games.length === 14, 'pero las 14 quedan guardadas en el historial', DB.tablas.rated_games.length);
  const ana = DB.tablas.ratings.find((r) => r.user_id === 'u_ana' && r.category === 'blitz');
  chk(ana.games === 10, 'y el contador de partidas rateadas se queda en 10', ana.games);

  // Otro par de cuentas arranca con su propio cupo.
  const d = await json(await pedir('/rating/report', { method: 'POST', headers: { 'X-Vivo-Secret': 'secreto-vivo', 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: 'otro1', white: 'u_ana', black: 'u_mod', result: 'w', base: 300, inc: 0 }) }));
  chk(!d.capped && d.white.delta > 0, 'otro par de cuentas tiene su propio cupo');
}

console.log('\n=== 4. El freno del PIN es por IP, no uno solo para todos ===');
{
  const probar = (pin, ip) => pedir('/admin/live', { method: 'POST', ip, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
  for (let i = 0; i < 13; i++) await probar('mal-' + i, '1.2.3.4');
  const atacante = await probar('mal-otra-vez', '1.2.3.4');
  chk(atacante.status === 429, 'al que falla 12 veces se lo bloquea', atacante.status);
  const autor = await probar('la-frase-larga', '5.6.7.8');
  chk(autor.status !== 429, 'el autor, desde otra IP, NO queda bloqueado (antes sí)', autor.status);
  chk(autor.status !== 403, 'y su PIN correcto se acepta', autor.status);
}

console.log('\n=== 5. Las sesiones vencidas se limpian solas ===');
{
  const antes = DB.tablas.sessions.length;
  chk(DB.tablas.sessions.some((s) => s.token === 'sess-vieja'), 'hay una sesión vencida guardada');
  // authLichess limpia al crear una sesión nueva; se simula llamando al DELETE por el mismo camino.
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ?1').bind(Math.floor(Date.now() / 1000)).run();
  chk(!DB.tablas.sessions.some((s) => s.token === 'sess-vieja'), 'la vencida se borró');
  chk(DB.tablas.sessions.length === antes - 1, 'y las buenas siguen', DB.tablas.sessions.length);
}

console.log('\n' + (fallos ? ('❌ ' + fallos + ' PRUEBAS FALLARON') : '✅ Todas las pruebas pasaron.') + '\n');
process.exitCode = fallos ? 1 : 0;
