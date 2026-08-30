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
  chk(!!bake(() => true, () => ({ v:1 }))('k', cuadro, { name:'T', isTeam:true, status:'done' }).stats,
      'los torneos por equipos también se hornean (Olimpiadas, ligas)');
}


console.log('\n=== 17. Radiografía POR EQUIPOS (Olimpiadas, ligas) ===');
{
  const piezas = ['_stJugada','_stRounds','_stSig','_stTeamName','_stTeamBoardsAsRounds','_stTeamPoints',
                  '_stTeamMatchRule','_stTeamUpsets'];
  const stV = SRC.match(/var _ST_V = (\d+);/)[1];
  const M = new Function('crPtsStr', 'var ' + SRC.match(new RegExp('_TEAM_SIN_JUGADOR=[^;]+;'))[0] + extraerFuncion('_teamIsPlaceholder') + 'var _ST_V = ' + stV + ';' + piezas.map(extraerFuncion).join('\n')
                         + ' return {' + piezas.join(',') + '};')(
    (n) => (n % 1 === 0.5 ? (Math.floor(n) > 0 ? Math.floor(n) : '') + '½' : String(n)));

  chk(M._stTeamName('Argentina (ARG)') === 'Argentina', 'le saca el país entre paréntesis al nombre del equipo');
  chk(M._stTeamName('Club Atlético Banfield') === 'Club Atlético Banfield', 'y a un club no le toca nada');

  // Liguita de mentira: 2 rondas, 2 matches, con la cuenta hecha a mano.
  const liga = { teamRounds: {
    1: [{ aNo:'1', aName:'Rojo', bNo:'4', bName:'Azul', boards:[
           { nW:'A', eW:2000, nB:'B', eB:1900, res:'1-0' }, { nW:'C', eW:1950, nB:'D', eB:1980, res:'½-½' }] },
        { aNo:'2', aName:'Verde', bNo:'3', bName:'Gris', boards:[
           { nW:'E', eW:1800, nB:'F', eB:1850, res:'0-1' }, { nW:'G', eW:1700, nB:'H', eB:1750, res:'0-1' }] }],
    2: [{ aNo:'1', aName:'Rojo', bNo:'3', bName:'Gris', boards:[
           { nW:'A', eW:2000, nB:'F', eB:1850, res:'½-½' }, { nW:'C', eW:1950, nB:'H', eB:1750, res:'½-½' }] }]
  }};
  const P = M._stTeamPoints(liga);
  chk(P.matches === 3 && P.partidas === 6, 'cuenta los matches y las partidas de adentro', P.matches + ' matches / ' + P.partidas + ' partidas');
  chk(P.bp['Rojo'] === 2.5, 'puntos de TABLERO de Rojo: 1½ + 1 = 2½', P.bp['Rojo']);
  chk(P.mp['Rojo'] === 3, 'puntos de MATCH de Rojo: ganó uno (2) y empató otro (1)', P.mp['Rojo']);
  chk(P.mp['Gris'] === 3 && P.bp['Gris'] === 3, 'y los de Gris: 2 de ganar + 1 de empatar, con 3 de tablero');
  chk(P.gpe['Rojo'].g === 1 && P.gpe['Rojo'].e === 1 && P.gpe['Rojo'].p === 0, 'ganados/empatados/perdidos de Rojo');
  chk(JSON.stringify(P.serie['Rojo']) === '[2,3]', 'la carrera guarda los puntos ronda a ronda', JSON.stringify(P.serie['Rojo']));

  const boards = M._stTeamBoardsAsRounds(liga);
  chk(Object.keys(boards).length === 2 && boards['1'].length === 4,
      'los tableros se convierten al formato de los cruces (para reusar Rp, rachas y batacazos)');
  chk(boards['1'][0].m === '1' && boards['1'][1].m === '2', 'y cada uno sabe en qué mesa se jugó');

  // La columna de puntos de match cambia de torneo en torneo: se detecta sola.
  chk(M._stTeamMatchRule([{ w:'10', d:'1', des:['21','476.5','35'] }]).col === 0,
      'Olimpiada: los puntos de match son la 1ª columna (2-1-0)');
  chk(M._stTeamMatchRule([{ w:'4', d:'2', des:['12.5','10','0'] }]).col === 1,
      'FASGBA: son la 2ª columna — por eso no se leen a ciegas');
  chk(M._stTeamMatchRule([{ w:'4', d:'2', des:['99','98'] }]) === null, 'si ninguna cierra, no inventa');

  // Batacazos por equipos: los umbrales se escalan al tamaño del torneo.
  const golpe = { teamRounds: { 1: [{ aNo:'12', aName:'Naranja', bNo:'1', bName:'Rojo', boards:[
    { nW:'X', eW:1700, nB:'A', eB:2000, res:'1-0' }, { nW:'Y', eW:1650, nB:'C', eB:1950, res:'1-0' }] }] }};
  const enLiga = M._stTeamUpsets(golpe, 16);
  chk(enLiga.length === 1 && enLiga[0].gana === 'Naranja' && enLiga[0].noPierde === 1 && enLiga[0].score === '2-0',
      'en una liga de 16, el #12 ganándole al #1 es batacazo', JSON.stringify(enLiga.map(x => x.gana + ' ' + x.score)));
  chk(M._stTeamUpsets(golpe, 189).length === 0,
      'y en una Olimpiada de 189 ese mismo cruce no llega: el perdedor tiene que ser de los de arriba');
  chk(M._stTeamUpsets(liga, 4).length === 0,
      'entre vecinos de tabla (#3 al #2) no hay batacazo que contar');

  // La firma tiene que mirar los datos POR EQUIPOS (antes daba lo mismo para todos).
  const sig = M._stSig(liga);
  const menos = JSON.parse(JSON.stringify(liga)); delete menos.teamRounds['2'];
  const menosTablero = JSON.parse(JSON.stringify(liga)); menosTablero.teamRounds['1'][0].boards.pop();
  chk(sig !== M._stSig(menos), 'la firma cambia si se borra una ronda');
  chk(sig !== M._stSig(menosTablero), 'y si cambia un solo tablero');
  chk(M._stSig(liga) === M._stSig(liga), 'pero es estable con los mismos datos');

  // ── Contra la FASGBA de verdad ──
  const real = 'data/cr/cr2_tz_tz_1783952758542.json';
  if (fs.existsSync(real)) {
    const d = JSON.parse(fs.readFileSync(real, 'utf8'));
    const R = M._stTeamPoints(d);
    const campeon = M._stTeamName(d.teamStandings.teams[0].name);
    const t = d.teamStandings.teams[0];
    chk(R.mp[campeon] === 2 * (+t.w) + (+t.d),
        'FASGBA: los puntos de match calculados = los que informa la tabla', R.mp[campeon]);
    const col = M._stTeamMatchRule(d.teamStandings.teams);
    chk(col && parseFloat(t.des[col.col]) === R.mp[campeon],
        'y coinciden con la columna que detectamos en la tabla', JSON.stringify(t.des));
    chk(R.bp[campeon] === parseFloat(t.des[0]),
        'los puntos de TABLERO calculados también coinciden', R.bp[campeon] + ' vs ' + t.des[0]);
  } else {
    console.log('  --   | (el cuadro de la FASGBA no está: me salteo esa parte)');
  }

  chk(/NO se puede saber quién llevaba las blancas/.test(SRC),
      'queda escrito por qué los torneos por equipos no muestran el reparto por colores');
}


console.log('\n=== 18. La pestaña de los torneos por equipos ===');
{
  chk(/if\(_stStatsAvailable\(crk,data\)\) h\+=tabBtn\('stats','📈 Radiografía',false\);/.test(SRC),
      'el botón está en el renglón de formaciones y tabla');
  chk(/id="cr-panel-'\+crk\+'-stats" data-lazy="1"/.test(SRC),
      'y su panel nace perezoso (una Olimpiada son 4.000 partidas: no se arma si no la abrís)');
  chk(/ap\.removeAttribute\('data-lazy'\);[\s\S]{0,140}_teamPanelContent\(crk, crDataLoad\(crk\), tab\)/.test(SRC),
      '_teamShowTab arma el panel la primera vez que se toca');
  // Los paneles por equipos también son perezosos: una Olimpiada armaba 12 MB de HTML y 76.000
  // nodos de una sola vez (11 formaciones), y tardaba 700 ms en abrir.
  chk(/var panel=function\(tab, contenido\)\{/.test(SRC) && /data-lazy="1"/.test(SRC),
      'las formaciones, los cruces y la tabla nacen perezosos');
  chk(/function _teamPanelContent\(crk,data,tab\)\{/.test(SRC),
      'y hay un solo lugar que sabe armar cada panel');
  for (const pieza of ['_teamRenderCrosses', '_teamRenderRound', '_teamRenderStandings', 'crBuildStatsPanel']) {
    chk(new RegExp(pieza).test(extraerFuncion('_teamPanelContent')),
        '_teamPanelContent sabe armar: ' + pieza);
  }
  chk(/if \(s\.esEquipos\) return _stTeamPanelHtml\(key, s\);/.test(SRC),
      'y el panel sabe cuándo dibujar la versión por equipos');

  // Medallas: oro, plata y bronce en CADA tablero (no sólo el mejor de cada mesa).
  chk(/podio:\s*enMesa\.slice\(0, 3\)/.test(SRC), 'cada tablero se lleva su oro, su plata y su bronce');
  chk(/var MED = \['🥇','🥈','🥉'\]/.test(SRC), 'y se dibujan con las tres medallas');

  // La leyenda del gráfico son EQUIPOS: no tienen ficha de jugador que abrir.
  chk(/_stRaceHtml\(key, s, \{ sub:'puntos de match, ronda a ronda', sinClic:true \}\)/.test(SRC),
      'en la carrera por la punta de equipos, los nombres no son clickeables');

  // La actuación argentina sólo cuando los equipos son PAÍSES (en una liga de clubes no va).
  chk(/var esPaises = teams\.some\(function\(t\)\{ return t\.fed && String\(t\.fed\)\.length === 3; \}\);/.test(SRC),
      'la actuación argentina se muestra sólo si los equipos son países');
}


console.log('\n=== 19. El tablero de INSCRIPCIÓN (medallas de la Olimpiada) ===');
{
  // Las medallas por tablero no van por la mesa donde el jugador se sentó, sino por su puesto en la
  // lista del equipo. Caso real: Alan Pichot es el 4 de España, jugó 8 de 9 partidas en la mesa 3, y
  // su bronce es del tablero 4. El orden del equipo se deduce de quién juega arriba de quién.
  const piezas = ['_stJugada','_stDp','_stTeamName','_stTeamRegisteredBoards','_stTeamPlayers'];
  const dpArr = SRC.match(/var _ST_DP = \[[\s\S]*?\];/)[0];
  const M = new Function('pgnNameToNatural', '_normTitle', 'var ' + SRC.match(new RegExp('_TEAM_SIN_JUGADOR=[^;]+;'))[0] + extraerFuncion('_teamIsPlaceholder') + dpArr + piezas.map(extraerFuncion).join('\n')
                         + ' return {' + piezas.join(',') + '};')((n) => n, (t) => t || '');

  // Un equipo de 4 donde el CUARTO sube a la mesa 3 cuando el segundo descansa (el caso Pichot).
  const mk = (nombres) => ({ boards: nombres.map((n, i) => ({ nW:n, eW:2000, nB:'riv' + i, eB:2000, res:'½-½' })) });
  const d = { teamRounds: {
    1: [Object.assign({ aName:'España', bName:'Otro' }, mk(['Uno','Dos','Tres','Pichot']))],
    2: [Object.assign({ aName:'España', bName:'Otro' }, mk(['Uno','Tres','Pichot']))],
    3: [Object.assign({ aName:'España', bName:'Otro' }, mk(['Uno','Dos','Tres','Pichot']))]
  }};
  const jug = M._stTeamPlayers(d, 3);
  const de = (n) => jug.filter(p => p.equipo === 'España').find(p => p.raw === n);
  chk(de('Uno').mesa === 1 && de('Dos').mesa === 2 && de('Tres').mesa === 3 && de('Pichot').mesa === 4,
      'el 4º del equipo sigue siendo el 4 aunque haya jugado en la mesa 3',
      'Uno=' + de('Uno').mesa + ' Dos=' + de('Dos').mesa + ' Tres=' + de('Tres').mesa + ' Pichot=' + de('Pichot').mesa);

  // Con datos contradictorios (un ciclo) no se pierde ningún jugador ni se cuelga.
  const raro = { teamRounds: {
    1: [Object.assign({ aName:'X', bName:'Y' }, mk(['A','B']))],
    2: [Object.assign({ aName:'X', bName:'Y' }, mk(['B','A']))]
  }};
  const jr = M._stTeamPlayers(raro, 2).filter(p => p.equipo === 'X');
  chk(jr.length === 2 && jr.every(p => p.mesa >= 1 && p.mesa <= 2), 'si los datos se contradicen, igual quedan todos ordenados');

  // El mínimo de partidas para las medallas: la FIDE pide 8 en una Olimpiada de 11 rondas.
  chk(/var minP = \(rondas >= 10\) \? 8 :/.test(SRC), 'en torneos de 10 rondas o más se piden 8 partidas, como la FIDE');

  // ── Contra la tabla OFICIAL de la Olimpiada 2024 (art=21 de Chess-Results) ──
  const olimp = 'data/cr/cr2_tz_tz_1785939130392_c0.json';
  if (fs.existsSync(olimp)) {
    const d2 = JSON.parse(fs.readFileSync(olimp, 'utf8'));
    const todos = M._stTeamPlayers(d2, 11);
    const porTablero = (t) => todos.filter(p => p.mesa === t && p.rp).sort((a, b) => b.rp - a.rp).slice(0, 3)
                                   .map(p => p.raw.split(',')[0] + ' ' + p.rp);
    const OFICIAL = {
      1: ['Gukesh 3056', 'Abdusattorov 2884', 'Carlsen 2810'],
      2: ['Nguyen 2783', 'Lazov 2763', 'Gurel 2755'],
      3: ['Erigaisi 2968', 'Yu 2802', 'Le 2795'],
      4: ['Vokhidov 2779', 'Aronian 2773', 'Pichot 2756'],
      5: ['Svane 2791', 'Gledura 2692', 'Ivic 2648']
    };
    for (const t of [1, 2, 3, 4, 5]) {
      const mio = porTablero(+t);
      chk(JSON.stringify(mio) === JSON.stringify(OFICIAL[t]),
          'Olimpiada 2024, tablero ' + t + ': mismo podio que la tabla oficial', mio.join(' | '));
    }
    const pichot = todos.find(p => /^Pichot/.test(p.raw));
    chk(pichot && pichot.mesa === 4 && pichot.rp === 2756 && pichot.partidas === 9,
        'y Pichot queda donde va: tablero 4, Rp 2756, 9 partidas',
        pichot ? ('tablero ' + pichot.mesa + ' Rp ' + pichot.rp + ' ' + pichot.partidas + ' partidas') : 'no está');
  } else {
    console.log('  --   | (el cuadro de la Olimpiada no está: me salteo la comparación con la oficial)');
  }
}


console.log('\n=== 20. La noticia de los torneos por equipos ===');
{
  const _ncLista = new Function('return (' + extraerFuncion('_ncLista') + ')')();
  chk(_ncLista(['a']) === 'a', 'una sola cosa se dice sola');
  chk(_ncLista(['a', 'b']) === 'a y b', 'dos, con "y"');
  chk(_ncLista(['a', 'b', 'c']) === 'a, b y c', 'tres, con comas y una "y" al final');
  chk(_ncLista([]) === '' && _ncLista(null) === '', 'y con nada, nada');
  chk(_ncLista(['a', '', 'c']) === 'a y c', 'los huecos no dejan comas sueltas');

  chk(/if \(m && \(\(data && data\.teamRounds && Object\.keys\(data\.teamRounds\)\.length\) \|\| m\.isTeam\)\) return _noticiaGatherDataTeam\(data, m\);/.test(SRC),
      'el paquete para la IA se bifurca cuando el torneo es por equipos');
  chk(/function _noticiaGatherDataTeam/.test(SRC), 'y existe el paquete propio de los equipos');
  for (const campo of ['medallasPorTablero', 'batacazosEquipos', 'tramosDePunta', 'argentina']) {
    chk(new RegExp(campo).test(extraerFuncion('_noticiaGatherDataTeam')),
        'el paquete le manda a la IA: ' + campo);
  }

  const draft = extraerFuncion('_noticiaTeamDraft');
  chk(/_stTeamBuild/.test(draft), 'el borrador local se arma con la misma radiografía que la pestaña');
  chk(/La actuación argentina/.test(draft), 'y cuenta la actuación argentina');
  chk(/medallas|oro por tablero/i.test(draft), 'y las medallas por tablero');
  chk(/if \(!s \|\| !s\.campeon\)/.test(draft),
      'si el torneo todavía no tiene cruces, igual anuncia al campeón con la tabla sola');

  chk(/La IA arma la nota con los datos del torneo por equipos/.test(SRC),
      'el cartel del botón de IA explica qué va a usar en un torneo por equipos');
}


console.log('\n=== 21. Los países, en castellano ===');
{
  // Chess-Results publica los países en inglés. Se traducen SOLO al mostrarlos: los datos guardados
  // y las claves con las que se busca cada equipo siguen siendo los originales.
  const tablaES = SRC.match(/var _FED_ES = (\{.*?\});/)[1];
  const tablaISO = SRC.match(/var _FED_ISO = (\{.*?\});/)[1];
  const ES = JSON.parse(tablaES), ISO = JSON.parse(tablaISO);
  const sinNombre = Object.keys(ISO).filter(k => !ES[k]);
  chk(sinNombre.length === 0, 'todas las federaciones que tienen bandera tienen nombre en castellano',
      sinNombre.join(',') || (Object.keys(ES).length + ' federaciones'));
  const deMas = Object.keys(ES).filter(k => !ISO[k]);
  chk(deMas.length === 0, 'y no sobra ninguna', deMas.join(',') || 'ninguna');

  const EN = JSON.parse(SRC.match(new RegExp('var _FED_EN = ([{].*?[}]);'))[1]);
  const sinIngles = Object.keys(ES).filter(k => !EN[k]);
  chk(sinIngles.length === 0, 'y todas tienen también su nombre en inglés (así se las reconoce)',
      sinIngles.join(',') || (Object.keys(EN).length + ' federaciones'));

  const parts = (n) => {
    const s0 = String(n || '');
    const m = s0.match(new RegExp('[(]([A-Za-z]{3})[)][ ]*$'));
    return { clean: s0.replace(new RegExp('[ ]*[(][A-Za-z]{3}[)][ ]*$'), '').trim() || s0,
             fed: m ? m[1].toUpperCase() : '' };
  };
  const _paisES = new Function('_FED_ES', '_FED_EN', 'normStr', '_teamCountryParts',
    'var _NOMBRE_FED = null;' + extraerFuncion('_nombreFedIx') + extraerFuncion('_paisES') + '; return _paisES;')(
      ES, EN, new Function('return (' + extraerFuncion('normStr') + ')')(), parts);

  // Un Europeo por equipos tiene England 1, 2 y 3: el número NO se puede perder.
  chk(_paisES('England 1', 'ENG') === 'Inglaterra 1' && _paisES('England 3', 'ENG') === 'Inglaterra 3',
      'conserva el número del equipo (había tres "Inglaterra" iguales)', _paisES('England 1', 'ENG'));
  chk(_paisES('Hungary B', 'HUN') === 'Hungría B' && _paisES('Sweden 1', 'SWE') === 'Suecia 1',
      'lo mismo con la letra del equipo');
  // Lo delicado: un CLUB inscripto con la federación de su país NO es ese país.
  chk(_paisES('SG Riehen Switzerland', 'SUI') === 'SG Riehen Switzerland',
      'un club suizo no se convierte en "Suiza": se traduce por el nombre, nunca por la federación');
  chk(_paisES('Ageless of Crete', 'GRE') === 'Ageless of Crete' && _paisES('Polish Amateurs', 'POL') === 'Polish Amateurs',
      'ni un club griego en "Grecia", ni uno polaco en "Polonia"');
  chk(_paisES('USA', 'USA') === 'Estados Unidos' && _paisES('Turkey', 'TUR') === 'Turquía',
      'las variantes que usa Chess-Results también entran ("USA", "Turkey")');
  chk(_paisES('Racing Club B') === 'Racing Club B' && _paisES('Deportivo 9 de Julio') === 'Deportivo 9 de Julio',
      'y a un club con número o letra tampoco le pasa nada');

  chk(_paisES('United States of America', 'USA') === 'Estados Unidos', 'traduce por el código de federación');
  chk(_paisES('Netherlands (NED)') === 'Países Bajos', 'y también cuando el código viene pegado al nombre');
  chk(_paisES('Hungary', 'HUN') === 'Hungría' && _paisES('Czech Republic', 'CZE') === 'Chequia',
      'Hungría y Chequia, que en inglés se escriben muy distinto');
  chk(_paisES('Türkiye', 'TUR') === 'Turquía', 'Turquía, aunque el nombre venga en turco');
  chk(_paisES('Club Atlético Independiente') === 'Club Atlético Independiente',
      'a un CLUB no le toca nada (una liga no es un torneo de países)');
  chk(_paisES('Chess Team XYZ', 'ZZZ') === 'Chess Team XYZ', 'y un código desconocido tampoco rompe nada');
  chk(_paisES('') === '' && _paisES(null) === '', 'sin nombre, no devuelve basura');

  // Los lugares donde se muestran: tabla de equipos, formaciones, cruces y ficha de país.
  chk(/escHtml\(_paisES\(t\.name,_fed\)\)/.test(SRC), 'la tabla de equipos lo usa');
  chk(/escHtml\(_paisES\(parts\.clean,parts\.fed\)\)/.test(SRC), 'las formaciones también');
  chk(/escHtml\(_paisES\(m\.aName,m\.aFed\)\)/.test(SRC), 'los cruces por países, también');
  chk(/escHtml\(_paisES\(cname,cfed\)\)/.test(SRC), 'y la ficha de cada país');
  // Lo importante: el CLIC sigue llevando el nombre original, si no se rompe la búsqueda.
  chk(/crOpenCountry\('\+crArg\(crk\)\+','\+crArg\(t\.name\)\+'\)/.test(SRC),
      'pero el clic sigue mandando el nombre ORIGINAL (traducir sólo lo que se ve)');
  chk(/var esNom = function\(n\)\{ return _paisES\(n, fedDe\[n\] \|\| ''\); \};/.test(SRC),
      'la radiografía traduce con el código que saca de la tabla');
}


console.log('\n=== 22. Auditoría de la Olimpiada: el jugador fantasma y el color ===');
{
  // Chess-Results rellena con "Sin jugador asignado" cuando un equipo no completa la formación.
  // No es una persona: no juega, no puntúa y NO ocupa un puesto en la lista del equipo.
  const boards = extraerFuncion('_stTeamBoardsAsRounds');
  chk(/_teamIsPlaceholder\(b\.nW\) \|\| _teamIsPlaceholder\(b\.nB\)/.test(boards),
      'los tableros con jugador fantasma no entran como partidas');
  const players = extraerFuncion('_stTeamPlayers');
  chk(/if \(b\.nW && !_teamIsPlaceholder\(b\.nW\)\) filaA\.push/.test(players),
      'y el fantasma no ocupa un lugar en la lista del equipo (si no, corre un puesto a los de abajo)');

  // En un torneo POR EQUIPOS el color no se sabe: no hay que inventarlo.
  const jugador = extraerFuncion('crOpenPlayer');
  chk(/sinColor:true/.test(jugador),
      'el historial de un torneo por equipos se marca como "sin color"');
  chk(/hh\.sinColor \?/.test(SRC) && /el color no viene en los datos/.test(SRC),
      'y en pantalla sale un guioncito, no un ⬜ o un ⬛ inventado');
  chk(/if\(p\.w===name\)\{ history\.push\(\{round:r,color:'Blancas',opp/.test(jugador),
      'en los torneos individuales el color se sigue mostrando igual que siempre');
}


console.log('\n=== 23. El ojito nunca se queda mudo ===');
{
  // Los ojitos salen en TODAS las mesas a propósito: en la web publicada, mostrarlos sólo donde ya
  // hay partida cargada dejaba media ficha sin ojito (sólo las rondas que el visitante había
  // recorrido). El trato es: si la partida no está, se AVISA. Antes había salidas mudas y el clic
  // parecía que colgaba la web.
  const teamOpen = extraerFuncion('_teamOpenBoardGame');
  chk(!/^function _teamOpenBoardGame\(round, wName, bName\)\{\s*if\(typeof _tdCtx==='undefined' \|\| !_tdCtx \|\| !_tdCtx\.pgnKey\) return;/m.test(teamOpen),
      'por equipos: ya no se va en silencio cuando el torneo no tiene ninguna partida cargada');
  chk(/var hayPool = /.test(teamOpen) && /var idx = hayPool \? buscar\(\) : -1;/.test(teamOpen),
      'en su lugar sigue de largo y termina avisando');
  chk((teamOpen.match(/_tdToast\('Esta partida no se transmitió\.'\)/g) || []).length >= 2,
      'por equipos avisa en las dos salidas posibles');

  const crOpen = extraerFuncion('crOpenGame');
  chk((crOpen.match(/_tdToast\('Esta partida no se transmitió\.'\)/g) || []).length >= 2,
      'y en los torneos individuales también (antes no avisaba en ninguna)');
  chk(/return;\s*\}\s*\/\/ Cualquier otra salida/.test(crOpen.replace(/\r/g, '')),
      'el aviso queda al final, como red que atrapa cualquier camino');

  // Y el ojito se sigue mostrando SIEMPRE (no volver a esconderlo: fue una decisión, no un descuido).
  chk(/var _verMesa = !_fantasma && \(!!b\.res \|\|/.test(SRC),
      'las mesas con resultado siguen mostrando el ojito aunque la partida todavía no esté cargada');
}


console.log('\n=== 24. Enganchar la partida cuando el nombre viene escrito distinto ===');
{
  // Chess-Results y Lichess no siempre escriben igual a la misma persona:
  //   "Ah Kye, Benitot"  (cuadro)  vs  "Ah-Kye, Benitot Emmanuel"  (Lichess)
  // El ojito decía "no se transmitió" teniendo la partida ahí. El segundo intento la encuentra.
  const contiene = new Function('return (' + extraerFuncion('_crNombreContenido') + ')')();
  chk(contiene('ah benitot kye', 'ah benitot emmanuel kye') === true,
      'el nombre corto contenido en el largo es la misma persona');
  chk(contiene('ah benitot kye', 'ah benitot kye') === true, 'y el mismo nombre, obviamente');
  chk(contiene('garcia juan', 'lopez pedro') === false, 'dos personas distintas, no');
  chk(contiene('garcia', 'garcia juan carlos') === false,
      'un apellido suelto NO alcanza: se piden al menos dos palabras en común');
  chk(contiene('', 'garcia juan') === false && contiene('garcia juan', '') === false, 'sin nombre, no');

  // Lo importante: el segundo intento corre SÓLO si la búsqueda exacta no encontró nada, así que
  // no puede cambiar ningún resultado que ya funcionaba.
  const buscar = extraerFuncion('crFindGameIdx');
  chk(/if\(hit!==undefined\) return hit;/.test(buscar),
      'la búsqueda exacta de siempre sigue primero y devuelve al toque');
  chk(buscar.indexOf('_crNombreContenido') > buscar.indexOf('if(hit!==undefined) return hit;'),
      'y el segundo intento va DESPUÉS (por eso no toca lo que ya andaba)');
  chk(/_crNombreContenido\(wt,e\.w\) && _crNombreContenido\(bt,e\.b\)/.test(buscar),
      'para aceptar una partida tienen que coincidir LOS DOS jugadores');
  chk(/porRonda\[rkey\]/.test(buscar), 'y sólo se miran las partidas de ESA ronda');

  // La mesa con jugador fantasma no lleva ojito: ahí no se jugó nada.
  chk(/var _fantasma = _teamIsPlaceholder\(b\.nW\) \|\| _teamIsPlaceholder\(b\.nB\);/.test(SRC),
      'la mesa con "Sin jugador asignado" no muestra ojito');
  chk(/var _verMesa = !_fantasma && \(!!b\.res \|\|/.test(SRC),
      'y el resto de las mesas lo siguen mostrando igual que antes');
}


console.log('\n=== 25. El arranque en frío de una ronda con varias transmisiones ===');
{
  // Una ronda de Olimpiada son 4 o 5 transmisiones de Lichess (Open I, II, III…). Se pedían todas
  // juntas estando FRÍAS y Lichess devolvía 429 a casi todas: de 4 entraba UNA (100 partidas de
  // 370) y el fallo se tragaba en silencio. Acá se simula ese escenario con un fetch de mentira.
  const fuente = extraerFuncion('_bcFetchRoundPgns');

  function armar(respuestas) {
    const pedidos = [];
    const _fetchTO = (url) => {
      const id = url.split('round/')[1].split('.pgn')[0];
      pedidos.push(id);
      const r = respuestas[id].shift();
      if (r === 429) return Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('{"error":"Too many requests"}') });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(r) });
    };
    const fn = new Function('_fetchTO', '_liApi', '_bcIsPlaceholderGame', 'setTimeout',
      fuente + '; return _bcFetchRoundPgns;')(
        _fetchTO, (p) => 'https://w/' + p, () => false, (cb) => cb());   // sin esperas reales
    return { fn, pedidos };
  }
  const partida = (n) => '[Event "Olimpiada"]\n[White "A' + n + '"]\n\n1. e4 e5 1-0';
  const ronda = (n) => [partida(n), partida(n + 100)].join('\n\n');   // 2 partidas por transmisión
  const correr = (fn, ids, opts) => new Promise((res) => fn(ids, (g, i) => res({ g, i }), opts));

  // Caso 1: las 4 responden bien a la primera.
  {
    const { fn, pedidos } = armar({ a: [ronda(1)], b: [ronda(2)], c: [ronda(3)], d: [ronda(4)] });
    const { g, i } = await correr(fn, ['a', 'b', 'c', 'd']);
    chk(g.length === 8, 'con todo caliente llegan las 8 partidas de las 4 transmisiones', g.length);
    chk(pedidos.length === 4, 'y se pide una sola vez cada una', pedidos.length);
    chk(i.faltan === 0, 'sin faltantes');
  }

  // Caso 2: el escenario real — 3 de 4 dan 429 y entran al reintentar.
  {
    const { fn, pedidos } = armar({
      a: [ronda(1)], b: [429, ronda(2)], c: [429, ronda(3)], d: [429, 429, ronda(4)],
    });
    const { g, i } = await correr(fn, ['a', 'b', 'c', 'd']);
    chk(g.length === 8, 'con 429 en 3 de 4, el reintento las recupera TODAS', g.length);
    chk(i.faltan === 0, 'y la ronda queda completa', i.faltan);
    chk(pedidos.length === 8, 'se reintentó sólo lo que falló, no todo de nuevo', pedidos.length + ' pedidos');
  }

  // Caso 3: una transmisión que no entra ni con reintentos → se AVISA (antes se callaba).
  {
    const { fn } = armar({ a: [ronda(1)], b: [429, 429, 429, 429] });
    let aviso = null;
    const { g, i } = await correr(fn, ['a', 'b'], { onIncompleta: (faltan, total) => { aviso = faltan + '/' + total; } });
    chk(g.length === 2, 'se entrega lo que sí llegó (la ronda no queda vacía)', g.length);
    chk(i.faltan === 1, 'y se informa cuántas transmisiones faltaron', i.faltan);
    chk(aviso === '1/2', 'con aviso al que llamó: antes la ronda se daba por completa', aviso);
  }

  // Caso 4: el cuerpo del 429 no puede colarse como si fuera una partida.
  {
    const { fn } = armar({ a: [429, 429, 429, 429] });
    const { g } = await correr(fn, ['a']);
    chk(g.length === 0, 'el texto de error de Lichess NO entra como partida', g.length);
  }

  chk(/if\(!r\.ok\) throw new Error\('HTTP ' \+ r\.status\);/.test(fuente),
      'se mira el estado de la respuesta antes de leerla');
}


console.log('\n=== 26. El árbol de aperturas del torneo ===');
{
  const unificar = new Function('return (' + extraerFuncion('_apUnificar') + ')')();
  // La tabla nombra la misma apertura de dos formas y quedaban contadas por separado (en el perfil
  // de Faustino se veía 'Siciliana 36' y 'Defensa Siciliana 28', cuando son 64).
  const u = unificar({ 'Siciliana': 36, 'Defensa Siciliana': 28, 'Inglesa': 6, 'Apertura Inglesa': 5 });
  chk(u['Siciliana'] === 64, 'junta "Defensa Siciliana" con "Siciliana"', u['Siciliana']);
  chk(u['Inglesa'] === 11 && u['Apertura Inglesa'] === undefined, 'y "Apertura Inglesa" con "Inglesa"');
  const v = unificar({ 'Defensa Holandesa': 4, 'Gambito de Dama': 9 });
  chk(v['Defensa Holandesa'] === 4 && v['Gambito de Dama'] === 9,
      'si la forma corta no existe, no se inventa: quedan como están');

  // El conteo, con detector y dedup de mentira para poder probar SOLO las reglas propias.
  const armar = (nombrePorPgn) => new Function(
    'dedupGamesByMoves', 'detectOpeningByMoves', 'parsePgnHeaders', '_noticiaFechaHoy',
    'var _AP_V=1, _AP_MIN_N=3, _AP_MIN_REL=25;' + extraerFuncion('_apUnificar') + extraerFuncion('_stAperturasCalc')
    + '; return _stAperturasCalc;')(
      (items, get) => { const vistos = new Set(), out = []; items.forEach(it => { const p = get(it); if (!vistos.has(p)) { vistos.add(p); out.push(it); } }); return out; },
      (pgn) => ({ name: nombrePorPgn(pgn) }), () => ({}), () => '1 Ene 2026');

  // 100 partidas: 40 Siciliana, 30 Española, 20 Francesa, 5 Holandesa, 5 sin nombre.
  const lista = [];
  const meter = (n, nombre) => { for (let k = 0; k < n; k++) lista.push(nombre + '#' + k); };
  meter(40, 'Siciliana'); meter(30, 'Española'); meter(20, 'Francesa'); meter(5, 'Holandesa'); meter(5, '');
  const calc = armar((p) => p.split('#')[0]);
  const r = calc(lista);
  chk(r.partidas === 100 && r.conNombre === 95, 'cuenta las partidas y las que pudo clasificar', r.partidas + '/' + r.conNombre);
  chk(r.top.length === 3, 'la Holandesa (5, contra 40 de la más jugada) queda AFUERA', r.top.map(o => o.nombre).join(', '));
  chk(r.top[0].nombre === 'Siciliana' && r.top[0].cantidad === 40 && r.top[0].pct === 42.1,
      'y el porcentaje se calcula sobre las clasificadas', r.top[0].pct + '%');

  // El piso tiene DOS condiciones: 3% y 3 partidas. En un torneo chico manda el mínimo de 3.
  const chico = [];
  for (let k = 0; k < 20; k++) chico.push('Siciliana#' + k);
  chico.push('Holandesa#1'); chico.push('Holandesa#2');   // 2 de 22 = 9% pero sólo 2 partidas
  const rc = calc(chico);
  chk(rc.top.length === 1 && rc.top[0].nombre === 'Siciliana',
      'con 2 partidas no entra, aunque sean el 9% del torneo chico', rc.top.map(o => o.nombre).join(', '));

  // La MISMA partida por Lichess, por Chess-Results y por el pool no puede contarse tres veces.
  const triple = lista.concat(lista).concat(lista);
  const rt = calc(triple);
  chk(rt.partidas === 100, 'la misma lista tres veces sigue siendo 100 partidas', rt.partidas);
  chk(rt.repetidasQueSeSacaron === 200, 'y avisa cuántas repetidas sacó', rt.repetidasQueSeSacaron);
  chk(JSON.stringify(rt.top) === JSON.stringify(r.top), 'el ranking no cambia por los duplicados');

  // 'Apertura 1.d4 Nf6' es el cajón de las que no entraron en ninguna con nombre, no una apertura.
  const conCajon = [];
  for (let k = 0; k < 30; k++) conCajon.push('Siciliana#' + k);
  for (let k = 0; k < 17; k++) conCajon.push('Apertura 1.d4 Nf6#' + k);
  const rr = calc(conCajon);
  chk(rr.top.length === 1 && rr.top[0].nombre === 'Siciliana',
      'el cajón "Apertura 1.d4 Nf6" no se lista como más jugada', rr.top.map(o => o.nombre).join(', '));

  chk(calc([]) === null && calc(['']) === null, 'sin partidas no devuelve nada');

  // El árbol se GUARDA: el visitante no lo calcula (con la carga por ronda le saldría mal).
  const boton = extraerFuncion('_stCalcularAperturas');
  chk(/if \(_ondemand\) return;/.test(boton), 'el botón es sólo del modo autor');
  chk(/_tdEnsureAllLoaded/.test(boton), 'y antes de contar baja TODAS las rondas que falten');
  chk(/data\.aperturas = ap;[\s\S]{0,40}crDataSave\(key, data\)/.test(boton),
      'el resultado se guarda con los datos del torneo (así viaja a la web publicada)');
  const seccion = extraerFuncion('_stAperturasHtml');
  chk(/if \(!ap && !esAutor\) return '';/.test(seccion),
      'y al visitante no se le muestra la sección si todavía no se calculó');
  chk(/dedupGamesByMoves/.test(extraerFuncion('_stAperturasCalc')),
      'el conteo usa el dedup por JUGADAS, que reconoce la misma partida venida de dos fuentes');
}


console.log('\n=== 27. Las aperturas del PERFIL, sin partirse en dos ===');
{
  // En el perfil pasaba lo mismo que en el torneo: 'Siciliana' y 'Defensa Siciliana' eran dos filas
  // (36 y 28, cuando son 64). Ahora se unen — y el FILTRO tiene que usar el mismo criterio, si no
  // tocás la fila unida y te muestra la mitad de las partidas.
  chk(/_pgOpMap = \{\};[\s\S]{0,220}topOpenings\(_apUnificar\(cs\.white, _pgOpMap\), 4\)/.test(SRC),
      'las columnas del perfil unen las aperturas repetidas');
  chk(/topOpenings\(_apUnificar\(cs\.black, _pgOpMap\), 4\)/.test(SRC), 'con blancas y con negras');
  chk(/if \(_pgOpMap && _pgOpMap\[shortOpG\]\) shortOpG = _pgOpMap\[shortOpG\];/.test(SRC),
      'y el filtro por apertura aplica la MISMA unión (si no, mostraría la mitad)');

  // El mapa sale de la misma función que usa el torneo: un solo criterio para los dos lados.
  const unificar = new Function('return (' + extraerFuncion('_apUnificar') + ')')();
  const mapa = {};
  unificar({ 'Siciliana': 36, 'Defensa Siciliana': 28, 'Holandesa': 3 }, mapa);
  chk(mapa['Defensa Siciliana'] === 'Siciliana', 'el mapa dice a dónde fue cada nombre unido');
  chk(mapa['Holandesa'] === undefined, 'y no anota las que no se tocaron');
}


console.log('\n=== 28. Cuándo va la Radiografía y cuándo se hornea ===');
{
  const pendiente = new Function('return (' + extraerFuncion('_stTeamRondaSinJugar') + ')')();
  const disponible = new Function(
    extraerFuncion('_stTeamRondaSinJugar') + extraerFuncion('_stStatsAvailable') + '; return _stStatsAvailable;')();

  // Chess-Results publica la formación de la ronda que viene DÍAS ANTES de jugarse: mesas con
  // nombres, Elos y todos los resultados vacíos (pasó con la Liga Nacional, ronda 2 publicada el
  // 30/08 para jugarse el 06/09). Eso prueba que el torneo sigue.
  const jugada = { boards: [{ nW: 'A', nB: 'B', res: '1-0' }, { nW: 'C', nB: 'D', res: '0-1' }] };
  const emparejada = { boards: [{ nW: 'E', nB: 'F', res: '' }, { nW: 'G', nB: 'H', res: '' }] };
  chk(pendiente({ teamRounds: { 1: [jugada], 2: [emparejada] } }) === true,
      'una ronda emparejada y sin jugar dice que el torneo sigue en curso');
  chk(pendiente({ teamRounds: { 1: [jugada], 2: [jugada] } }) === false,
      'con todas las rondas jugadas, no');
  chk(pendiente({ teamRounds: { 1: [jugada], 2: [{ aName: 'X', bName: 'Y', score: '2:2' }] } }) === false,
      'un cruce por países SIN formación no cuenta (no trae mesas, no prueba nada)');

  // El agujero que tapa: un torneo por equipos SIN estado entraba igual. Era la puerta para las
  // ligas viejas cargadas a mano —que no tienen estado pero sí terminaron— y se colaba cualquiera.
  const cuadro = (rondas) => ({
    teamStandings: { kind: 'result', teams: [{ name: 'A' }, { name: 'B' }] },
    teamRounds: rondas
  });
  const sinEstado = { name: '', location: '', dates: '', typ: '', isTeam: true, status: '' };
  chk(disponible('k', cuadro({ 1: [jugada], 2: [jugada] }), sinEstado) === true,
      'la liga vieja sin estado sigue teniendo su radiografía');
  chk(disponible('k', cuadro({ 1: [jugada], 2: [emparejada] }), sinEstado) === false,
      'pero el torneo en curso sin estado ya NO (era la Liga Nacional en la ronda 1)');
  chk(disponible('k', cuadro({ 1: [jugada], 2: [emparejada] }), { isTeam: true, status: 'done' }) === false,
      'ni siquiera si el calendario dice que terminó: mandan los datos');

  // Hornear no puede depender del DÍA en que guardás. El Memorial Emilio Sánchez Jerez se guardó
  // mientras se jugaba (no se horneó), después terminó solo por la fecha, se encendió la pestaña y
  // el cálculo le caía al teléfono del visitante.
  const hornear = extraerFuncion('_stBakeForPublish');
  chk(/metaFin.status = 'done';/.test(hornear),
      'al hornear se ignora el calendario: si los datos dan, se hornea');
  chk(/_stStatsAvailable\(key, d, metaFin\)/.test(hornear), 'y la comprobación usa esa meta, no la original');
  chk(/_statsBuild\(key, d, meta\)/.test(hornear),
      'pero las estadísticas se arman con la meta DE VERDAD (el nombre y las fechas del torneo)');
  chk(/_stSig/.test(extraerFuncion('_statsGet')),
      'y si el torneo avanzó después, la firma no coincide y se recalcula igual (no se publica nada viejo)');
}


console.log('\n=== 29. La formación inventada de la próxima ronda ===');
{
  // Chess-Results publica el CRUCE por equipos (qué equipo juega con qué equipo) días antes que la
  // FORMACIÓN mesa por mesa, que la carga el árbitro cuando los capitanes entregan la alineación.
  // Si le pedís una formación que no publicó, hay torneos que devuelven vacío (Europeo Senior 65+)
  // y torneos que te la FABRICAN con el orden de fuerza registrado de cada equipo (Liga Nacional
  // 2026: Obras aparecía con Flores, Felgaer y Perez Ponsa —sus tableros 1, 2 y 3 de planilla— en
  // una ronda que se juega el 6 de septiembre, y sacaba a jugadores que ese día juegan en Brasil).
  const bajar = extraerFuncion('_crAutoFetchTeam');
  chk(/var maxFormacion = maxR;/.test(bajar),
      'se recuerda hasta qué ronda hay formación PUBLICADA (los links art=3&rd=N del menú)');
  chk(/\(maxFormacion && r > maxFormacion\)[\s\S]{0,40}Promise\.resolve\(null\)/.test(bajar),
      'y más allá de eso NO se pide la formación (no se confía en que venga vacía)');
  chk(/_crExportUrl\(crUrl, 2, r\)/.test(bajar),
      'el cruce por equipos SÍ se sigue pidiendo: ese sale antes y es de verdad');
  chk(/if \(maxFormacion\) Object\.keys\(data\.teamRounds\)[\s\S]{0,120}delete data\.teamRounds\[n\]/.test(bajar),
      'y si de una vuelta anterior quedó una formación inventada guardada, se tira');

  // El menú del torneo es la fuente: 'Emparejamientos por mesas: Rd.1' = hasta la 1.
  const descubrir = extraerFuncion('_crDiscoverRounds');
  chk(/art=' \+ pairArt \+ '&\(\?:amp;\)\?rd=/.test(descubrir), 'la busca en los links del menú');
  const maxDe = (html, art) => {
    const re = new RegExp('art=' + art + '&(?:amp;)?rd=([0-9]+)', 'gi');
    let m, x = 0; while ((m = re.exec(html))) x = Math.max(x, +m[1]); return x || null;
  };
  const menuLiga = 'a href="x?lan=2&amp;art=2&amp;rd=1&amp;t=1" a href="x?lan=2&amp;art=2&amp;rd=2&amp;t=1" a href="x?lan=2&amp;art=3&amp;rd=1&amp;t=1"';
  const menuEuro = 'art=2&amp;rd=4 art=3&amp;rd=1 art=3&amp;rd=2 art=3&amp;rd=3 art=3&amp;rd=4';
  chk(maxDe(menuLiga, 3) === 1 && maxDe(menuLiga, 2) === 2,
      'Liga Nacional: cruces hasta la 2, formación sólo hasta la 1', maxDe(menuLiga, 3) + '/' + maxDe(menuLiga, 2));
  chk(maxDe(menuEuro, 3) === 4,
      'Europeo Senior: formación hasta la 4 → no se le saca ninguna', maxDe(menuEuro, 3));
  chk(maxDe('sin links', 3) === null,
      'y si el torneo no expone los links (Olimpiadas), no se toca nada: sigue como antes');
}

console.log('\n' + (fallos ? ('❌ ' + fallos + ' PRUEBAS FALLARON') : '✅ Todas las pruebas pasaron.') + '\n');
process.exitCode = fallos ? 1 : 0;
