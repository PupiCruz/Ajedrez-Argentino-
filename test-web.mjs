// Banco de pruebas de la WEB (index.html).
//   cd ajedrez-argentino && node test-web.mjs
//
// Cubre la Fase 7 de la auditoría, en la parte que se puede probar sin navegador: las funciones
// sueltas y las expresiones regulares. Lo que necesita DOM o WebSocket (el botón "Ir al salón", el
// reintento del primer mensaje del chat) se prueba a mano; está escrito en PLAN-AUDITORIA.md.
//
// IMPORTANTE: esto NO trabaja sobre una copia del código. Saca las funciones del index.html de
// verdad, así que si mañana alguien las cambia, estas pruebas se enteran.

import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

let fallos = 0;
function chk(ok, txt, extra) {
  console.log((ok ? '  ok  ' : ' FALLA') + ' | ' + txt + (extra !== undefined ? ('  → ' + extra) : ''));
  if (!ok) fallos++;
}

// Saca el texto de una función de index.html, contando llaves.
function extraerFuncion(nombre) {
  const i = SRC.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontré la función ' + nombre + ' en index.html');
  let d = 0, empezo = false;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') { d++; empezo = true; }
    else if (SRC[k] === '}') { d--; if (empezo && d === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('la función ' + nombre + ' no cierra');
}

// ── localStorage de mentira, con el orden de inserción que usa el de verdad ──
function mkLS(pares) {
  const m = new Map(pares);
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i]; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    claves() { return [...m.keys()]; },
  };
}

console.log('\n=== 1. Clave corta del caché de posiciones (7.5) ===');
{
  const _pgnKey = new Function('return (' + extraerFuncion('_pgnKey') + ')')();
  const pgnA = '[Event "X"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0';
  const pgnB = '[Event "X"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 0-1';
  chk(_pgnKey(pgnA) === _pgnKey(pgnA), 'el mismo PGN siempre da la misma clave');
  chk(_pgnKey(pgnA) !== _pgnKey(pgnB), 'dos PGN distintos dan claves distintas');
  chk(_pgnKey(pgnA).length < 20, 'la clave es corta (antes era el PGN entero)', _pgnKey(pgnA));
  // Lo importante de verdad: que no haya choques con partidas parecidas de un torneo real.
  const claves = new Set();
  for (let i = 0; i < 5000; i++) {
    claves.add(_pgnKey('[Event "Torneo"]\n[Round "' + (i % 9 + 1) + '.' + i + '"]\n\n1. e4 e5 2. Nf3 Nc6 ' + i + '-0'));
  }
  chk(claves.size === 5000, 'cinco mil partidas parecidas: ninguna clave repetida', claves.size);
  chk(_pgnKey('') === _pgnKey(''), 'un PGN vacío no rompe');
  chk(_pgnKey(null) === _pgnKey(undefined), 'null y undefined tampoco');
}

console.log('\n=== 2. El tope del caché bajó de 500 a 200 (7.5) ===');
{
  const _capCache = new Function('return (' + extraerFuncion('_capCache') + ')')();
  chk(/_capCache\(_tdFenCache, 200\)/.test(SRC), 'tdFinalFenCached recorta a 200');
  chk(!/_capCache\(_tdFenCache, 500\)/.test(SRC), 'y ya no hay ningún 500 dando vueltas');
  const o = {}; for (let i = 0; i < 250; i++) o['k' + i] = i;
  _capCache(o, 200);
  chk(Object.keys(o).length === 200, 'recorta a 200 de verdad', Object.keys(o).length);
  chk(o.k249 === 249 && o.k0 === undefined, 'y tira los más viejos, no los nuevos');
}

console.log('\n=== 3. Hacer lugar SOLO en la web publicada (7.1) ===');
{
  const fuente = extraerFuncion('_liberarEspacioWeb');
  const correr = (ls) => {
    const f = new Function('localStorage', '_crArgCache', '_tourSearchIndex',
      fuente + '; return _liberarEspacioWeb();');
    return f(ls, {}, {});
  };
  const ls = mkLS([
    ['fa_eval_cache3', 'x'.repeat(100)],
    ['cr2_viejo1', 'a'], ['cr2_viejo2', 'b'], ['cr2_viejo3', 'c'], ['cr2_nuevo4', 'd'],
    ['pgn_tournaments', 'NO TOCAR'], ['aa_pref_autoqueen', '1'],
  ]);
  const libero = correr(ls);
  chk(libero === true, 'avisa que liberó lugar');
  chk(ls.getItem('fa_eval_cache3') === null, 'borra el caché del motor (se regenera solo)');
  chk(ls.getItem('cr2_viejo1') === null && ls.getItem('cr2_viejo2') === null, 'borra los cuadros más VIEJOS');
  chk(ls.getItem('cr2_nuevo4') === 'd', 'y deja los más nuevos', ls.getItem('cr2_nuevo4'));
  chk(ls.getItem('pgn_tournaments') === 'NO TOCAR', 'no toca los torneos del visitante');
  chk(ls.getItem('aa_pref_autoqueen') === '1', 'ni sus preferencias');

  const vacio = mkLS([['pgn_tournaments', 'x']]);
  chk(correr(vacio) === false, 'si no hay nada que borrar, avisa que no liberó');
  chk(vacio.getItem('pgn_tournaments') === 'x', 'y no borra nada');

  chk(/if \(_ondemand\) return _liberarEspacioWeb\(\);/.test(SRC),
      'en modo publicado, _quotaOffer va por el camino silencioso');
  chk(/if \(!_ondemand\) alert\('Sigue sin haber espacio/.test(SRC),
      'y el cartel de "Guardar datos en mi carpeta" ya no le sale al visitante');
}

console.log('\n=== 4. Los tres archivos de autor no se piden en la web (7.4) ===');
{
  const m = SRC.match(/window\.__AA_WEB__=([^;]+);/);
  chk(!!m, 'está la detección del sitio publicado');
  const esWeb = new Function('location', 'return (' + m[1] + ');');
  chk(esWeb({ hostname: 'chessargentino.ar' }) === true, 'chessargentino.ar = web publicada');
  chk(esWeb({ hostname: 'www.chessargentino.ar' }) === true, 'con www también');
  chk(esWeb({ hostname: 'chessargentino.pages.dev' }) === true, 'y el dominio de Cloudflare Pages');
  chk(esWeb({ hostname: 'localhost' }) === false, 'localhost NO (modo autor, se piden como siempre)');
  chk(esWeb({ hostname: '127.0.0.1' }) === false, 'la IP local tampoco');
  chk(esWeb({ hostname: '192.168.0.15' }) === false, 'ni la IP de la red (probar en el teléfono)');
  chk(esWeb({ hostname: '' }) === false, 'ni abrir el archivo con doble clic (file://)');
  chk(esWeb({ hostname: 'chessargentino.ar.otrositio.com' }) === false, 'un dominio parecido no se cuela');

  const tags = (SRC.match(/data-aa-author src="data\/embedded-/g) || []).length;
  chk(tags === 3, 'los tres archivos se inyectan marcados como "de autor"', tags);
  chk(!/<script src="data\/embedded-/.test(SRC), 'y ya no quedan etiquetas fijas que den 404 en la web');
}

console.log('\n=== 5. El exportador no duplica los scripts de autor (7.4) ===');
{
  const m = SRC.match(/html = html\.replace\((\/[^;]+\/gi), ''\);/);
  chk(!!m, 'el exportador limpia los scripts inyectados');
  const re = new Function('return (' + m[1] + ');')();
  const doc = '<head>\n  <script data-aa-author src="data/embedded-data.js"><\/script>\n'
            + '  <script src="data/manifest.js"><\/script>\n'
            + '  <script data-aa-author src="data/embedded-photos.js"><\/script>\n</head>';
  const limpio = doc.replace(re, '');
  chk(!limpio.includes('data-aa-author'), 'saca los dos scripts de autor del HTML exportado');
  chk(limpio.includes('data/manifest.js'), 'y deja el manifest, que sí va');
  chk((limpio.match(/<script/g) || []).length === 1, 'queda un solo <script>', (limpio.match(/<script/g) || []).length);
}

console.log('\n=== 6. Reintento del primer mensaje del chat (7.2) ===');
{
  // No se puede levantar el WebSocket acá, pero sí comprobar que el cableado está completo en los
  // dos chats: guardar el mensaje al mandarlo, reintentarlo al llegar "ready", y una sola vez.
  for (const [chat, pre] of [['la sala de Jugar', 'lv'], ['el torneo', 'tc']]) {
    const guarda = new RegExp("if\\(o && o\\.type==='chat'\\)\\{ " + pre + "ChatLast=o; " + pre + "ChatRetried=false; \\}");
    chk(guarda.test(SRC), 'en ' + chat + ': se recuerda el último mensaje mandado');
    chk(new RegExp("m\\.type==='not-ready'.*" + pre + "ChatPend=" + pre + "ChatLast").test(SRC),
        'en ' + chat + ': si el servidor dice "todavía no sé quién sos", se guarda para reintentar');
    chk(new RegExp("m\\.type==='ready'.*" + pre + "ChatRetried=true").test(SRC),
        'en ' + chat + ': al llegar "ready" se reintenta UNA vez (sin bucles)');
    chk(new RegExp("m\\.type==='need-login'").test(SRC),
        'en ' + chat + ': al invitado se le dice que entre con su cuenta');
  }
}

console.log('\n=== 7. Volver al salón sin perder el desafío (7.7) ===');
{
  chk(/id="lv-tolobby"/.test(SRC), 'está el botón "Ir al salón" en la sala');
  chk(/function goToLobbyKeepingChallenge\(\)\{ showLobby\(\); updatePendingPill\(\)/.test(SRC),
      'y va por un camino propio que NO pasa por exit()');
  const f = extraerFuncion('goToLobbyKeepingChallenge');
  chk(!/lvMyChallenge\s*=/.test(f) && !/ws\.close/.test(f) && !/cancel/.test(f),
      'no cancela el desafío ni cierra la sala');
  chk(/show\('lv-tolobby', \(lvStatus==='waiting'\) && amPlayer && !!lvMyChallenge\)/.test(SRC),
      'sólo aparece mientras esperás rival en tu sala');
  chk(/if\(\(b=\$\('lv-tolobby'\)\)\) b\.onclick=goToLobbyKeepingChallenge;/.test(SRC), 'y está cableado');
  // La trampa: si el rival entra mientras estás en el salón, hay que llevarte al tablero.
  chk(/else showGame\(\);\s*\/\/ estaba en la pestaña Jugar/.test(SRC),
      'si entra el rival estando en el salón, te lleva al tablero (si no, se te va el reloj)');
  chk(/!\(vivoActive && lvViewingGame\)/.test(SRC),
      'y la píldora "Desafío abierto" ahora también se ve desde el salón');
}

console.log('\n=== 8. El progreso de ejercicios se pone al día solo (7.8) ===');
{
  chk(/if \(!d \|\| !d\.progress\) return;/.test(SRC), 'se mira lo que devuelve el guardado');
  chk(/if \(\(srv\.solved \|\| srv\.n \|\| 0\) > \(mio\.solved \|\| mio\.n \|\| 0\)\) _puzSetLocal\(srv\);/.test(SRC),
      'y si el servidor va más adelante, este aparato lo adopta');
  const push = extraerFuncion('puzSyncPush');
  chk(push.includes('_puzSetLocal'), 'el cambio está dentro de puzSyncPush');
}

console.log('\n=== 9. Los comentarios que mentían sobre el bloqueo (7.6) ===');
{
  chk(!/no viaja entre dispositivos/.test(SRC), 'ya no dice que el bloqueo no viaja entre dispositivos');
  chk(!/Bloquear = personal y del navegador/.test(SRC), 'ni que es "personal y del navegador"');
  chk(/Bloquear = EN LA CUENTA/.test(SRC), 'y ahora dice lo que realmente hace');
}

console.log('\n=== 10. Las quince funciones muertas ya no están (8.2) ===');
{
  const MUERTAS = ['_vsBase', 'pgnDetectTourName', 'pgnShowResult', '_fsClearHandle', 'crShowStatus',
    'crParseHtml', 'crShowPreview', '_lookupOpeningByEpds', 'openMasterGame', '_card3Heading',
    '_openWithArgFilter', 'flyerImgHtml', 'lvRatTxt', 'whoWins', 'copyLink'];
  const EDITAR = fs.readFileSync(new URL('./editar.html', import.meta.url), 'utf8');
  var vivas = MUERTAS.filter(function (n) {
    var re = new RegExp('\\b' + n + '\\b');
    return re.test(SRC) || re.test(EDITAR);
  });
  chk(vivas.length === 0, 'ninguna de las quince quedó, ni suelta ni llamada', vivas.join(', ') || 'ninguna');
}

console.log('\n=== 11. El bloque duplicado entre index.html y editar.html (8.3) ===');
{
  const EDITAR = fs.readFileSync(new URL('./editar.html', import.meta.url), 'utf8');
  chk(SRC.includes('ESTE BLOQUE ESTÁ DUPLICADO'), 'index.html avisa que el bloque está duplicado');
  chk(EDITAR.includes('ESTE BLOQUE ESTÁ DUPLICADO'), 'editar.html también');

  // Guardia de verdad: las que HOY son iguales letra por letra tienen que seguir iguales. Si alguien
  // arregla una sola de las dos —el bug clásico de "en el teléfono anda y en la compu no"—, esto avisa.
  // Si en algún momento se decide que una DEBE ser distinta, se la saca de esta lista a propósito.
  const GEMELAS = ['_bdIsPromo', '_bdPaint', '_gcTag', '_gcVal', 'gcBindBoard', 'gcFlip',
    'gcHandleClick', 'gcNavFirst', 'gcNavLast', 'gcNavNext', 'gcNavPrev', 'gcRefreshSave',
    'gcResetGame', 'gcUndo'];
  function cuerpo(src, nombre) {
    const i = src.indexOf('function ' + nombre + '(');
    if (i < 0) return null;
    let d = 0, empezo = false;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
      if (src[k] === '{') { d++; empezo = true; }
      else if (src[k] === '}') { d--; if (empezo && d === 0) return src.slice(i, k + 1).replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim(); }
    }
    return null;
  }
  const rotas = GEMELAS.filter(function (n) { return cuerpo(SRC, n) !== cuerpo(EDITAR, n); });
  chk(rotas.length === 0, 'las catorce gemelas siguen idénticas en los dos archivos', rotas.join(', ') || 'ninguna cambió');
}


console.log('\n=== 12. Radiografía del torneo — el motor ===');
{
  // El motor son funciones PURAS: entra el cuadro guardado del torneo, sale un número. Se sacan
  // del index.html de verdad y se corren acá mismo, sin navegador.
  const nombres = ['_stJugada','_stPts','_stRounds','_stDp','_stRpFromRounds','_stColors',
                   '_stRace','_stStreak','_stBoard1','_stElo','_stDays','_stSig'];
  const dpArr = SRC.match(/var _ST_DP = \[[\s\S]*?\];/)[0];
  const stV   = SRC.match(/var _ST_V = (\d+);/)[1];
  const M = new Function('var _ST_V = ' + stV + ';' + dpArr + nombres.map(extraerFuncion).join('\n')
                         + ' return {' + nombres.join(',') + '};')();

  // ── piezas sueltas ──
  chk(M._stPts('3½') === 3.5 && M._stPts('4') === 4 && M._stPts('0') === 0, 'lee los puntos de Chess-Results ("3½" = 3,5)');
  chk(M._stPts('') === null && M._stPts(null) === null && M._stPts('x') === null, 'y no se cuelga con basura');
  chk(M._stJugada('1-0') && M._stJugada('0-1') && M._stJugada('½-½'), 'las tres formas de terminar una partida cuentan');
  chk(!M._stJugada('+--') && !M._stJugada('--+') && !M._stJugada(''), 'las incomparecencias NO cuentan como partida jugada');
  chk(M._stDp(1) === 800 && M._stDp(0) === -800 && M._stDp(0.5) === 0, 'la tabla dp de la FIDE en sus tres puntos clave');
  chk(M._stDp(0.75) > 0 && M._stDp(0.25) < 0 && M._stDp(0.9) > M._stDp(0.8), 'y siempre sube: más porcentaje, más dp');

  // ── un torneito de mentira, con la respuesta sabida a mano ──
  const mini = {
    standings: [{ rank:1, name:'Ana', elo:2000, pts:2 }, { rank:2, name:'Beto', elo:1900, pts:1 }, { rank:3, name:'Cata', elo:1800, pts:0 }],
    rounds: {
      1: [{ m:'1', w:'Ana',  ew:2000, pw:'0', res:'1-0', b:'Beto', eb:1900, pb:'0' }],
      2: [{ m:'1', w:'Cata', ew:1800, pw:'0', res:'0-1', b:'Ana',  eb:2000, pb:'1' }],
      3: [{ m:'1', w:'Beto', ew:1900, pw:'0', res:'1-0', b:'Cata', eb:1800, pb:'0' }]
    },
    roundDates: { 1:'2026-03-01', 2:'2026-03-01', 3:'2026-03-02' }
  };
  const col = M._stColors(mini);
  chk(col.w === 2 && col.b === 1 && col.d === 0 && col.jugadas === 3, 'cuenta bien quién ganó con cada color', col.w + '/' + col.d + '/' + col.b);
  chk(col.porRonda.length === 3, 'y lo abre por ronda');
  const rac = M._stRace(mini, ['Ana']);
  chk(JSON.stringify(rac.series[0].pts) === '[1,2,2]', 'la carrera por la punta sigue los puntos ronda a ronda', JSON.stringify(rac.series[0].pts));
  chk(rac.lideres[2].raw === 'Ana' && rac.lideres[2].pts === 2, 'y sabe quién lidera al final');
  chk(M._stStreak(mini).raw === 'Ana' && M._stStreak(mini).n === 2, 'la racha más larga: Ana, dos seguidas');
  chk(M._stBoard1(mini).n >= 2, 'cuenta las veces que se jugó en la mesa 1');
  chk(M._stElo(mini).prom === 1900, 'el Elo promedio', M._stElo(mini).prom);
  const dias = M._stDays(mini);
  chk(dias.dias === 2 && dias.dobles.length === 1, 'dos días de juego, uno con jornada doble');
  chk(M._stColors({}) === null && M._stRace({}, []) === null && M._stStreak({}) === null, 'sin cruces no inventan nada: devuelven null');
  chk(M._stSig(mini) !== M._stSig({ standings:mini.standings, rounds:{ 1:mini.rounds[1] } }), 'la firma cambia si cambian los datos');

  // ── contra un torneo DE VERDAD (la Semifinal Argentina 2026) ──
  const real = 'data/cr/cr2_tz_tz_1780078240681.json';
  if (fs.existsSync(real)) {
    const d = JSON.parse(fs.readFileSync(real, 'utf8'));
    const c = M._stColors(d);
    chk(c.jugadas === 433 && c.w === 195 && c.d === 100 && c.b === 138,
        'Semifinal Argentina: 433 partidas, 195 blancas / 100 tablas / 138 negras', c.w + '/' + c.d + '/' + c.b);
    chk(c.wo === 15, 'y 15 incomparecencias, aparte de las jugadas', c.wo);
    chk(M._stElo(d).prom === 1999, 'Elo promedio 1999', M._stElo(d).prom);
    chk(M._stStreak(d).raw === 'Villegas, Franco' && M._stStreak(d).n === 4, 'la racha más larga fue de Villegas: 4 seguidas');
    const race = M._stRace(d, ['Ocampos, Ian']);
    const fin = race.series[0].pts[race.series[0].pts.length - 1];
    chk(fin === 7.5, 'la trayectoria del campeón termina en los 7½ de la tabla', fin);
    chk(race.lideres.length === 9 && race.lideres[8].pts === 7.5, 'y hay un líder por cada una de las 9 rondas');

    // El Rp calculado tiene que dar IGUAL que el de Chess-Results para los que jugaron todo.
    const rp = M._stRpFromRounds(d);
    let comparados = 0, iguales = 0, peor = 0;
    d.standings.forEach(p => {
      const mio = rp[p.name];
      if (!mio || !p.rp || mio.partidas !== 9) return;
      comparados++;
      if (mio.rp === p.rp) iguales++;
      peor = Math.max(peor, Math.abs(mio.rp - p.rp));
    });
    chk(comparados >= 20, 'hay con quién comparar el Rp calculado', comparados + ' jugadores');
    chk(iguales === comparados, 'el Rp que calculamos = el de Chess-Results, jugador por jugador',
        iguales + '/' + comparados + ' (peor diferencia ' + peor + ')');
  } else {
    console.log('  --   | (el cuadro de la Semifinal no esta: me salteo las pruebas con datos reales)');
  }
}


console.log('\n=== 13. Emparejar nombres: la memoria no cambió las reglas ===');
{
  // pgnNameMatchesPlayer ahora prepara cada lado UNA vez y lo guarda (antes renormalizaba todo en
  // cada una de las ~800.000 comparaciones de un open grande). Estas pruebas son el candado: las
  // reglas de siempre —hermanos, iniciales, apellido compuesto— tienen que seguir dando igual.
  const piezas = ['normStr','nameTokens','pgnNameToNatural','_tok1Edit','_tokExplained','_namesConflict',
                  '_nmPlayerPrep','_nmNamePrep','_nmMatch','pgnNameMatchesPlayer'];
  const N = new Function('var _nmPlayerCache = new Map(), _nmNameCache = new Map();'
                         + piezas.map(extraerFuncion).join('\n')
                         + ' return { m: pgnNameMatchesPlayer, cachePlayers: _nmPlayerCache, cacheNames: _nmNameCache };')();
  const m = N.m;

  chk(m('Krysa, Leandro', { name:'Leandro Krysa' }) === true, '"Apellido, Nombre" y "Nombre Apellido" son la misma persona');
  chk(m('Pérez, José', { name:'Jose Perez' }) === true, 'los acentos no separan a nadie');
  chk(m('Ocampos, Ian', { name:'Ian Ocampos' }) === true, 'el campeón de la Semifinal se reconoce');
  chk(m('Ocampos, Ian', { name:'Ian Villegas' }) === false, 'y no se confunde con otro apellido');

  // Candado anti-hermanos (bug real: las partidas del hermano caían en el perfil).
  chk(m('Duarte Fernandez, Perseo', { name:'Agustin Duarte Fernandez' }) === false,
      'dos hermanos con los mismos apellidos NO son la misma persona');
  chk(m('Duarte Fernandez, Agustin', { name:'Agustin Duarte Fernandez' }) === true,
      'pero el jugador de verdad sí matchea');

  // Veto por iniciales (bug real: "Rodriguez, F.J" se pegaba a cualquier homónimo).
  chk(m('Rodriguez, F.J', { name:'Fernando Jose Rodriguez' }) === true, 'las iniciales que coinciden matchean');
  chk(m('Rodriguez, F.J', { name:'Santiago Rodriguez' }) === false, 'las que no coinciden, no');

  // Apellido compuesto delante de la coma: tienen que estar TODOS.
  chk(m('Flores Quillas, Diego', { name:'Diego Flores' }) === false,
      '"Flores Quillas" no es "Flores" aunque compartan nombre');

  chk(m('', { name:'Ian Ocampos' }) === false && m('Ocampos, Ian', null) === false, 'nombre vacío o jugador nulo: false, sin romper');

  // La memoria del jugador se revalida por nombre: si el autor lo renombra, el match cambia.
  const jug = { name:'Leandro Krysa' };
  chk(m('Krysa, Leandro', jug) === true, 'match antes de renombrar');
  jug.name = 'Leandro Paveto';
  chk(m('Krysa, Leandro', jug) === false, 'y si el autor le cambia el nombre, la memoria se entera');

  chk(N.cachePlayers.size > 0 && N.cacheNames.size > 0, 'los dos lados se guardan de verdad (por eso es rápido)');
  chk(/_nmPlayerCache/.test(SRC) && /_nmNameCache/.test(SRC) && /function _nmMatch/.test(SRC),
      'la preparación memoizada sigue en index.html (si alguien la saca, vuelven los 3 segundos)');
}


console.log('\n=== 14. Cuándo aparece la pestaña Radiografía ===');
{
  // La regla: torneo INDIVIDUAL, terminado (o con la clasificación final ya subida), con tabla jugada
  // y con cruces. Mientras se juega no aparece: la radiografía es la foto del final.
  const fuente = extraerFuncion('_stStatsMeta') + '\n' + extraerFuncion('_stStatsAvailable');
  const hacer = (ctx) => new Function('_tdPodiumCtx', '_crCategory', fuente + '; return _stStatsAvailable;')(ctx, {});
  const dispo = hacer(null);

  const completo = { standings:[{name:'A',pts:5},{name:'B',pts:3}], rounds:{ 1:[{w:'A',b:'B',res:'1-0'}] }, standingsFinal:true };
  chk(dispo('k', completo) === true, 'torneo terminado con tabla y cruces: aparece');
  chk(dispo('k', Object.assign({}, completo, { standingsFinal:false })) === false, 'todavía en juego (sin clasificación final): no aparece');
  chk(dispo('k', { standings:completo.standings, standingsFinal:true }) === false, 'con tabla pero sin cruces: no aparece');
  chk(dispo('k', Object.assign({}, completo, { standings:[{name:'A',pts:0},{name:'B',pts:0}] })) === false, 'tabla cargada pero sin jugar: no aparece');
  chk(dispo('k', Object.assign({}, completo, { standingsKind:'initial' })) === false, 'la lista inicial de inscriptos no es una tabla: no aparece');
  chk(dispo('k', Object.assign({}, completo, { teamRounds:{ 1:[{}] } })) === false, 'torneo por equipos: no aparece (la v1 no los cubre)');
  chk(dispo('k', null) === false && dispo('k', {}) === false, 'sin datos no se rompe');

  // Con el detalle abierto: manda el estado del torneo.
  const enVivoPeroDone = hacer({ crk:'k', status:'done', name:'X' });
  chk(enVivoPeroDone('k', Object.assign({}, completo, { standingsFinal:false })) === true,
      'si el torneo figura FINALIZADO, aparece aunque falte el sello de tabla final');
  const equipos = hacer({ crk:'k', status:'done', isTeam:true });
  chk(equipos('k', completo) === false, 'y un torneo por equipos sigue sin mostrarla');

  chk(/id="cr-rtab-'\+key\+'-stats"/.test(SRC) && /crShowTab\([^)]*stats/.test(SRC),
      'el botón de la pestaña quedó cableado a crShowTab');
  chk(/if\(tab==='stats'\)\s+return crBuildStatsPanel\(key,data\);/.test(SRC),
      'y el panel perezoso sabe armarse con crBuildStatsPanel');
}


console.log('\n=== 15. Los dos gráficos de la Radiografía ===');
{
  const nombres = ['_stJugada','_stPts','_stRounds','_stRace'];
  const M = new Function(nombres.map(extraerFuncion).join('\n') + ' return {' + nombres.join(',') + '};')();
  const story = new Function('crPtsStr', 'escHtml',
    extraerFuncion('_stRaceStory') + '; return _stRaceStory;')(
      (n)=> (n%1===0.5 ? (Math.floor(n)>0?Math.floor(n):'')+'½' : String(n)), (s)=>String(s));

  // Torneito donde el líder cambia y al final se empata la punta.
  const d = {
    rounds: {
      1: [{ w:'Ana', pw:'0', res:'1-0', b:'Beto', pb:'0' }, { w:'Cata', pw:'0', res:'1-0', b:'Dani', pb:'0' }],
      2: [{ w:'Ana', pw:'1', res:'0-1', b:'Cata', pb:'1' }, { w:'Beto', pw:'0', res:'1-0', b:'Dani', pb:'0' }],
      3: [{ w:'Cata', pw:'2', res:'0-1', b:'Ana',  pb:'1' }, { w:'Beto', pw:'1', res:'1-0', b:'Dani', pb:'0' }]
    }
  };
  const r = M._stRace(d, ['Ana','Cata']);
  chk(JSON.stringify(r.series[0].pts) === '[1,1,2]', 'la trayectoria de Ana: gana, pierde, gana', JSON.stringify(r.series[0].pts));
  chk(r.lideres[0].raw === 'Ana' || r.lideres[0].raw === 'Cata', 'en la 1ª hay dos punteros empatados');
  chk(r.lideres[0].empatados === 2, 'y quedan contados los dos', r.lideres[0].empatados);
  chk(r.lideres[1].raw === 'Cata' && r.lideres[1].empatados === 1, 'en la 2ª Cata queda sola arriba');
  chk(r.lideres[2].empatados === 3, 'y en la 3ª la alcanzan: quedan tres en la cima con 2 puntos', r.lideres[2].empatados);

  // Continuidad: si el líder de la ronda anterior sigue arriba, NO cuenta como cambio de punta.
  const seguido = {
    rounds: {
      1: [{ w:'Ana', pw:'0', res:'1-0', b:'Beto', pb:'0' }],
      2: [{ w:'Ana', pw:'1', res:'½-½', b:'Beto', pb:'0' }],
      3: [{ w:'Ana', pw:'1.5', res:'½-½', b:'Beto', pb:'0.5' }]
    }
  };
  const r2 = M._stRace(seguido, ['Ana']);
  chk(r2.lideres.every(l => l.raw === 'Ana'), 'Ana lidera las tres rondas seguidas');
  chk(r2.cambios === 0, 'y la punta no cambió de manos ni una vez', r2.cambios);

  // El relato en castellano.
  const conNombres = { lideres: r.lideres.map(l => Object.assign({}, l, { nombre:l.raw, nombres:(l.raws||[]).slice() })), cambios:r.cambios };
  const txt = story(conNombres);
  chk(/Qui[eé]n iba adelante/.test(txt), 'el relato arranca contando quién iba adelante', txt.slice(0, 60));
  chk(/empatados/.test(txt), 'y avisa que llegaron empatados a la última');
  chk(story({ lideres:[{r:1,raw:'A',nombre:'Ana',empatados:1},{r:2,raw:'A',nombre:'Ana',empatados:1},{r:3,raw:'A',nombre:'Ana',empatados:1}], cambios:0 })
      .indexOf('de punta a punta') > 0, 'si nadie lo pasó nunca, lo dice en una línea');
  chk(story(null) === '' && story({ lideres:[] }) === '', 'sin datos no inventa relato');

  chk(/function _stPulseHtml/.test(SRC) && /function _stRaceHtml/.test(SRC), 'los dos gráficos siguen en index.html');
  chk(/viewBox="0 0 ' \+ W \+ ' ' \+ H \+ '"/.test(SRC), 'la carrera se dibuja en SVG con viewBox (se estira sin pixelarse)');
}


console.log('\n=== 16. La radiografía horneada viaja con el torneo ===');
{
  // Sin ejecutar el armado del paquete (que es pesado y toca los datos): se comprueba que el
  // cableado esté puesto y que la pieza que hornea no ensucie el cuadro original.
  chk(/var _dCr = _stBakeForPublish\(k, d, _metaCr\);/.test(SRC),
      'al armar data/cr/<clave>.json se pasa por el horneado');
  chk(/crFiles\[k\] = _dCr;/.test(SRC), 'y lo que se guarda es el resultado del horneado, no el original');
  chk(/metaCr\[entry\.id\] = \{/.test(SRC), 'cada torneo aporta sus datos (nombre, sede, fechas, tipo) para hornear');
  chk(/crBaked\+\+/.test(SRC) && /Radiograf[ií]as horneadas para la web/.test(SRC),
      'y queda contado, para verlo en la consola al guardar');

  // _stBakeForPublish devuelve una COPIA: el cuadro del autor no se toca nunca.
  const bake = new Function('_stStatsAvailable', '_statsBuild',
    extraerFuncion('_stBakeForPublish') + '; return _stBakeForPublish;');
  const cuadro = { rounds:{ 1:[{ w:'A', b:'B', res:'1-0' }] }, standings:[{ name:'A', pts:1 }], standingsFinal:true };
  const meta   = { name:'T', isTeam:false, status:'done' };

  const conStats = bake(() => true, () => ({ v:1, sig:'x', campeon:{} }))('k', cuadro, meta);
  chk(conStats !== cuadro, 'devuelve una copia, no el mismo objeto');
  chk(!!conStats.stats, 'la copia lleva la radiografía adentro');
  chk(cuadro.stats === undefined, 'y el cuadro original queda intacto (sin stats)');
  chk(conStats.rounds === cuadro.rounds && conStats.standings === cuadro.standings,
      'la copia comparte cruces y tabla: no duplica el peso en memoria');

  const noCalifica = bake(() => false, () => ({ v:1 }))('k', cuadro, meta);
  chk(noCalifica === cuadro, 'si el torneo no califica (en curso, equipos), pasa de largo sin tocar nada');
  chk(bake(() => true, () => null)('k', cuadro, meta) === cuadro, 'y si el motor no puede armarla, tampoco');
  chk(bake(() => true, () => { throw new Error('boom'); })('k', cuadro, meta) === cuadro,
      'si algo explota, se guarda el cuadro como siempre: publicar NUNCA se rompe por esto');
  chk(bake(() => true, () => ({ v:1 }))('k', cuadro, { name:'T', isTeam:true, status:'done' }) === cuadro,
      'los torneos por equipos no se hornean');
}

console.log('\n' + (fallos ? ('❌ ' + fallos + ' PRUEBAS FALLARON') : '✅ Todas las pruebas pasaron.') + '\n');
process.exitCode = fallos ? 1 : 0;
