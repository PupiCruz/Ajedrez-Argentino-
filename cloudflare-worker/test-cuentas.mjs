// Banco de pruebas del Worker de cuentas (cr-proxy-worker.js).
//   cd ajedrez-argentino/cloudflare-worker && node test-cuentas.mjs
//
// Cubre la Fase 4 de la auditoría (frenos de frecuencia, cierre del redactor con IA, freno del PIN
// por IP y tope de partidas rateadas entre las mismas dos cuentas), la parte de la Fase 5 que vive
// acá (el endpoint /mod/status con el que los chats revalidan las sanciones), la Fase 6 (velocidad
// de /rating/me y progreso de ejercicios que no se pisa entre dispositivos) y la Fase 8 (moderadores
// por cuenta y no por nombre de usuario).
// Se ataca por la puerta real del Worker (su fetch), con una base de datos de mentira.

// ── Base de datos de mentira: entiende sólo las consultas que usa el Worker ──
function mkDB() {
  const t = {
    usuarios: [
      { id: 'u_ana', provider: 'lichess', prov_id: '1', username: 'Ana', rating: 1800, title: null, banned: 0, chat_muted_until: 0, dnd: 0 },
      { id: 'u_beto', provider: 'lichess', prov_id: '2', username: 'Beto', rating: 1500, title: null, banned: 0, chat_muted_until: 0, dnd: 0 },
      { id: 'u_mod', provider: 'lichess', prov_id: '3', username: 'ElPupiCruz', rating: 2000, title: null, banned: 0, chat_muted_until: 0, dnd: 0 },
      // Moderador por la COLUMNA is_mod, con un nombre que NO está escrito en el código (Fase 8).
      { id: 'u_ayud', provider: 'lichess', prov_id: '4', username: 'Ayudante', rating: 1700, title: null, banned: 0, chat_muted_until: 0, dnd: 0, is_mod: 1 },
      { id: 'u_eva', provider: 'lichess', prov_id: '5', username: 'Eva', rating: 1600, title: null, banned: 0, chat_muted_until: 0, dnd: 0, created_at: 1788000000 },
    ],
    sessions: [
      { token: 'sess-ana', user_id: 'u_ana', created_at: 1, expires: 9e9 },
      { token: 'sess-beto', user_id: 'u_beto', created_at: 1, expires: 9e9 },
      { token: 'sess-mod', user_id: 'u_mod', created_at: 1, expires: 9e9 },
      { token: 'sess-ayud', user_id: 'u_ayud', created_at: 1, expires: 9e9 },
      { token: 'sess-eva', user_id: 'u_eva', created_at: 1, expires: 9e9 },
      { token: 'sess-vieja', user_id: 'u_ana', created_at: 1, expires: 100 },
    ],
    ratings: [], rated_games: [], reports: [], admin_rl: [], follows: [], blocks: [], user_puzzle: [],
    // Una fila vieja con el id CORTADO a 80 letras, como las que dejó el Worker anterior.
    puz_stats: [{ id: EJ_LARGO.slice(0, 80), ok: 7, fail: 3, rating: 1650, nb: 10 }],
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
    // ── Estadísticas de ejercicios (auditoría 23/09) ──
    if (S.startsWith('INSERT INTO puz_stats')) {
      const ex = t.puz_stats.find((x) => x.id === a[0]);
      if (ex) { ex.ok += a[1]; ex.fail += a[2]; } else t.puz_stats.push({ id: a[0], ok: a[1], fail: a[2], rating: null, nb: 0 });
      return { meta: { changes: 1 } };
    }
    if (S.startsWith('UPDATE puz_stats SET ok = ok')) {
      const ex = t.puz_stats.find((x) => x.id === a[0]); if (!ex) return { meta: { changes: 0 } };
      ex.ok += a[1]; ex.fail += a[2]; return { meta: { changes: 1 } };
    }
    if (S.startsWith('UPDATE puz_stats SET id =')) {
      const ex = t.puz_stats.find((x) => x.id === a[1]);
      if (!ex || t.puz_stats.some((x) => x.id === a[0])) return { meta: { changes: 0 } };
      ex.id = a[0]; return { meta: { changes: 1 } };
    }
    if (S.startsWith('SELECT rating, nb FROM puz_stats')) return t.puz_stats.find((x) => x.id === a[0]) || null;
    if (S.startsWith('UPDATE puz_stats SET rating')) { const ex = t.puz_stats.find((x) => x.id === a[0]); if (ex) { ex.rating = a[1]; ex.nb = a[2]; } return {}; }
    if (S.startsWith('SELECT id, ok, fail, rating, nb FROM puz_stats')) { st.lecturasPuz = (st.lecturasPuz || 0) + 1; return t.puz_stats.map((x) => Object.assign({}, x)); }
    if (S.startsWith('SELECT created_at FROM usuarios')) { const u = t.usuarios.find((x) => x.id === a[0]); return u ? { created_at: u.created_at || 0 } : null; }
    if (S.includes('FROM sessions s JOIN usuarios')) {
      const se = t.sessions.find((x) => x.token === a[0]); if (!se) return null;
      const u = t.usuarios.find((x) => x.id === se.user_id); if (!u) return null;
      return Object.assign({}, u, { expires: se.expires });
    }
    if (S.startsWith('DELETE FROM sessions WHERE expires <')) { t.sessions = t.sessions.filter((x) => x.expires >= a[0]); return {}; }
    if (S.startsWith('DELETE FROM reports WHERE handled=1')) { t.reports = t.reports.filter((x) => !(x.handled === 1 && x.created_at < a[0])); return {}; }
    if (S.includes('SELECT dnd, no_guests, is_mod FROM usuarios')) { const r = t.usuarios.find((x) => x.id === a[0]) || null; return modo === 'all' ? (r ? [r] : []) : r; }
    if (S.includes('SELECT id, username FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.includes('SELECT id FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.startsWith('UPDATE usuarios SET display_name')) { return {}; }
    if (S.startsWith('UPDATE usuarios SET dnd')) { return {}; }
    if (S.includes('banned, chat_muted_until, is_mod FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.includes('banned, chat_muted_until, is_mod FROM usuarios WHERE LOWER(username)')) return t.usuarios.find((x) => String(x.username).toLowerCase() === String(a[0]).toLowerCase()) || null;
    if (S.includes('SELECT is_mod FROM usuarios WHERE id=')) return t.usuarios.find((x) => x.id === a[0]) || null;
    if (S.startsWith('UPDATE usuarios SET is_mod=1')) { for (const u of t.usuarios) if (a.some((n) => String(n).toLowerCase() === String(u.username).toLowerCase())) u.is_mod = 1; return {}; }
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
      // Igual que el SQL de verdad: las amistosas (rated=0) NO gastan el cupo diario del par.
      const soloRateadas = S.includes('COALESCE(rated,1)=1');
      const n = t.rated_games.filter((g) => g.ts > desde &&
        (!soloRateadas || (g.rated == null || g.rated === 1)) &&
        ((g.white_id === w && g.black_id === b) || (g.white_id === b && g.black_id === w))).length;
      return { n };
    }
    if (S.startsWith('SELECT * FROM rated_games WHERE game_id=')) return t.rated_games.find((g) => g.game_id === a[0]) || null;
    if (S.includes('SELECT rating, games FROM ratings')) { const r = t.ratings.find((x) => x.user_id === a[0] && x.category === a[1]) || null; return modo === 'all' ? (r ? [r] : []) : r; }
    if (S.startsWith('INSERT INTO ratings')) {
      // Igual que el SQL de verdad: si la fila ya existe se SUMA la diferencia (?5), con tope 100-3200.
      const [uid, cat, rat, upd, delta] = a;
      const ex = t.ratings.find((r) => r.user_id === uid && r.category === cat);
      if (ex) { ex.rating = S.includes('rating + ?5') ? Math.max(100, Math.min(3200, ex.rating + delta)) : rat; ex.games++; ex.updated = upd; }
      else t.ratings.push({ user_id: uid, category: cat, rating: rat, games: 1, updated: upd });
      return {};
    }
    if (S.startsWith('INSERT INTO rated_games')) {
      t.rated_games.push({ game_id: a[0], category: a[1], white_id: a[2], black_id: a[3], result: a[4],
        white_before: a[5], white_after: a[6], black_before: a[7], black_after: a[8], ts: a[9],
        moves: a[10], white_name: a[11], black_name: a[12], reason: a[13], rated: a[14] });
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

// La lista de ejercicios publicados (auditoría 23/09): el Worker la baja de la web para saber qué ids
// existen. En el banco NUNCA se sale a internet: esa dirección se contesta acá con una lista chica.
const EJ_LARGO = 'ejercicio-con-un-nombre-larguisimo-de-mas-de-ochenta-letras-como-los-de-los-abiertos_mate_uno';
const EJ_LISTA = { puzzles: [{ id: 'ej-uno' }, { id: 'ej-dos' }, { id: EJ_LARGO }] };
let listaEjCaida = false, pedidosLista = 0;
{
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    if (String(url).endsWith('/data/puzzles.json')) {
      pedidosLista++;
      if (listaEjCaida) throw new Error('sin red');
      return new Response(JSON.stringify(EJ_LISTA), { status: 200 });
    }
    return fetchReal(url, opt);
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

console.log('\n=== 3b. Partidas AMISTOSAS: van al historial, no al Elo ===');
{
  const reportar = (extra) => pedir('/rating/report', { method: 'POST', headers: { 'X-Vivo-Secret': 'secreto-vivo', 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ white: 'u_caro', black: 'u_dani', result: 'w', base: 300, inc: 0, moves: 'e4 e5' }, extra)) });

  const am = await json(await reportar({ gameId: 'am1', rated: 0 }));
  chk(am.rated === 0, 'la respuesta avisa que fue amistosa', am.rated);
  chk(am.white.delta === 0 && am.black.delta === 0, 'nadie sube ni baja', am.white.delta + '/' + am.black.delta);
  chk(!DB.tablas.ratings.some((r) => r.user_id === 'u_caro'), 'ni siquiera se le crea la fila de rating');
  const fila = DB.tablas.rated_games.find((g) => g.game_id === 'am1');
  chk(!!fila, 'pero la partida SÍ queda guardada (se puede revivir en el visor)');
  chk(fila.rated === 0, 'y queda marcada como amistosa', fila.rated);
  chk(!am.capped, 'no se confunde con el tope anti-boosteo');

  const con = await json(await reportar({ gameId: 'con1' }));
  chk(con.rated === 1 && con.white.delta > 0, 'sin la bandera sigue siendo con rating (default)', con.white.delta);

  // 20 amistosas seguidas no le comen el cupo diario a las de verdad.
  for (let i = 0; i < 20; i++) await reportar({ gameId: 'amx' + i, rated: 0 });
  const sigue = await json(await reportar({ gameId: 'con2' }));
  chk(!sigue.capped && sigue.white.delta > 0, 'y 20 amistosas no gastan el cupo del par', sigue.white.delta);
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

console.log('\n=== 9. Moderadores por cuenta, no por nombre de usuario (Fase 8) ===');
{
  const H = { 'X-Vivo-Secret': 'secreto-vivo', 'Content-Type': 'application/json' };
  // "Ayudante" no está escrito en ningún lado del código: es moderador sólo por la columna is_mod.
  const ay = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_ayud"}' }));
  chk(ay.is_mod === true, 'una cuenta marcada en la BASE figura como moderadora', ay.is_mod);
  const ana = await json(await pedir('/mod/status', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' }));
  chk(ana.is_mod === false, 'y una cuenta normal sigue sin serlo', ana.is_mod);

  // Y puede moderar de verdad, con su propia sesión (antes esto era imposible sin tocar el código).
  const r = await pedir('/mod/mute', { method: 'POST', headers: { Authorization: 'Bearer sess-ayud', 'Content-Type': 'application/json' }, body: '{"userId":"u_ana","minutes":15}' });
  chk(r.status === 200, 'puede silenciar con su sesión, sin estar escrito en el código', r.status);
  const noMod = await pedir('/mod/mute', { method: 'POST', headers: { Authorization: 'Bearer sess-ana', 'Content-Type': 'application/json' }, body: '{"userId":"u_beto","minutes":15}' });
  chk(noMod.status === 403, 'y una cuenta normal sigue sin poder', noMod.status);
  await pedir('/mod/unmute', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' });

  // Tampoco se lo puede sancionar, igual que a los del dueño.
  const contra = await pedir('/mod/ban', { method: 'POST', headers: H, body: '{"userId":"u_ayud"}' });
  chk(contra.status === 400, 'no se puede banear a un moderador de la columna', contra.status);
  const dueño = await pedir('/mod/ban', { method: 'POST', headers: H, body: '{"userId":"u_mod"}' });
  chk(dueño.status === 400, 'ni a las cuentas del dueño', dueño.status);

  // La semilla: al migrar, las cuentas del dueño quedan marcadas en la base.
  chk(DB.tablas.usuarios.find((u) => u.id === 'u_mod').is_mod === 1,
      'la migración marcó is_mod=1 en las cuentas del dueño', DB.tablas.usuarios.find((u) => u.id === 'u_mod').is_mod);
  chk(!DB.tablas.usuarios.find((u) => u.id === 'u_ana').is_mod, 'y no tocó a las demás');

  // Red de seguridad: aunque la columna se borrara, el dueño sigue entrando por la lista de nombres.
  DB.tablas.usuarios.find((u) => u.id === 'u_mod').is_mod = 0;
  const igual = await pedir('/mod/mute', { method: 'POST', headers: { Authorization: 'Bearer sess-mod', 'Content-Type': 'application/json' }, body: '{"userId":"u_ana","minutes":15}' });
  chk(igual.status === 200, 'sin la columna, el dueño sigue moderando por su nombre (red de seguridad)', igual.status);
  await pedir('/mod/unmute', { method: 'POST', headers: H, body: '{"userId":"u_ana"}' });
}


console.log('\n=== 10. La IA sabe redactar torneos POR EQUIPOS (Olimpiadas, ligas) ===');
{
  // IA de mentira: no redacta nada, sólo guarda el prompt que le mandaron para poder mirarlo.
  let ultimoPrompt = '';
  const envIA = Object.assign({}, env, { AI: { async run(model, opts) {
    ultimoPrompt = opts.messages.map(m => m.content).join('\n');
    return { response: 'TITULO: t\nRESUMEN: r\nCUERPO:\ncuerpo' };
  } } });
  const pedirIA = (body) => worker.fetch(
    new Request('https://cr-proxy.test/noticia', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'https://chessargentino.ar', 'Authorization': 'Bearer sess-mod' }, body
    }), envIA, ctx);

  const equipos = JSON.stringify({
    esEquipos: true,
    torneo: { nombre: 'Olimpiada', sede: 'Budapest', equipos: 189, rondas: 11 },
    campeon: { nombre: 'India', ganados: 10, empatados: 1, perdidos: 0, puntosMatch: 21 },
    podio: [{ nombre: 'India' }, { nombre: 'USA' }],
    argentina: { puesto: 37, de: 189, jugadores: [{ nombre: 'Diego Flores', tablero: 4, rp: 2587 }] },
    medallasPorTablero: [{ tablero: 1, oro: { nombre: 'Gukesh', rp: 3056 } }],
  });
  const r1 = await pedirIA(equipos);
  chk(r1.status === 200, 'el Worker acepta un torneo por equipos', r1.status);
  chk(/POR EQUIPOS/.test(ultimoPrompt), 'y le pide a la IA una nota de torneo por equipos');
  chk(/LA ACTUACIÓN ARGENTINA/.test(ultimoPrompt), 'con la actuación argentina en el centro cuando Argentina jugó');
  chk(/medallasPorTablero/.test(ultimoPrompt), 'le cuenta de las medallas por tablero');
  chk(/NO hables de quién ganó con blancas/.test(ultimoPrompt),
      'y le prohíbe hablar de colores, que en equipos no se saben');
  chk(!/revelación|femeninas/i.test(ultimoPrompt), 'no le pide cosas que en un torneo por equipos no existen');

  // Sin Argentina, el foco cambia (una liga de clubes, un torneo sin argentinos).
  await pedirIA(JSON.stringify({ esEquipos: true, torneo: { nombre: 'Liga' }, campeon: { nombre: 'Club' } }));
  chk(/Contá el torneo desde los equipos/.test(ultimoPrompt), 'sin Argentina en juego, la nota se centra en los equipos');

  // Y el camino de siempre (torneo individual) quedó intacto.
  await pedirIA(JSON.stringify({
    torneo: { nombre: 'Semifinal', internacional: false }, campeon: { nombre: 'Ocampos', arg: true },
    podio: [], destacados: {}, femeninas: [], juveniles: [], sorpresas: []
  }));
  chk(/mejor actuación FEMENINA/.test(ultimoPrompt) && !/POR EQUIPOS/.test(ultimoPrompt),
      'un torneo individual sigue yendo por su prompt de siempre');
}

// ── Transmisiones de Lichess (/libc): un minuto de pausa después de un 429 ─────────────────────
// Lichess pide esperar un minuto entero tras un 429, y el refresco de fondo reintentaba a los 10 s (el
// panel llegó a 10% de 429 el 11/09/2026). Lo que el autor exigió antes de aceptarlo: que durante esa
// pausa el visitante SIGA VIENDO la última posición y los tableros no se borren. Eso se prueba acá, con
// una caché y un Lichess de mentira y el reloj manejado a mano.
{
  console.log('\n=== 11. Lichess: pausa de un minuto después de un 429 ===');
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches, fetchAntes = globalThis.fetch, nowAntes = Date.now;
  globalThis.caches = { default: cacheFalsa };
  let reloj = 1_000_000_000_000;
  Date.now = () => reloj;
  let pedidosALichess = 0, respuesta = { status: 200, cuerpo: '' };
  globalThis.fetch = async (url) => {
    pedidosALichess++;
    return new Response(respuesta.cuerpo, { status: respuesta.status });
  };
  const pendientes = [];
  const ctxLi = { waitUntil(p) { pendientes.push(p); } };
  const libc = async (url) => {
    const r = await worker.fetch(req('/libc?url=' + encodeURIComponent(url)), env, ctxLi);
    await Promise.all(pendientes.splice(0));   // que termine el refresco de fondo antes de seguir
    return { status: r.status, cuerpo: await r.text() };
  };
  const RONDA = 'https://lichess.org/api/broadcast/round/r7F25DkT.pgn';
  const OTRA = 'https://lichess.org/api/broadcast/round/otraRonda.pgn';
  const NUEVA = 'https://lichess.org/api/broadcast/round/nadieLaPidio.pgn';
  try {
    // Dos transmisiones que se están mirando, con su copia buena.
    respuesta = { status: 200, cuerpo: 'PGN-jugada-20' };
    let v = await libc(RONDA);
    respuesta = { status: 200, cuerpo: 'OTRA-jugada-8' };
    await libc(OTRA);
    chk(v.status === 200 && v.cuerpo === 'PGN-jugada-20' && pedidosALichess === 2, 'arranque: cada transmisión se baja una vez');

    // A los 11 s la copia ya no es fresca y Lichess responde 429 al refresco de fondo.
    reloj += 11_000; respuesta = { status: 429, cuerpo: '{"error":"Too many requests"}' };
    v = await libc(RONDA);
    chk(v.status === 200 && v.cuerpo === 'PGN-jugada-20', 'con el 429, el visitante recibe la última posición buena (no un error)', v.status + ' ' + v.cuerpo);
    chk(pedidosALichess === 3, 'el refresco de fondo sí intentó (y ahí llegó el 429)', pedidosALichess);

    // Durante el minuto de pausa: los visitantes siguen pidiendo cada 10 s.
    let todosBien = true, antes = pedidosALichess;
    for (let s = 10; s <= 50; s += 10) {
      reloj += 10_000;
      const a = await libc(RONDA), b = await libc(OTRA);
      if (a.status !== 200 || a.cuerpo !== 'PGN-jugada-20' || b.status !== 200 || b.cuerpo !== 'OTRA-jugada-8') todosBien = false;
    }
    chk(todosBien, 'durante TODO el minuto de pausa, las dos transmisiones siguen mostrando su última posición');
    chk(pedidosALichess === antes, 'y en ese minuto no se le pidió NADA a Lichess (tampoco de la otra transmisión)', pedidosALichess - antes);
    chk(guardado.has('https://cr-proxy.test/__li429pausa'), 'la pausa queda anotada en la caché del borde, para los otros isolates');

    // Una transmisión que nadie pidió todavía: no hay copia que mostrar → se intenta igual.
    antes = pedidosALichess;
    await libc(NUEVA);
    chk(pedidosALichess === antes + 1, 'el primer visitante de una transmisión nueva no queda bloqueado por la pausa');

    // Pasó el minuto y Lichess volvió: se refresca y la jugada nueva llega.
    reloj += 61_000; respuesta = { status: 200, cuerpo: 'PGN-jugada-21' };
    antes = pedidosALichess;
    v = await libc(RONDA);
    chk(pedidosALichess === antes + 1 && v.cuerpo === 'PGN-jugada-20', 'terminada la pausa, vuelve a refrescar (esa vez todavía se sirve la copia)');
    v = await libc(RONDA);
    chk(v.status === 200 && v.cuerpo === 'PGN-jugada-21', 'y al pedido siguiente ya se ve la jugada nueva', v.cuerpo);

    // Un error que NO es 429 (Lichess caído) no pausa: sigue todo como antes del cambio.
    reloj += 11_000; respuesta = { status: 503, cuerpo: 'caído' };
    await libc(RONDA);
    reloj += 11_000; antes = pedidosALichess;
    v = await libc(RONDA);
    chk(pedidosALichess === antes + 1 && v.cuerpo === 'PGN-jugada-21', 'un 503 no pausa, y tampoco borra la copia buena');
  } finally {
    globalThis.caches = cachesAntes; globalThis.fetch = fetchAntes; Date.now = nowAntes;
  }
}

// ── Rondas terminadas y el arranque en frío de Lichess ──────────────────────────────────────────
// Medido el 11/09/2026 (Budapest 2024): Lichess entrega UNA exportación en frío por vez, ~10 s cada 100
// partidas, y a las demás les da 429 al instante. Una ronda de Olimpiada (4-5 partes) costaba ~40 s, y
// como la copia vivía 10 min, se volvía a pagar cada vez que nadie la miraba un rato.
{
  console.log('\n=== 12. Lichess: rondas terminadas guardadas y choques en frío ===');
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches, fetchAntes = globalThis.fetch, nowAntes = Date.now;
  globalThis.caches = { default: cacheFalsa };
  let reloj = 2_000_000_000_000;
  Date.now = () => reloj;
  const pedidos = [];
  let responder = () => new Response('', { status: 500 });
  globalThis.fetch = async (url) => { pedidos.push(String(url)); return responder(String(url)); };
  const pendientes = [];
  const ctxLi = { waitUntil(p) { pendientes.push(p); } };
  const pedirLibc = (url) => worker.fetch(req('/libc?url=' + encodeURIComponent(url)), env, ctxLi);
  const libc = async (url) => {
    const r = await pedirLibc(url);
    await Promise.all(pendientes.splice(0));
    return { status: r.status, cuerpo: await r.text() };
  };
  const pgn = (...res) => res.map((x, i) => '[Event "Olimpiada"]\n[White "B' + i + '"]\n[Black "N' + i + '"]\n[Result "' + x + '"]\n\n1. e4 ' + x).join('\n\n');
  const ronda = (id) => 'https://lichess.org/api/broadcast/round/' + id + '.pgn';
  const hayPausa = () => guardado.has('https://cr-proxy.test/__li429pausa');
  try {
    // 1) Ronda TERMINADA: se guarda larga y no se vuelve a pedir enseguida.
    responder = () => new Response(pgn('1-0', '1/2-1/2', '0-1'), { status: 200 });
    let v = await libc(ronda('fin1'));
    chk(v.status === 200 && pedidos.length === 1, 'la ronda terminada se baja la primera vez');
    const copiaFin = guardado.get('https://cr-proxy.test/libc?url=' + encodeURIComponent(ronda('fin1')));
    chk(!!copiaFin && copiaFin.headers.get('Cache-Control') === 'public, max-age=604800' && copiaFin.headers.get('x-fa-fresh') === '3600',
        'y queda guardada en el borde por 7 días (fresca 1 hora)', copiaFin && copiaFin.headers.get('Cache-Control'));
    let antes = pedidos.length;
    reloj += 11_000; await libc(ronda('fin1'));
    reloj += 58 * 60_000; v = await libc(ronda('fin1'));
    chk(pedidos.length === antes && v.status === 200, 'durante la primera hora no se le vuelve a pedir a Lichess (antes: a los 10 s)', pedidos.length - antes);
    reloj += 3 * 60_000; v = await libc(ronda('fin1'));
    chk(pedidos.length === antes + 1 && v.status === 200, 'pasada la hora se revisa por detrás, por si corrigieron un resultado');
    reloj += 6 * 24 * 3600_000; v = await libc(ronda('fin1'));
    chk(v.status === 200 && /1\/2-1\/2/.test(v.cuerpo), 'y días después se sigue sirviendo al toque, sin los 40 s');

    // 2) Ronda EN VIVO (alguna "*"): exactamente como antes, se refresca a los 10 s.
    responder = () => new Response(pgn('1-0', '*'), { status: 200 });
    await libc(ronda('vivo1'));
    antes = pedidos.length;
    reloj += 11_000; await libc(ronda('vivo1'));
    chk(pedidos.length === antes + 1, 'una ronda en vivo se sigue refrescando a los 10 s, como siempre');

    // 3) Arranque en frío: las 4 partes de una ronda llegan juntas. Lichess atiende una (lenta) y rebota
    //    las otras con 429. Ese choque NO es un freno de verdad: no tiene que armar la pausa del minuto.
    let soltarLenta;
    const lenta = new Promise((ok) => { soltarLenta = ok; });
    responder = (url) => url.includes('parteA') ? lenta.then(() => new Response(pgn('1-0'), { status: 200 }))
                                                : new Response('{"error":"Too many requests"}', { status: 429 });
    const pA = pedirLibc(ronda('parteA'));
    await new Promise((ok) => setTimeout(ok, 0));
    const otras = await Promise.all(['parteB', 'parteC', 'parteD'].map((p) => pedirLibc(ronda(p))));
    chk(otras.every((r) => r.status === 429), 'las partes que chocaron le devuelven 429 a la app (que las reintenta de a una)');
    chk(!hayPausa(), 'y ese choque NO arma la pausa: las transmisiones en vivo siguen actualizando');

    // 4) Mientras esa exportación lenta sigue andando, el refresco de fondo de otra ronda no se larga
    //    (chocaría): se sirve la copia y se refresca en el sondeo siguiente.
    antes = pedidos.length;
    reloj += 11_000;
    v = await pedirLibc(ronda('vivo1'));
    chk(v.status === 200 && pedidos.length === antes, 'con una exportación en curso, el refresco de fondo espera (se sirve la copia)');
    soltarLenta(); await pA; await Promise.all(pendientes.splice(0));
    responder = () => new Response(pgn('1-0', '0-1'), { status: 200 });
    v = await libc(ronda('parteB'));
    chk(v.status === 200 && /0-1/.test(v.cuerpo), 'terminada la lenta, el reintento de la app entra bien');
    antes = pedidos.length;
    reloj += 11_000; await libc(ronda('vivo1'));
    chk(pedidos.length === antes + 1, 'y el refresco de fondo vuelve a andar');

    // 5) Un 429 SIN choque (no había nada andando) sí es un freno de verdad: arma la pausa.
    responder = () => new Response('{"error":"Too many requests"}', { status: 429 });
    await libc(ronda('nueva'));
    chk(hayPausa(), 'un 429 sin ninguna otra exportación en curso sí arma la pausa del minuto');

    // 6) Si una partida no trae resultado, no se la da por terminada (se trata como en vivo).
    reloj += 61_000;
    responder = () => new Response('[Event "X"]\n[White "A"]\n[Black "B"]\n\n1. e4 *', { status: 200 });
    await libc(ronda('sinResult'));
    antes = pedidos.length;
    reloj += 11_000; await libc(ronda('sinResult'));
    chk(pedidos.length === antes + 1, 'un PGN sin la etiqueta de resultado no se guarda como terminado');
  } finally {
    globalThis.caches = cachesAntes; globalThis.fetch = fetchAntes; Date.now = nowAntes;
  }
}

// ── Una exportación colgada no congela el vivo (14/09/2026) ─────────────────────────────────────────
// Juegos Suramericanos, 960 blitz: la copia de la ronda 6 quedó en la jugada 2 mientras Lichess iba por la
// 20 ("se cortan en la apertura"). El refresco de fondo se salteaba por "otra exportación en curso" y la
// bajada a Lichess no tenía tiempo límite: una colgada frenaba TODO. Lichess de mentira que nunca contesta.
{
  console.log('\n=== 12b. Lichess: una exportación colgada no congela el vivo ===');
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches, fetchAntes = globalThis.fetch, nowAntes = Date.now;
  const stAntes = globalThis.setTimeout, ctAntes = globalThis.clearTimeout;
  globalThis.caches = { default: cacheFalsa };
  let reloj = 3_000_000_000_000;
  Date.now = () => reloj;
  const pedidos = [];
  let conSenal = 0;
  let responder = () => new Response('', { status: 500 });
  globalThis.fetch = async (url, opts) => { pedidos.push(String(url)); if (opts && opts.signal) conSenal++; return responder(String(url), opts); };
  const pendientes = [];
  const ctxLi = { waitUntil(p) { pendientes.push(p); } };
  const pedirLibc = (url) => worker.fetch(req('/libc?url=' + encodeURIComponent(url)), env, ctxLi);
  const ronda = (id) => 'https://lichess.org/api/broadcast/round/' + id + '.pgn';
  const vivo = (j) => '[Event "X"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 * jugada-' + j;
  try {
    let jugada = 2;
    responder = (url, opts) => url.includes('colgada')
      ? new Promise((_, no) => opts.signal.addEventListener('abort', () => no(new Error('timeout'))))
      : new Response(vivo(jugada), { status: 200 });
    let r = await pedirLibc(ronda('r6')); await Promise.all(pendientes.splice(0));
    chk(r.status === 200 && /jugada-2/.test(await r.text()) && r.headers.get('x-fa-estado') === 'nueva',
        'la ronda en vivo se baja (y avisa que es copia nueva)', r.headers.get('x-fa-estado'));
    chk(conSenal === pedidos.length, 'toda bajada a Lichess va con tiempo límite', conSenal + '/' + pedidos.length);

    // Una exportación que se cuelga. Su timer se captura para dispararlo a mano (sin esperar 45 s de verdad).
    const timers = [];
    globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    globalThis.clearTimeout = () => {};
    const pColgada = pedirLibc(ronda('colgada'));
    for (let i = 0; i < 200 && !pedidos.some((u) => u.includes('colgada')); i++) await Promise.resolve();
    globalThis.setTimeout = stAntes; globalThis.clearTimeout = ctAntes;
    chk(timers.some((t) => t.ms === 45000), 'la bajada colgada tiene su tiempo límite de 45 s');

    // Con la colgada andando y la copia de 11 s: se sirve la copia, como antes.
    jugada = 5; reloj += 11_000;
    let antes = pedidos.length;
    r = await pedirLibc(ronda('r6')); await Promise.all(pendientes.splice(0));
    chk(pedidos.length === antes && r.headers.get('x-fa-estado') === 'vieja-ocupado',
        'con otra exportación andando y la copia de 11 s, se sirve la copia (igual que antes)', r.headers.get('x-fa-estado'));

    // 25 s más (copia de 36 s): antes quedaba congelada; ahora se refresca igual.
    reloj += 25_000; antes = pedidos.length;
    r = await pedirLibc(ronda('r6')); await Promise.all(pendientes.splice(0));
    chk(pedidos.length === antes + 1 && r.headers.get('x-fa-estado') === 'vieja-refrescando' && r.headers.get('x-fa-edad') === '36',
        '🔒 si la copia ya tiene más de 30 s se refresca aunque haya otra exportación colgada',
        r.headers.get('x-fa-estado') + ' ' + r.headers.get('x-fa-edad') + 's');
    r = await pedirLibc(ronda('r6'));
    chk(/jugada-5/.test(await r.text()), 'y al pedido siguiente ya llega la jugada nueva');

    // Pasan los 45 s: la colgada se corta con error y libera el lugar.
    timers.find((t) => t.ms === 45000).fn();
    const rc = await pColgada;
    chk(rc.status === 502, '🔒 a los 45 s la bajada colgada se corta con error (la app reintenta)', rc.status);
    jugada = 7; reloj += 11_000; antes = pedidos.length;
    r = await pedirLibc(ronda('r6')); await Promise.all(pendientes.splice(0));
    chk(pedidos.length === antes + 1 && r.headers.get('x-fa-estado') === 'vieja-refrescando',
        'cortada la colgada, el refresco de fondo vuelve a andar con la copia recién vencida', r.headers.get('x-fa-estado'));
    chk(/x-fa-estado/.test(r.headers.get('Access-Control-Expose-Headers') || ''),
        'el navegador puede leer el diagnóstico (edad y estado de la copia)');
  } finally {
    globalThis.caches = cachesAntes; globalThis.fetch = fetchAntes; Date.now = nowAntes;
    globalThis.setTimeout = stAntes; globalThis.clearTimeout = ctAntes;
  }
}

// ── Dos isolates del mismo colo no exportan a la vez (16/09/2026) ──────────────────────────────────────
// Olimpiada de Samarcanda: 9 transmisiones. El colo de Buenos Aires corre varios isolates y cada uno sólo
// veía SUS exportaciones: dos refrescaban juntas, Lichess rebotaba la segunda con 429, ese isolate lo tomaba
// como freno de verdad y pausaba un minuto a TODOS. Las copias vivían en `vieja-pausa`, 1 a 6 min atrasadas.
// Dos isolates = el mismo Worker importado dos veces (cada import tiene su propia memoria), con la caché
// del borde compartida.
{
  console.log('\n=== 12c. Lichess: dos isolates del colo no exportan a la vez ===');
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches, fetchAntes = globalThis.fetch, nowAntes = Date.now;
  globalThis.caches = { default: cacheFalsa };
  let reloj = 4_000_000_000_000;
  Date.now = () => reloj;
  const pedidos = [];
  let lichessOcupado = false;     // Lichess de mentira: UNA exportación por vez, a la segunda le da 429
  const soltar = [];              // exportaciones que quedan "andando" hasta que la prueba las suelta
  let lenta = false;
  const vivo = (id, j) => '[Event "X"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 * ' + id + '-jugada-' + j;
  let jugada = 1;
  globalThis.fetch = async (url) => {
    url = String(url); pedidos.push(url);
    if (lichessOcupado) return new Response('{"error":"Too many requests"}', { status: 429 });
    const id = (url.match(/round\/(\w+)\.pgn/) || [])[1];
    const cuerpo = vivo(id, jugada);
    if (!lenta) return new Response(cuerpo, { status: 200 });
    lichessOcupado = true;
    await new Promise((ok) => soltar.push(ok));
    lichessOcupado = false;
    return new Response(cuerpo, { status: 200 });
  };
  const A = worker;
  const B = (await import('./cr-proxy-worker.js?isolate=B')).default;
  const pendientes = [];
  const ctxLi = { waitUntil(p) { pendientes.push(p); } };
  const ronda = (id) => 'https://lichess.org/api/broadcast/round/' + id + '.pgn';
  const pedirEn = (w, id) => w.fetch(req('/libc?url=' + encodeURIComponent(ronda(id))), env, ctxLi);
  const hayPausa = () => guardado.has('https://cr-proxy.test/__li429pausa');
  const esperar = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
  try {
    // Las dos transmisiones ya tienen copia (bajadas cuando Lichess estaba libre).
    await pedirEn(A, 'open1'); await pedirEn(B, 'open2'); await Promise.all(pendientes.splice(0));
    chk(pedidos.length === 2, 'las dos transmisiones tienen su copia', pedidos.length);

    // 11 s después: el isolate A arranca el refresco de Open I, que tarda (Lichess exporta 10 partidas/s).
    reloj += 11_000; jugada = 2; lenta = true;
    let r = await pedirEn(A, 'open1');
    chk(r.headers.get('x-fa-estado') === 'vieja-refrescando', 'el isolate A refresca Open I de fondo', r.headers.get('x-fa-estado'));
    await esperar();
    chk(pedidos.length === 3 && soltar.length === 1, 'y esa exportación queda andando en Lichess', pedidos.length);

    // Mientras tanto, al isolate B le piden Open II (copia de 11 s). ANTES: la refrescaba, chocaba y pausaba.
    reloj += 2_000;
    r = await pedirEn(B, 'open2'); await esperar();
    chk(pedidos.length === 3, '🔒 el isolate B VE la exportación del A y no larga otra encima', pedidos.length);
    chk(r.status === 200 && r.headers.get('x-fa-estado') === 'vieja-ocupado', 'B sirve su copia y avisa que Lichess está ocupado', r.headers.get('x-fa-estado'));
    chk(!hayPausa(), '🔒 y no se arma la pausa del minuto');

    // Un primer visitante SIN copia en B (Open III) sí va a Lichess, choca, y ese 429 tampoco pausa.
    lenta = false;
    r = await pedirEn(B, 'open3'); await esperar();
    chk(r.status === 429, 'una transmisión sin copia en B se intenta igual (y choca)', r.status);
    chk(!hayPausa(), '🔒 ese choque con el isolate A tampoco arma la pausa');

    // Termina la exportación de A: la anotación se libera y B ya puede refrescar Open II.
    lenta = false; soltar.shift()(); await esperar(); await Promise.all(pendientes.splice(0));
    r = await pedirEn(A, 'open1');
    chk(/open1-jugada-2/.test(await r.text()), 'A guardó la jugada nueva de Open I');
    const antes = pedidos.length;
    r = await pedirEn(B, 'open2'); await Promise.all(pendientes.splice(0));
    chk(pedidos.length === antes + 1 && r.headers.get('x-fa-estado') === 'vieja-refrescando',
        '🔒 terminada la de A, B refresca Open II enseguida', r.headers.get('x-fa-estado'));
    r = await pedirEn(B, 'open2');
    chk(/open2-jugada-2/.test(await r.text()), 'y Open II ya muestra la jugada nueva');

    // Una exportación del otro isolate que quedó anotada y nunca se liberó no frena más de 30 s.
    await cacheFalsa.put('https://cr-proxy.test/__liexport', new Response('', { headers: { 'x-fa-desde': String(reloj) } }));
    reloj += 11_000;
    r = await pedirEn(B, 'open2'); await Promise.all(pendientes.splice(0));
    chk(r.headers.get('x-fa-estado') === 'vieja-ocupado', 'con una anotación de hace 11 s, B espera', r.headers.get('x-fa-estado'));
    reloj += 25_000;
    r = await pedirEn(B, 'open2'); await Promise.all(pendientes.splice(0));
    chk(r.headers.get('x-fa-estado') === 'vieja-refrescando', '🔒 una anotación olvidada de hace 36 s ya no frena', r.headers.get('x-fa-estado'));
  } finally {
    globalThis.caches = cachesAntes; globalThis.fetch = fetchAntes; Date.now = nowAntes;
  }
}

// ── Por turno: se refresca primero la copia más atrasada (16/09/2026) ──────────────────────────────────
// Con la fila, al liberarse Lichess ganaba el primer pedido en llegar, y la app pide siempre en el mismo
// orden: Open I se refrescaba cada 30 s y Women IV llegó a 10 min de atraso (y ahí se borraba la copia).
{
  console.log('\n=== 12d. Lichess: por turno, la copia más atrasada primero ===');
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches, fetchAntes = globalThis.fetch, nowAntes = Date.now;
  globalThis.caches = { default: cacheFalsa };
  let reloj = 5_000_000_000_000;
  Date.now = () => reloj;
  const pedidos = [];
  globalThis.fetch = async (url) => { pedidos.push(String(url)); return new Response('[Event "X"]\n[Result "*"]\n\n1. e4 *', { status: 200 }); };
  const pendientes = [];
  const ctxLi = { waitUntil(p) { pendientes.push(p); } };
  const ronda = (id) => 'https://lichess.org/api/broadcast/round/' + id + '.pgn';
  const libc = async (id) => {
    const r = await worker.fetch(req('/libc?url=' + encodeURIComponent(ronda(id))), env, ctxLi);
    await Promise.all(pendientes.splice(0));
    return r.headers.get('x-fa-estado');
  };
  const bajo = (id) => pedidos.some((u) => u.includes('/' + id + '.pgn'));
  try {
    await libc('womenIV');                 // la más vieja
    reloj += 40_000; await libc('openI');  // 40 s más nueva
    reloj += 11_000;
    await libc('womenIV');                 // queda anotada su edad... y como es la más vieja, se refresca
    chk(pedidos.filter((u) => u.includes('womenIV')).length === 2, 'la copia más atrasada (Women IV) se refresca');
    // Otra vuelta: ahora Women IV está al día y Open I es la atrasada. Llega primero el pedido de Women IV.
    reloj += 11_000; pedidos.length = 0;
    let e = await libc('openI');
    chk(e === 'vieja-refrescando' && bajo('openI'), 'Open I, ahora la más atrasada, se refresca', e);

    // El caso de la Olimpiada: Open I (al día, pero vencida) llega primero; Women IV lleva más atraso.
    reloj += 30_000; pedidos.length = 0;
    await libc('womenIV');                 // anota su atraso (y se refresca: es la más vieja)
    reloj += 1_000; pedidos.length = 0;
    // Open I vence recién ahora; si alguna otra pedida hace poco lleva más atraso, espera su turno.
    guardado.set('https://cr-proxy.test/__liturno', new Response(JSON.stringify({
      ['https://cr-proxy.test/libc?url=' + encodeURIComponent(ronda('womenV'))]: { f: reloj - 120_000, v: reloj - 2_000 },
    })));
    e = await libc('openI');
    chk(e === 'vieja-turno' && !bajo('openI'), '🔒 Open I espera: hay otra transmisión con 2 min de atraso', e);
    reloj += 61_000; pedidos.length = 0;
    e = await libc('openI');
    chk(e === 'vieja-refrescando' && bajo('openI'), 'si esa otra transmisión deja de pedirse (1 min), no frena más', e);

    // Una ronda terminada (fresca 1 h) no le gana el turno a las que están en vivo.
    const copiaVieja = guardado.get('https://cr-proxy.test/libc?url=' + encodeURIComponent(ronda('openI')));
    chk(!!copiaVieja, 'las copias quedan guardadas con la ventana de gracia de 30 min',
        copiaVieja && copiaVieja.headers.get('Cache-Control'));
    chk(copiaVieja && copiaVieja.headers.get('Cache-Control') === 'public, max-age=1810',
        '🔒 la copia en vivo dura 30 min (eran 10: con Lichess frenando se borraba)', copiaVieja && copiaVieja.headers.get('Cache-Control'));
  } finally {
    globalThis.caches = cachesAntes; globalThis.fetch = fetchAntes; Date.now = nowAntes;
  }
}

// ── Partidas de Chess-Results (/crpgn): guardadas una semana si hay, cortas si no (13/09/2026) ────────
// Los organizadores suben partidas cada tanto; cada pedido no guardado le cuesta a Chess-Results dos
// (formulario + descarga). Lo que se acordó con el autor: sin partidas, caché corta como siempre (una
// respuesta vacía guardada una semana escondería lo que suban después); con partidas, 7 días, revisando
// por detrás a lo sumo una vez por hora por si agregaron más.
{
  console.log('\n=== 13. Chess-Results: partidas guardadas una semana ===');
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches, fetchAntes = globalThis.fetch, nowAntes = Date.now;
  globalThis.caches = { default: cacheFalsa };
  let reloj = 3_000_000_000_000;
  Date.now = () => reloj;
  let visitasCR = 0, pgnEnCR = '', crCaido = false;
  const FORM = '<form><input type="hidden" name="__VIEWSTATE" value="x"><input type="submit" name="P1$cb_DownLoadPGN" value="Descargar"></form>';
  globalThis.fetch = async (url, opt) => {
    visitasCR++;
    if (crCaido) throw new Error('caído');
    if (!opt || opt.method !== 'POST') return new Response(FORM, { status: 200 });
    return new Response(pgnEnCR || '<html>sin resultados</html>', { status: 200 });
  };
  const pendientes = [];
  const ctxCr = { waitUntil(p) { pendientes.push(p); } };
  const crpgn = async (q) => {
    const r = await worker.fetch(req('/crpgn?' + q), env, ctxCr);
    await Promise.all(pendientes.splice(0));
    return { status: r.status, cuerpo: await r.text(), cc: r.headers.get('Cache-Control') };
  };
  const partidas = (n) => Array.from({ length: n }, (_, i) => '[Event "Nacional"]\n[Round "1"]\n[White "B' + i + '"]\n[Black "N' + i + '"]\n[Result "1-0"]\n\n1. e4 1-0').join('\n\n');
  try {
    // 1) Sin partidas: caché corta, como siempre.
    pgnEnCR = '';
    let v = await crpgn('tnr=111&rd=1');
    const copiaVacia = guardado.get('https://cr-proxy.test/crpgn?tnr=111&host=chess-results.com&rd=1');
    chk(v.status === 200 && v.cuerpo === '' && copiaVacia && copiaVacia.headers.get('Cache-Control') === 'public, max-age=1800',
        'sin partidas: la respuesta vacía se guarda media hora (no una semana)', copiaVacia && copiaVacia.headers.get('Cache-Control'));

    // 2) Con partidas: 7 días.
    pgnEnCR = partidas(3);
    visitasCR = 0;
    v = await crpgn('tnr=222&rd=1');
    const copia = guardado.get('https://cr-proxy.test/crpgn?tnr=222&host=chess-results.com&rd=1');
    chk(v.status === 200 && (v.cuerpo.match(/\[Event /g) || []).length === 3 && visitasCR === 2,
        'con partidas: la primera visita baja de Chess-Results (formulario + descarga)', visitasCR);
    chk(copia && copia.headers.get('Cache-Control') === 'public, max-age=604800' && v.cc === 'public, max-age=120',
        '🔒 y queda guardada 7 días, pero al navegador del visitante se le dice 2 minutos', copia && copia.headers.get('Cache-Control'));

    // 3) Durante la primera hora, ni un pedido a Chess-Results.
    let antes = visitasCR;
    reloj += 5 * 60_000; await crpgn('tnr=222&rd=1');
    reloj += 50 * 60_000; v = await crpgn('tnr=222&rd=1');
    chk(visitasCR === antes && (v.cuerpo.match(/\[Event /g) || []).length === 3, 'durante la primera hora no se le pide nada a Chess-Results', visitasCR - antes);

    // 4) Pasada la hora: se sirve al instante lo guardado y se revisa por detrás. Subieron más partidas.
    pgnEnCR = partidas(5);
    reloj += 6 * 60_000; antes = visitasCR;
    v = await crpgn('tnr=222&rd=1');
    chk((v.cuerpo.match(/\[Event /g) || []).length === 3 && visitasCR === antes + 2,
        'pasada la hora se sirve lo guardado al instante y se revisa por detrás');
    v = await crpgn('tnr=222&rd=1');
    chk((v.cuerpo.match(/\[Event /g) || []).length === 5, '🔒 y las partidas que el organizador agregó aparecen en la visita siguiente', (v.cuerpo.match(/\[Event /g) || []).length);

    // 5) Si la revisión falla, no se pierde la copia buena ni se reintenta en cada visita.
    crCaido = true;
    reloj += 61 * 60_000; await crpgn('tnr=222&rd=1');
    antes = visitasCR;
    reloj += 60_000; v = await crpgn('tnr=222&rd=1');
    chk((v.cuerpo.match(/\[Event /g) || []).length === 5 && visitasCR === antes,
        'con Chess-Results caído se sigue sirviendo la copia buena, sin reintentar en cada visita');

    // 6) Una revisión que vuelve vacía no pisa las partidas guardadas.
    crCaido = false; pgnEnCR = '';
    reloj += 61 * 60_000; await crpgn('tnr=222&rd=1');
    v = await crpgn('tnr=222&rd=1');
    chk((v.cuerpo.match(/\[Event /g) || []).length === 5, 'una revisión que vuelve vacía no borra las partidas guardadas');

    // 7) Días después sigue ahí, al instante.
    pgnEnCR = partidas(5);
    reloj += 6 * 24 * 3600_000; v = await crpgn('tnr=222&rd=1');
    chk(v.status === 200 && (v.cuerpo.match(/\[Event /g) || []).length === 5, 'y días después se sigue sirviendo al toque');
  } finally {
    globalThis.caches = cachesAntes; globalThis.fetch = fetchAntes; Date.now = nowAntes;
  }
}

// ── Auditoría del 23/09/2026 — Fase 1: las puertas abiertas del Worker de cuentas ─────────────────
console.log('\n=== 14. /puzhit: sólo cuentan los ejercicios que existen, con freno ===');
{
  const hit = (id, r, ip, extra) => pedir('/puzhit?id=' + encodeURIComponent(id) + '&r=' + r + (extra || ''), { ip });
  const fila = (id) => DB.tablas.puz_stats.find((x) => x.id === id);
  chk(EJ_LARGO.length > 80, 'el ejercicio de prueba tiene un id de más de 80 letras', EJ_LARGO.length);

  let r = await hit('inventado-por-un-script', 'ok', '9.0.0.1');
  chk(r.status === 200 && !fila('inventado-por-un-script'), '🔒 un id que no existe NO crea fila (antes sí: la tabla crecía sin tope)');
  r = await hit('ej-uno', 'ok', '9.0.0.1', '&vr=1500');
  chk(r.status === 200 && fila('ej-uno') && fila('ej-uno').ok === 1, 'un ejercicio que existe suma normal');
  await hit('ej-uno', 'ok', '9.0.0.1', '&vr=1500');
  chk(fila('ej-uno').ok === 1, '🔒 el mismo visitante no cuenta dos veces el mismo ejercicio', fila('ej-uno').ok);
  await hit('ej-uno', 'fail', '9.0.0.2', '&vr=1500');
  chk(fila('ej-uno').fail === 1, 'otro visitante sí cuenta');
  const antes = fila('ej-uno').rating;
  await hit('ej-uno', 'fail', '9.0.0.3', '&vr=999999');
  chk(fila('ej-uno').fail === 2 && fila('ej-uno').rating === antes, '🔒 un rating de visitante imposible suma el intento pero NO mueve la dificultad');

  let frenados = 0;
  for (let i = 0; i < 35; i++) { const x = await hit('ej-dos', 'ok', '9.0.0.9', '&n=' + i); if (x.status === 429) frenados++; }
  chk(frenados > 0, '🔒 una misma IP que machaca recibe 429', frenados);

  chk(pedidosLista === 1, 'la lista de ejercicios se bajó UNA sola vez (queda en memoria media hora)', pedidosLista);

  // El id largo: la fila vieja estaba cortada a 80 y la web nunca la encontraba.
  await hit(EJ_LARGO, 'ok', '9.0.0.4', '&vr=1500');
  chk(!fila(EJ_LARGO.slice(0, 80)) && fila(EJ_LARGO) && fila(EJ_LARGO).ok === 8,
      '🔒 la fila cortada se renombra al id entero y conserva lo que tenía (7 + 1)', fila(EJ_LARGO) && fila(EJ_LARGO).ok);
}

console.log('\n=== 15. /puzstats: guardada en el borde y con los ids enteros ===');
{
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches;
  globalThis.caches = { default: cacheFalsa };
  try {
    // Otra fila cortada que todavía no se renombró: igual tiene que salir con el id entero.
    DB.tablas.puz_stats.find((x) => x.id === EJ_LARGO).id = EJ_LARGO.slice(0, 80);
    const pend = [];
    const c = { waitUntil(p) { pend.push(p); } };
    const leer = async () => { const x = await worker.fetch(req('/puzstats'), env, c); await Promise.all(pend.splice(0)); return json(x); };
    const l0 = DB.stats.lecturasPuz || 0;
    const d1 = await leer();
    chk(d1[EJ_LARGO] && d1[EJ_LARGO].ok === 8 && !d1[EJ_LARGO.slice(0, 80)],
        '🔒 la estadística de un ejercicio de id largo sale con el id que busca la web (329 de 1.400 no la mostraban)');
    await leer(); await leer();
    chk((DB.stats.lecturasPuz || 0) - l0 === 1, '🔒 tres visitas seguidas leen la tabla UNA sola vez (antes, una por visita)', (DB.stats.lecturasPuz || 0) - l0);
  } finally { globalThis.caches = cachesAntes; }
}

console.log('\n=== 16. /puzhit sin la lista de ejercicios: no se crean filas ===');
{
  listaEjCaida = true;
  const w2 = (await import('./cr-proxy-worker.js?sin-lista')).default;   // un Worker "recién arrancado", sin lista en memoria
  const hit2 = (id, ip) => w2.fetch(req('/puzhit?id=' + encodeURIComponent(id) + '&r=ok', { ip }), env, ctx);
  const n0 = DB.tablas.puz_stats.length;
  await hit2('otro-inventado', '9.1.0.1');
  chk(DB.tablas.puz_stats.length === n0, '🔒 sin poder comprobar la lista, un id nuevo no crea fila');
  const okAntes = DB.tablas.puz_stats.find((x) => x.id === 'ej-dos').ok;
  await hit2('ej-dos', '9.1.0.2');
  chk(DB.tablas.puz_stats.find((x) => x.id === 'ej-dos').ok === okAntes + 1, 'pero un ejercicio que ya tenía fila sigue sumando');
  listaEjCaida = false;
}

console.log('\n=== 17. El progreso de ejercicios no se puede inflar (ranking de Táctica) ===');
{
  const H = { Authorization: 'Bearer sess-eva', 'Content-Type': 'application/json' };
  const guardar = async (o) => json(await pedir('/puz/progress', { method: 'POST', headers: H, body: JSON.stringify(o) }));
  let d = await guardar({ solved: 99999, n: 99999, ok: 99999, fail: 0, rating: 9999, best: 9999, bestStreak: 99999,
    days: { '2026-09-01': 5000, 'basura': 3, '1999-01-01': 2 },
    byLevel: { inicial: { ok: 80000, n: 90000 }, avanzado: { ok: 1, n: 2 } } });
  const p = d.progress || {};
  chk(p.solved <= EJ_LISTA.puzzles.length + 50, '🔒 los resueltos no pueden superar los ejercicios publicados', p.solved);
  chk(p.rating === 3200 && p.best === 3200, '🔒 el rating de táctica queda entre 100 y 3200', p.rating);
  chk(p.bestStreak <= p.solved && p.ok <= p.solved, '🔒 la racha y los aciertos no superan los resueltos', p.bestStreak + '/' + p.ok);
  chk(p.days['2026-09-01'] === 400 && !('basura' in p.days) && !('1999-01-01' in p.days), '🔒 el calendario sólo acepta fechas de verdad y hasta 400 por día', JSON.stringify(p.days));
  chk(p.byLevel.inicial.n <= p.solved && p.byLevel.avanzado.n === 2, 'los niveles tampoco superan los resueltos, y lo chico queda igual');
  const fila = DB.tablas.user_puzzle.find((x) => x.user_id === 'u_eva');
  chk(fila && fila.solved === p.solved, 'y la columna que usa el ranking guarda el número ya recortado', fila && fila.solved);
}

console.log('\n=== 18. La fusión entre aparatos ya no borra los resueltos por nivel ===');
{
  const H = { Authorization: 'Bearer sess-mod', 'Content-Type': 'application/json' };
  const guardar = async (o) => json(await pedir('/puz/progress', { method: 'POST', headers: H, body: JSON.stringify(o) }));
  // Lo que manda el navegador de verdad: los niveles son { ok, n }.
  await guardar({ solved: 30, n: 30, ok: 25, fail: 5, rating: 1400, byLevel: { inicial: { ok: 20, n: 22 }, aficionado: { ok: 5, n: 8 } } });
  const d = await guardar({ solved: 12, n: 12, ok: 10, fail: 2, rating: 1300, byLevel: { inicial: { ok: 9, n: 10 }, avanzado: { ok: 1, n: 2 } } });
  const lv = (d.progress || {}).byLevel || {};
  chk(lv.inicial && lv.inicial.n === 22 && lv.inicial.ok === 20, '🔒 cada nivel se queda con lo mejor de los dos aparatos (antes quedaba en 0)', JSON.stringify(lv.inicial));
  chk(lv.aficionado && lv.aficionado.n === 8 && lv.avanzado && lv.avanzado.n === 2, 'y no se pierde ningún nivel de ninguno de los dos');
  // Una cuenta que ya quedó con ceros (el bug viejo) se recupera sola con lo que traiga el navegador.
  const fila = DB.tablas.user_puzzle.find((x) => x.user_id === 'u_mod');
  const blob = JSON.parse(fila.data); blob.byLevel = { inicial: 0, aficionado: 0 }; fila.data = JSON.stringify(blob);
  const d2 = await guardar({ solved: 31, n: 31, ok: 26, fail: 5, rating: 1410, byLevel: { inicial: { ok: 21, n: 23 } } });
  chk(d2.progress.byLevel.inicial.n === 23, 'un nivel que quedó en 0 por el bug vuelve a tomar el valor que manda el navegador', JSON.stringify(d2.progress.byLevel.inicial));
}

console.log('\n=== 19. Proxys: la caché no se puede esquivar (y /crpgn no va a cualquier sitio) ===');
{
  const guardado = new Map();
  const cacheFalsa = {
    async match(k) { const r = guardado.get(typeof k === 'string' ? k : k.url); return r ? r.clone() : undefined; },
    async put(k, r) { guardado.set(typeof k === 'string' ? k : k.url, r.clone()); },
  };
  const cachesAntes = globalThis.caches, fetchAntes = globalThis.fetch;
  globalThis.caches = { default: cacheFalsa };
  const afuera = [];
  globalThis.fetch = async (url) => {
    const u = String(url); afuera.push(u);
    if (u.includes('/round/noexiste.pgn')) return new Response('{"error":"Not found"}', { status: 404 });
    if (u.includes('lichess.org')) return new Response('[Event "X"]\n[Result "*"]\n\n1. e4 *', { status: 200 });
    if (u.includes('sichess.com')) return new Response('[Event "S"]', { status: 200 });
    return new Response('<html></html>', { status: 200 });
  };
  const pend = [];
  const c = { waitUntil(p) { pend.push(p); } };
  const ir = async (path, ip) => { const r = await worker.fetch(req(path, { ip: ip || '8.8.0.1' }), env, c); await Promise.all(pend.splice(0)); return r; };
  const ronda = 'https://lichess.org/api/broadcast/round/abcd1234.pgn';
  try {
    await ir('/libc?url=' + encodeURIComponent(ronda));
    await ir('/libc?url=' + encodeURIComponent(ronda + '?x=1'));
    await ir('/libc?url=' + encodeURIComponent(ronda) + '&z=2');
    await ir('/libc?url=' + encodeURIComponent(ronda + '#y'));
    chk(afuera.filter((u) => u.includes('abcd1234')).length === 1, '🔒 /libc: agregarle cosas a la dirección ya no crea copias nuevas (un solo pedido a Lichess)', afuera.filter((u) => u.includes('abcd1234')).length);
    chk(!afuera.some((u) => u.includes('?x=1')), 'y a Lichess le llega la dirección limpia, sin lo agregado');
    let r = await ir('/libc?url=' + encodeURIComponent('https://lichess.org/api/broadcast/top'));
    chk(r.status === 200 || r.status === 403, 'una ficha de torneo (una sola palabra) sigue pasando', r.status);
    r = await ir('/libc?url=' + encodeURIComponent('https://lichess.org/api/broadcast/by/alguien/page/2'));
    chk(r.status === 403, '🔒 /libc: una ruta que la app no usa se rechaza', r.status);
    const n0 = afuera.length;
    r = await ir('/libc?url=' + encodeURIComponent('https://lichess.org/api/broadcast/round/noexiste.pgn'));
    const r2 = await ir('/libc?url=' + encodeURIComponent('https://lichess.org/api/broadcast/round/noexiste.pgn'));
    chk(r.status === 404 && r2.status === 404 && afuera.length - n0 === 1, '🔒 una ronda que no existe se recuerda un minuto: no se le vuelve a preguntar a Lichess', afuera.length - n0);
    let frenados = 0;
    for (let i = 0; i < 70; i++) { const x = await ir('/libc?url=' + encodeURIComponent('https://lichess.org/api/broadcast/round/zz' + i + '.pgn'), '8.8.0.66'); if (x.status === 429) frenados++; }
    chk(frenados > 0, '🔒 una IP que pide rondas nuevas sin parar recibe 429 (lo guardado se sigue sirviendo sin límite)', frenados);

    const si = 'https://sichess.com/games/evento/01/games.pgn';
    const s0 = afuera.filter((u) => u.includes('sichess')).length;
    await ir('/sipgn?url=' + encodeURIComponent(si)); await ir('/sipgn?url=' + encodeURIComponent(si + '?r=1')); await ir('/sipgn?url=' + encodeURIComponent(si) + '&q=2');
    chk(afuera.filter((u) => u.includes('sichess')).length - s0 === 1, '🔒 /sipgn: tampoco se puede esquivar la caché');

    const cr = 'https://chess-results.com/tnr1.aspx?lan=2&art=1';
    const c0 = afuera.filter((u) => u.includes('chess-results')).length;
    await ir('/?url=' + encodeURIComponent(cr)); await ir('/?url=' + encodeURIComponent(cr) + '&basura=1');
    chk(afuera.filter((u) => u.includes('chess-results')).length - c0 === 1, '🔒 proxy de Chess-Results: lo agregado afuera de la dirección no crea copias');

    r = await ir('/crpgn?tnr=1&host=' + encodeURIComponent('example.com?.chess-results.com'));
    chk(r.status === 403 && !afuera.some((u) => u.includes('example.com')), '🔒 /crpgn: "otrositio.com?.chess-results.com" se rechaza (antes el Worker iba a otrositio.com)', r.status);
    r = await ir('/crpgn?tnr=1&host=' + encodeURIComponent('example.com#.chess-results.com'));
    chk(r.status === 403, '🔒 lo mismo con "#"', r.status);
    r = await ir('/crpgn?tnr=1&host=s2.chess-results.com');
    chk(r.status === 200 && afuera.some((u) => u.startsWith('https://s2.chess-results.com/')), 'un nodo de verdad (s2.chess-results.com) sigue andando', r.status);
  } finally { globalThis.caches = cachesAntes; globalThis.fetch = fetchAntes; }
}

console.log('\n=== 20. Rating: dos partidas que terminan juntas suman las dos ===');
{
  const H = { 'X-Vivo-Secret': 'secreto-vivo', 'Content-Type': 'application/json' };
  const fila = () => DB.tablas.ratings.find((r) => r.user_id === 'u_dani' && r.category === 'rapid');
  const rep = (id, rival) => pedir('/rating/report', { method: 'POST', headers: H,
    body: JSON.stringify({ gameId: id, white: 'u_dani', black: rival, result: 'w', base: 900, inc: 0, moves: 'e4 e5 Nf3 Nc6 Bb5 a6' }) });
  await rep('carrera0', 'u_x1');
  const base = fila().rating;
  // Las dos llegan "a la vez": las dos leen el mismo rating de partida antes de que la otra guarde.
  const [a, b] = await Promise.all([json(await rep('carrera1', 'u_x2')), json(await rep('carrera2', 'u_x3'))]);
  const esperado = Math.max(100, Math.min(3200, base + a.white.delta + b.white.delta));
  chk(fila().rating === esperado, '🔒 el rating final suma las dos variaciones', fila().rating + ' = ' + base + ' + ' + a.white.delta + ' + ' + b.white.delta);
}

console.log('\n' + (fallos ? ('❌ ' + fallos + ' PRUEBAS FALLARON') : '✅ Todas las pruebas pasaron.') + '\n');
process.exitCode = fallos ? 1 : 0;
