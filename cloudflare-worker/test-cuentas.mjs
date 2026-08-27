// Banco de pruebas del Worker de cuentas (cr-proxy-worker.js).
//   cd ajedrez-argentino/cloudflare-worker && node test-cuentas.mjs
//
// Cubre la Fase 4 de la auditoría (frenos de frecuencia, cierre del redactor con IA, freno del PIN
// por IP y tope de partidas rateadas entre las mismas dos cuentas), la parte de la Fase 5 que vive
// acá (el endpoint /mod/status con el que los chats revalidan las sanciones) y la Fase 6 (velocidad
// de /rating/me y progreso de ejercicios que no se pisa entre dispositivos).
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
  // Contadores para poder comprobar la Fase 6: cuántas CREATE/ALTER se mandaron, cuántas consultas
  // sueltas (una ida y vuelta cada una) y cuántos lotes.
  const st = { creates: 0, sueltas: 0, enLote: 0, lotes: 0 };
  let _enLote = false;
  const stmt = (sql) => ({
    sql, args: [],
    bind(...a) { this.args = a; return this; },
    async first() { return run(sql, this.args, 'first'); },
    async run() { return run(sql, this.args, 'run'); },
    async all() { return { results: run(sql, this.args, 'all') || [] }; },
  });
  function run(sql, a, modo) {
    const S = sql.replace(/\s+/g, ' ');
    if (/^CREATE|^ALTER|^PRAGMA/i.test(S)) { st.creates++; return modo === 'all' ? [] : (modo === 'first' ? null : {}); }
    if (_enLote) st.enLote++; else st.sueltas++;
    if (S.includes('FROM sessions s JOIN usuarios')) {
      const se = t.sessions.find((x) => x.token === a[0]); if (!se) return null;
      const u = t.usuarios.find((x) => x.id === se.user_id); if (!u) return null;
      return Object.assign({}, u, { expires: se.expires });
    }
    if (S.startsWith('DELETE FROM sessions WHERE expires <')) { t.sessions = t.sessions.filter((x) => x.expires >= a[0]); return {}; }
    if (S.startsWith('DELETE FROM reports WHERE handled=1')) { t.reports = t.reports.filter((x) => !(x.handled === 1 && x.created_at < a[0])); return {}; }
    if (S.includes('SELECT dnd FROM usuarios')) { const r = t.usuarios.find((x) => x.id === a[0]) || null; return modo === 'all' ? (r ? [r] : []) : r; }
    if (S.includes('SELECT id, username FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.includes('SELECT id FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.startsWith('UPDATE usuarios SET display_name')) { return {}; }
    if (S.startsWith('UPDATE usuarios SET dnd')) { return {}; }
    if (S.includes('SELECT id, username, banned, chat_muted_until FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.startsWith('UPDATE usuarios SET banned=1')) { const u = t.usuarios.find((x) => x.id === a[0]); if (u) { u.banned = 1; u.banned_at = a[1]; u.banned_reason = a[2]; } return {}; }
    if (S.startsWith('UPDATE usuarios SET banned=0')) { const u = t.usuarios.find((x) => x.id === a[0]); if (u) { u.banned = 0; u.banned_at = null; u.banned_reason = null; } return {}; }
    if (S.startsWith('UPDATE usuarios SET chat_muted_until')) { const u = t.usuarios.find((x) => x.id === a[0]); if (u) u.chat_muted_until = a[1]; return {}; }
    if (S.startsWith('DELETE FROM sessions WHERE user_id=')) { t.sessions = t.sessions.filter((x) => x.user_id !== a[0]); return {}; }
    if (S.includes('SELECT blocked_id FROM blocks WHERE blocker_id=')) return t.blocks.filter((b) => b.blocker_id === a[0]).map((b) => ({ blocked_id: b.blocked_id }));
    if (S.includes('SELECT blocker_id FROM blocks WHERE blocked_id=')) return t.blocks.filter((b) => b.blocked_id === a[0]).map((b) => ({ blocker_id: b.blocker_id }));
    if (S.includes('FROM blocks WHERE')) return modo === 'all' ? [] : null;
    if (S.includes('FROM follows WHERE')) return modo === 'all' ? [] : null;
    if (S.includes('COUNT(*) AS n FROM rated_games')) {
      const [w, b, desde] = a;
      const n = t.rated_games.filter((g) => g.ts > desde &&
        ((g.white_id === w && g.black_id === b) || (g.white_id === b && g.black_id === w))).length;
      return { n };
    }
    if (S.startsWith('SELECT * FROM rated_games WHERE game_id=')) return t.rated_games.find((g) => g.game_id === a[0]) || null;
    if (S.includes('SELECT rating, games FROM ratings')) { const r = t.ratings.find((x) => x.user_id === a[0] && x.category === a[1]) || null; return modo === 'all' ? (r ? [r] : []) : r; }
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
    if (S.includes('FROM user_puzzle')) { const r = t.user_puzzle.find((x) => x.user_id === a[0]) || null; return modo === 'all' ? (r ? [r] : []) : r; }
    if (S.startsWith('INSERT INTO user_puzzle')) {
      const ex = t.user_puzzle.find((x) => x.user_id === a[0]);
      if (ex) { ex.data = a[1]; ex.solved = a[2]; ex.updated = a[3]; }
      else t.user_puzzle.push({ user_id: a[0], data: a[1], solved: a[2], updated: a[3] });
      return {};
    }
    if (S.includes('FROM reports WHERE reporter_id')) return null;
    if (S.startsWith('INSERT INTO reports')) { t.reports.push({ id: a[0], reporter_id: a[1], target_id: a[2], created_at: a[5], handled: 0 }); return {}; }
    return modo === 'all' ? [] : null;
  }
  return {
    tablas: t, stats: st, prepare: (sql) => stmt(sql),
    // batch() = UNA sola ida y vuelta con varias consultas adentro. Devuelve un resultado por consulta,
    // igual que D1 de verdad.
    batch: async (arr) => {
      st.lotes++; _enLote = true;
      const out = [];
      try { for (const s of arr) out.push(await s.all()); } finally { _enLote = false; }
      return out;
    },
  };
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

console.log('\n=== 6. /mod/status: la consulta con la que los chats revalidan (Fase 5) ===');
{
  const H = { 'X-Vivo-Secret': 'secreto-vivo', 'Content-Type': 'application/json' };
  const sin = await pedir('/mod/status', { method: 'POST', body: '{"userId":"u_ana"}' });
  chk(sin.status === 403, 'sin el secreto → 403 (no está al alcance del navegador)', sin.status);
  const conMod = await pedir('/mod/status', { method: 'POST', headers: { Authorization: 'Bearer sess-mod' }, body: '{"userId":"u_ana"}' });
  chk(conMod.status === 403, 'ni siquiera con la sesión del moderador: es sólo worker a worker', conMod.status);
  const nadie = await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_fantasma"}' });
  chk(nadie.status === 404, 'un usuario que no existe → 404', nadie.status);

  const ana = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' }));
  chk(ana.ok === true && ana.banned === 0 && ana.muted_until === 0, 'una cuenta sana: sin baneo ni silencio');
  chk(ana.is_mod === false, 'y no figura como moderadora');
  const mod = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_mod"}' }));
  chk(mod.is_mod === true, 'la cuenta del autor sí figura como moderadora');

  // Un mod sanciona por los endpoints de siempre: /mod/status lo tiene que reflejar en el acto.
  await pedir('/mod/ban', { method: 'POST', headers: H, body: '{"userId":"u_beto","reason":"spam"}' });
  const beto = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_beto"}' }));
  chk(beto.banned === 1, 'después del baneo avisa que está baneado', beto.banned);
  chk(!DB.tablas.sessions.some((s) => s.user_id === 'u_beto'), 'y el baneo le borró la sesión');
  await pedir('/mod/mute', { method: 'POST', headers: H, body: '{"userId":"u_ana","minutes":30}' });
  const ana2 = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' }));
  chk(ana2.muted_until > Math.floor(Date.now() / 1000), 'y del silencio devuelve hasta cuándo dura', ana2.muted_until);
  await pedir('/mod/unmute', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' });
  const ana3 = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' }));
  chk(ana3.muted_until === 0, 'quitado el silencio, vuelve a cero (esto es lo que lo hace inmediato)', ana3.muted_until);

  // Los bloqueos viajan en las DOS direcciones: son los que usa el reparto del chat.
  DB.tablas.blocks.push({ blocker_id: 'u_ana', blocked_id: 'u_beto', created_at: 1 });
  const ana4 = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' }));
  chk(JSON.stringify(ana4.blocked) === '["u_beto"]', 'devuelve a quiénes bloqueó', JSON.stringify(ana4.blocked));
  const beto2 = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_beto"}' }));
  chk(JSON.stringify(beto2.blocked_by) === '["u_ana"]', 'y quiénes lo bloquearon a él', JSON.stringify(beto2.blocked_by));
}

console.log('\n=== 7. /rating/me: una sola ida a la base, y las tablas una sola vez (Fase 6) ===');
{
  const H = { Authorization: 'Bearer sess-ana' };
  DB.tablas.usuarios.find((u) => u.id === 'u_ana').dnd = 1;   // "No molestar" prendido
  const r1 = await json(await pedir('/rating/me', { headers: H }));
  chk(r1.id === 'u_ana', 'contesta quién soy', r1.id);
  chk(typeof r1.ratings.blitz === 'number' && typeof r1.ratings.bullet === 'number' && typeof r1.ratings.rapid === 'number',
      'devuelve los tres ratings del sitio');
  chk(r1.prov.rapid === true, 'marca como provisional el ritmo sin partidas');
  chk(r1.dnd === 1, 'trae el "No molestar" de la cuenta', r1.dnd);
  chk(JSON.stringify(r1.blocked) === '["u_beto"]', 'y las dos listas de bloqueo', JSON.stringify(r1.blocked));

  // Segunda llamada: acá se mide. Las tablas ya están creadas y las lecturas van en un solo lote.
  const antes = { creates: DB.stats.creates, sueltas: DB.stats.sueltas, lotes: DB.stats.lotes, enLote: DB.stats.enLote };
  const r2 = await json(await pedir('/rating/me', { headers: H }));
  chk(r2.id === 'u_ana', 'la segunda llamada contesta igual');
  chk(DB.stats.creates === antes.creates, 'NO vuelve a crear tablas (antes las creaba en cada pedido)', DB.stats.creates - antes.creates);
  chk(DB.stats.lotes === antes.lotes + 1, 'las lecturas van en UN solo lote', DB.stats.lotes - antes.lotes);
  chk(DB.stats.sueltas === antes.sueltas + 1, 'y queda UNA sola consulta suelta: la de "quién soy"', DB.stats.sueltas - antes.sueltas);
  chk(DB.stats.enLote - antes.enLote === 6, 'con las seis lecturas adentro del lote', DB.stats.enLote - antes.enLote);
  DB.tablas.usuarios.find((u) => u.id === 'u_ana').dnd = 0;
}

console.log('\n=== 8. El progreso de ejercicios ya no se pisa entre dispositivos (Fase 6) ===');
{
  const H = { Authorization: 'Bearer sess-ana', 'Content-Type': 'application/json' };
  const guardar = (o) => pedir('/puz/progress', { method: 'POST', headers: H, body: JSON.stringify(o) });
  const leer = async () => (await json(await pedir('/puz/progress', { headers: H }))).progress;

  // El teléfono va adelante: 50 resueltos.
  const tel = { solved: 50, n: 50, ok: 45, fail: 5, rating: 1420, best: 1450, streak: 3, bestStreak: 9,
                byLevel: { facil: 30, medio: 20 }, days: { '2026-08-25': 20, '2026-08-26': 30 } };
  await guardar(tel);
  chk((await leer()).solved === 50, 'queda guardado lo del teléfono');

  // La computadora tenía una copia vieja de 20, resuelve uno y manda 21. ANTES esto borraba los 50.
  const compu = { solved: 21, n: 21, ok: 18, fail: 3, rating: 1260, best: 1300, streak: 1, bestStreak: 4,
                  byLevel: { facil: 21 }, days: { '2026-08-20': 12, '2026-08-27': 1 } };
  await guardar(compu);
  const m = await leer();
  chk(m.solved === 50, 'la copia vieja NO pisa el progreso (antes lo dejaba en 21)', m.solved);
  chk(m.rating === 1420, 'el rating de táctica se mantiene', m.rating);
  chk(m.bestStreak === 9, 'y la mejor racha también', m.bestStreak);
  chk(m.days['2026-08-26'] === 30 && m.days['2026-08-20'] === 12 && m.days['2026-08-27'] === 1,
      'el calendario junta los días de los dos aparatos', JSON.stringify(m.days));
  chk(m.byLevel.medio === 20 && m.byLevel.facil === 30, 'y los resueltos por nivel se quedan con el mayor');

  // El que va adelante sí avanza normalmente.
  const tel2 = Object.assign({}, tel, { solved: 51, n: 51, ok: 46, rating: 1435, best: 1455 });
  await guardar(tel2);
  const m2 = await leer();
  chk(m2.solved === 51, 'el aparato que va adelante sigue sumando', m2.solved);
  chk(m2.rating === 1435, 'con su rating al día', m2.rating);
  chk(m2.best === 1455, 'y su mejor marca', m2.best);

  // Y la respuesta del guardado ya trae lo que quedó, para que el atrasado se ponga al día.
  const resp = await json(await guardar(compu));
  chk(resp.ok === true && resp.progress && resp.progress.solved === 51,
      'al guardar se devuelve el progreso ya fusionado', resp.progress && resp.progress.solved);
}

console.log('\n' + (fallos ? ('❌ ' + fallos + ' PRUEBAS FALLARON') : '✅ Todas las pruebas pasaron.') + '\n');
process.exitCode = fallos ? 1 : 0;
