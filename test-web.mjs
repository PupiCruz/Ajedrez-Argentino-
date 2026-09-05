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
let corridas = 0;
function chk(ok, txt, extra) {
  corridas++;
  console.log((ok ? '  ok  ' : ' FALLA') + ' | ' + txt + (extra !== undefined ? ('  → ' + extra) : ''));
  if (!ok) fallos++;
}

// ── Red de seguridad ────────────────────────────────────────────────
// Este banco recorta funciones del index.html POR NOMBRE. Si una empieza a llamar a un ayudante
// que no está listado, la copia recortada revienta y Node MATA el archivo entero: dejaban de
// correr cientos de pruebas sin que se notara. Acá se avisa fuerte y se dice qué falta.
const ESPERADAS = 520;   // subir cuando se agreguen pruebas. NUNCA baja solo.
process.on('uncaughtException', (e) => {
  const falta = /(\w+) is not defined/.exec(e.message || '');
  console.log('\n' + '='.repeat(78));
  console.log('🚨 EL BANCO SE CORTÓ. No terminó: dejó de correr a la mitad.');
  console.log('   Alcanzó a correr ' + corridas + ' de ' + ESPERADAS + ' comprobaciones.');
  if (falta) {
    console.log('');
    console.log('   FALTA EL AYUDANTE:  ' + falta[1]);
    console.log('   Arreglo: agregarlo a la lista de nombres del bloque que se cayó, en');
    console.log('   test-web.mjs (buscá  extraerFuncion  para encontrar las listas).');
  } else {
    console.log('   Motivo: ' + (e.message || e));
  }
  console.log('='.repeat(78) + '\n');
  process.exit(1);
});

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
  // OJO: hay que listar TAMBIÉN los ayudantes que las funciones se llaman entre sí. _stRpFromRounds
  // usa _crStandingsEloMap y _crOppElo (el arreglo de la performance 3000, publicado el 04/09/2026):
  // si faltan, el banco se corta a la mitad y no llega a correr el resto de las pruebas.
  const nombres = ['_stJugada','_stPts','_stRounds','_stDp','_stRpFromRounds','_stColors',
                   '_stRace','_stStreak','_stBoard1','_stElo','_stDays','_stSig',
                   '_crStandingsEloMap','_crOppElo'];
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
    'var _AP_V=2, _AP_MIN_N=3, _AP_MIN_REL=25, _AP_MIN_FILAS=4, _AP_MIN_PCT=6;'
    + extraerFuncion('_apUnificar') + extraerFuncion('_stAperturasCalc')
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

  // Una apertura que ARRASA dejaba la sección con una sola barra: con 109 Sicilianas el 25% pone el
  // corte en 28 partidas y todo lo demás queda afuera (pasó de verdad, en un torneo de 346 partidas).
  // Ahora, si el 25% deja menos de 4 filas, se completa con las que siguen pesando (3+ partidas y 6%+).
  const meterEn = (arr, n, nombre) => { for (let k = 0; k < n; k++) arr.push(nombre + '#' + k); };
  const arrasa = [];
  meterEn(arrasa, 109, 'Siciliana'); meterEn(arrasa, 27, 'Francesa');
  meterEn(arrasa, 24, 'Caro-Kann');  meterEn(arrasa, 22, 'Inglesa'); meterEn(arrasa, 8, 'Holandesa');
  const ra = calc(arrasa);
  chk(ra.top.length === 4, 'la apertura que arrasa ya no queda sola: se completa hasta 4 filas', ra.top.length);
  chk(ra.top.map(o => o.nombre).join(', ') === 'Siciliana, Francesa, Caro-Kann, Inglesa',
      'y entran las que siguen, en orden', ra.top.map(o => o.nombre + ' ' + o.cantidad).join(' · '));
  chk(!ra.top.some(o => o.nombre === 'Holandesa'),
      'pero la Holandesa (8 de 190 = 4,2%) sigue afuera: no se completa con cualquier cosa');

  // Y el torneo con reparto parejo NO cambia: ahí el 25% ya deja 3 filas y la Holandesa de 5
  // partidas sobre 95 (5,3%) tampoco entra por la puerta de atrás.
  chk(r.top.length === 3 && !r.top.some(o => o.nombre === 'Holandesa'),
      'el torneo parejo queda igual que antes (la regla nueva no lo toca)', r.top.length + ' filas');

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
  // Las estadísticas se arman con la meta DE VERDAD (el nombre y las fechas del torneo), NO con la
  // forzada a "done". Se le agrega el nombre de la categoría, que sale del sufijo de la clave.
  chk(/_statsBuild\(key, d, _metaCat\)/.test(hornear) && !/_statsBuild\(key, d, metaFin\)/.test(hornear),
      'pero las estadísticas se arman con la meta DE VERDAD, no con la forzada');
  chk(/_metaCat\.cat = meta\.cats\[/.test(hornear),
      'y esa meta lleva el nombre de la categoría (para saber si sus medallas valen)');
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

console.log('\n=== 30. "Finalizado" a mano y lo horneado que no se tapa ===');
{
  // XXVII Open de Sants (30/08/2026): el autor lo marcó Finalizado, recalculó las aperturas, guardó y
  // publicó, y en la web no salían. Dos fallas encadenadas:
  //   1) pgnGetTorneosForList NO copiaba `finished` del manifest → renderTorneos caía en la regla de la
  //      FECHA y el último día el torneo seguía figurando EN CURSO → _refreshLiveLeaders le pedía la
  //      tabla a Chess-Results al entrar…
  //   2) …y _liveStandingsFetch la guardaba en el localStorage del visitante ANTES de que llegara
  //      data/cr/<clave>.json. Como crDataLoad lee localStorage primero, esa copia (rondas + tabla y
  //      nada más) tapaba para siempre la radiografía y las aperturas horneadas. En incógnito pasaba
  //      igual, porque el envenenamiento se rehacía en cada carga.
  const lista = extraerFuncion('pgnGetTorneosForList');
  chk((lista.match(/finished: !!entry\.finished/g) || []).length === 2,
      'la lista de torneos se lleva el "Finalizado" del autor (web publicada Y modo autor)',
      (lista.match(/finished: !!entry\.finished/g) || []).length + '/2');

  // Y renderTorneos lo mira ANTES que al calendario.
  const i = SRC.indexOf('pgnGetTorneosForList().forEach');
  chk(i > 0 && /st\.finished \? 'done'/.test(SRC.slice(i, i + 400)),
      'y "Finalizado" manda sobre computeTourStatus (la regla de la fecha)');

  // El injerto: lo horneado es del AUTOR, así que el archivo gana sobre lo que escribe el vivo.
  const load = extraerFuncion('crDataLoad');
  chk(/_ondemand && d && typeof d === 'object'\) _crGraftBaked\(key, d\)/.test(load),
      'crDataLoad injerta lo horneado cuando el localStorage no lo trae');
  chk(/_ondemand && f\) _crGraftBaked\(key, f\)/.test(load),
      'y también cuando el cuadro sale del archivo por clave alias');
  chk(load.split('\n').filter(l => /_crGraftBaked\(key/.test(l)).every(l => /_ondemand/.test(l)),
      'sólo en la web publicada: en modo autor el localStorage es la fuente de edición');

  const graft = extraerFuncion('_crGraftBaked');
  chk(/!d\.aperturas/.test(graft) && /_crBakedFor\(key, 'aperturas'\)/.test(graft)
      && /!d\.stats/.test(graft) && /_crBakedFor\(key, 'stats'\)/.test(graft),
      'injerta los DOS campos horneados, y sólo si faltan (nunca pisa lo que ya está)');

  // El alias sigue funcionando: el autor guarda 'tz', la web abre 'ls'.
  const alts = extraerFuncion('_crEmbeddedAlts');
  chk(/'cr2_tz_', 'cr2_ls_', 'cr2_hc_'/.test(alts) && /out\.indexOf\(k\) < 0/.test(alts),
      'las claves candidatas son el mismo sufijo con cualquier prefijo, sin repetir');

  // Y si el MISMO torneo quedó guardado con dos claves (una vieja sin hornear y otra con las
  // aperturas), gana la que las tiene: no alcanza con devolver la primera que exista.
  const baked = extraerFuncion('_crBakedFor');
  chk(/for \(var i = 0; i < alts\.length; i\+\+\) \{ var e = window\.__EMBEDDED_CR__\[alts\[i\]\]; if \(e && e\[campo\]\) return e\[campo\]; \}/.test(baked),
      'y para lo horneado gana la clave que LO TENGA, no la primera que exista');
}

console.log('\n=== 31. Las fichitas de material (piezas capturadas de ventaja) ===');
{
  // La cuenta es la de Lichess (cada pieza cancela una del rival del mismo tipo) y el dibujo es el
  // de chess.com (al lado de cada uno van las piezas del RIVAL, las que él comió).
  const varVal   = SRC.match(/var _AA_MAT_VAL = \{[^}]*\};/)[0];
  const varOrder = SRC.match(/var _AA_MAT_ORDER = \[[^\]]*\];/)[0];
  const M = new Function(varVal + varOrder
                         + extraerFuncion('aaMaterialDiff') + '\n' + extraerFuncion('aaMaterialHtml')
                         + ' return { aaMaterialDiff, aaMaterialHtml };')();

  // "wQ wP wP +8" — así se leen las fichitas de un bando de un vistazo.
  const fichas = (color, fen) => {
    const html = M.aaMaterialHtml(color, M.aaMaterialDiff(fen));
    const pcs = [...html.matchAll(/piezas\/(\w\w)\.svg/g)].map(m => m[1]);
    const pts = /\+(\d+)/.exec(html);
    return (pcs.join(' ') + (pts ? ' +' + pts[1] : '')).trim();
  };

  const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  chk(fichas('w', INICIAL) === '' && fichas('b', INICIAL) === '',
      'posición inicial: no se muestra nada de ningún lado');

  // ── LA TRAMPA DEL FEN: después de la posición vienen el turno y los enroques ─────────────
  // "... w KQkq" tiene una K, una Q, una k y una q; y con turno de negras hay una "b" suelta.
  // Si el recorrido no frenara en el primer espacio, contaría esas letras como piezas: un rey,
  // una dama y hasta un alfil que no existen. Por eso `aaMaterialDiff` corta en el espacio.
  chk(fichas('w', '4k3/8/8/8/8/8/8/4K3 b - - 0 1') === '' &&
      fichas('b', '4k3/8/8/8/8/8/8/4K3 b - - 0 1') === '',
      'rey contra rey con turno de NEGRAS: la "b" del turno no se cuenta como alfil');
  chk(fichas('w', '4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1') === '' &&
      fichas('b', '4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1') === '',
      'y las letras de los enroques (KQkq) tampoco');

  // ── El color va AL REVÉS, como chess.com ──────────────────────────────────────────────────
  const SIN_H2 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR w - - 0 1';   // blancas sin el peón h2
  chk(fichas('b', SIN_H2) === 'wP +1',
      'blancas sin un peón: al lado de las NEGRAS va un peón BLANCO (el que se comieron) y +1',
      fichas('b', SIN_H2));
  chk(fichas('w', SIN_H2) === '', 'y al lado de las blancas, nada');

  // ── Lo que se cancela no se muestra; lo que sobra, sí, de los DOS lados ───────────────────
  // Blancas con 2 alfiles y 1 caballo, negras con 1 alfil y 2 caballos: cada uno tiene una pieza
  // de más, valen lo mismo (3 y 3), así que no hay "+N" para nadie.
  const CAMBIO = 'rnbqk1nr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R w - - 0 1';
  chk(fichas('w', CAMBIO) === 'bB' && fichas('b', CAMBIO) === 'wN',
      'alfil de más contra caballo de más: una fichita de cada lado y ningún número',
      fichas('w', CAMBIO) + '  /  ' + fichas('b', CAMBIO));

  // ── El "+N" lo lleva SOLO el que va ganando en puntos ─────────────────────────────────────
  const DAMA_x_TORRE_ALFIL = '1b1rk3/8/8/8/8/8/8/3QK3 w - - 0 1';   // dama (9) contra torre+alfil (8)
  chk(fichas('w', DAMA_x_TORRE_ALFIL) === 'bQ +1',
      'dama contra torre+alfil: las blancas muestran la dama y el +1',
      fichas('w', DAMA_x_TORRE_ALFIL));
  chk(fichas('b', DAMA_x_TORRE_ALFIL) === 'wR wB',
      'y las negras muestran torre y alfil, pero SIN número (van perdiendo)',
      fichas('b', DAMA_x_TORRE_ALFIL));

  // ── Orden de las fichitas: de la más valiosa a la menos ──────────────────────────────────
  const VENTAJA_GRANDE = '3qk3/pppppppp/8/8/8/8/PPPPPP2/1N2K3 w - - 0 1';
  chk(fichas('b', VENTAJA_GRANDE) === 'wQ wP wP +8',
      'primero la dama y después los peones (dama, torre, alfil, caballo, peón)',
      fichas('b', VENTAJA_GRANDE));
  chk(fichas('w', VENTAJA_GRANDE) === 'bN', 'y del otro lado el caballo suelto, sin número');

  // ── Los reyes nunca cuentan ──────────────────────────────────────────────────────────────
  const d = M.aaMaterialDiff('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  chk(d.score === 0 && JSON.stringify(d.w) === JSON.stringify(d.b), 'los reyes no suman ni restan');

  // ── Basura: no se cuelga ni inventa ──────────────────────────────────────────────────────
  chk(M.aaMaterialDiff('').score === 0 && M.aaMaterialDiff(null).score === 0 &&
      M.aaMaterialDiff(undefined).score === 0, 'sin FEN devuelve cero, no explota');
  chk(M.aaMaterialHtml('w', null) === '', 'y sin cuenta hecha no dibuja nada');
}

console.log('\n=== 32. Candados de bugs viejos que no tenían red ===');
{
  // Seis bugs que YA pasaron en producción y que hasta ahora nada vigilaba. Cada bloque de acá
  // es el candado de uno: si alguien toca esa función y vuelve el bug, esto se pone rojo.

  // ── Fechas del torneo (bug: la ronda 7 no aparecía porque el torneo quedaba fuera de rango) ──
  const P = new Function(extraerFuncion('parseDateFromText') + ' return parseDateFromText;')();
  chk(P('13 AL 21 DE JUNIO 2026') === 20260621,
      'un rango en castellano toma el ÚLTIMO día (el final del torneo)', P('13 AL 21 DE JUNIO 2026'));
  chk(P('18 – 25 May 2026') === 20260525, 'y en inglés también', P('18 – 25 May 2026'));
  chk(P('1 al 3 de agosto de 2025') === 20250803, 'respeta el año escrito, no el de hoy', P('1 al 3 de agosto de 2025'));
  chk(P('San Juan 2026') === 20260000, 'sin mes reconocible se queda con el año solo', P('San Juan 2026'));
  chk(P('Buenos Aires') === 0 && P('') === 0 && P(null) === 0, 'sin nada devuelve 0, no una fecha inventada');

  const TDK = new Function(extraerFuncion('parseDateFromText') + extraerFuncion('tourDateKey')
                           + extraerFuncion('_isoToKey')
                           + 'function parsePgnHeaders(g){ return g.__h || {}; }'
                           + ' return tourDateKey;')();
  chk(TDK({ tournamentDates:'13 al 21 de junio de 2026', location:'Mar del Plata' }) === 20260621,
      'el campo "Fechas del torneo" manda sobre todo lo demás', TDK({ tournamentDates:'13 al 21 de junio de 2026', location:'Mar del Plata' }));
  chk(TDK({ games:[{ __h:{ Date:'2026.07.15' } }] }) === 20260715,
      'sin ese campo, la fecha sale del PGN de la primera partida', TDK({ games:[{ __h:{ Date:'2026.07.15' } }] }));
  chk(TDK({ games:[{ __h:{ Date:'2026.??.??' } }] }) === 20260000,
      'un PGN con la fecha incompleta (2026.??.??) no rompe: queda el año', TDK({ games:[{ __h:{ Date:'2026.??.??' } }] }));

  // ── El PGN con la fecha incompleta no tira el torneo a principio de año en el PERFIL ─────────
  // El listado de torneos del perfil agrupa las PARTIDAS del jugador, así que sólo tiene el nombre
  // y los PGN: la fecha sale del [Date]. Las simultáneas de Diego Flores en Catamarca vienen con
  // "2026.??.??" y quedaban en enero, aunque el torneo registrado diga 8 de agosto.
  const GDK = new Function(extraerFuncion('parseDateFromText') + extraerFuncion('tourDateKey')
                           + extraerFuncion('_isoToKey') + extraerFuncion('_normTourName')
                           + extraerFuncion('_tourGroupDateKey')
                           + 'function parsePgnHeaders(g){ var m = /\\[Date "([^"]*)"\\]/.exec(g); return { Date: m ? m[1] : \'\' }; }'
                           + ' return _tourGroupDateKey;')();
  const pgnCon = d => '[Date "' + d + '"]\n\n1. e4 *';
  const CATA = 'Simultáneas del GM Diego Flores en Catamarca 2026';
  const mapa = {}; mapa[new Function(extraerFuncion('_normTourName') + ' return _normTourName;')()(CATA)] = 20260808;

  chk(GDK({ name:CATA, games:[pgnCon('2026.??.??')] }, mapa) === 20260808,
      'con el [Date] incompleto, manda la fecha del torneo registrado',
      GDK({ name:CATA, games:[pgnCon('2026.??.??')] }, mapa));
  chk(GDK({ name:CATA, games:[pgnCon('2026.??.??')] }, {}) === 20260000,
      'y si el torneo NO está registrado se deja el año solo (no se inventa nada)',
      GDK({ name:CATA, games:[pgnCon('2026.??.??')] }, {}));
  chk(GDK({ name:CATA, games:[pgnCon('2026.01.09')] }, mapa) === 20260109,
      'pero un [Date] COMPLETO manda: el mapa no lo pisa',
      GDK({ name:CATA, games:[pgnCon('2026.01.09')] }, mapa));
  chk(GDK({ name:'Torneo Viejo de 2004', games:[pgnCon('2004.06.??')] }, mapa) === 20040600,
      'los PGN históricos sin día quedan como estaban', GDK({ name:'Torneo Viejo de 2004', games:[pgnCon('2004.06.??')] }, mapa));

  // ── Abreviaturas EN CASTELLANO (bug: 46 de 126 torneos fechados a principio de año) ──────────
  // La tabla de meses tenía los nombres largos en castellano y las abreviaturas en INGLÉS. Las
  // que no coinciden entre los dos idiomas —ago, dic, ene, abr, set— no las reconocía nadie.
  [['ene',1],['feb',2],['mar',3],['abr',4],['may',5],['jun',6],
   ['jul',7],['ago',8],['sep',9],['set',9],['oct',10],['nov',11],['dic',12]].forEach(function(par){
    chk(P('15 ' + par[0] + ' 2026') === 20260000 + par[1] * 100 + 15,
        'reconoce "' + par[0] + '" como mes ' + par[1], P('15 ' + par[0] + ' 2026'));
  });

  // ── De un rango gana el mes de MÁS A LA DERECHA (el final), no el primero de la lista ────────
  chk(P('28 Jun – 5 Jul 2026') === 20260705,
      'un rango que cruza de mes devuelve el FINAL (5 de julio, no 28 de junio)', P('28 Jun – 5 Jul 2026'));
  chk(P('27 Jul – 2 Ago 2026') === 20260802, 'y de julio a agosto también', P('27 Jul – 2 Ago 2026'));
  chk(P('28 Nov – 5 Dic 2026') === 20261205, 'y de noviembre a diciembre', P('28 Nov – 5 Dic 2026'));

  // ── "Mar del Plata" NO es marzo (es una de las sedes más usadas del país) ────────────────────
  chk(P('Mar del Plata') === 0, 'un nombre de lugar sin fecha no inventa un mes', P('Mar del Plata'));
  chk(P('Copa 2026 Mar del Plata') === 20260000,
      'y con un año al lado tampoco: el año no habilita la abreviatura', P('Copa 2026 Mar del Plata'));
  chk(P('6 – 6 Ago 2026 Mar del Plata') === 20260806,
      'pero una fecha de verdad en el mismo texto se sigue leyendo', P('6 – 6 Ago 2026 Mar del Plata'));

  // ── Las fechas ISO del torneo mandan sobre el texto libre ────────────────────────────────────
  chk(TDK({ startDate:'2026-08-08', endDate:'2026-08-08', tournamentDates:'texto cualquiera' }) === 20260808,
      'startDate/endDate le ganan al texto: es el dato estructurado',
      TDK({ startDate:'2026-08-08', endDate:'2026-08-08', tournamentDates:'texto cualquiera' }));
  chk(TDK({ startDate:'2026-08-22', endDate:'2026-08-29' }) === 20260829,
      'y de un rango ISO se toma el final', TDK({ startDate:'2026-08-22', endDate:'2026-08-29' }));
  chk(TDK({ startDate:'2026-08-22', endDate:null }) === 20260822,
      'con startDate solo, alcanza', TDK({ startDate:'2026-08-22', endDate:null }));

  // ── Contra los torneos DE VERDAD del catálogo ────────────────────────────────────────────────
  // El manifest guarda, de cada torneo, el texto de las fechas Y las fechas ISO. Las ISO son la
  // respuesta correcta: sirven de respuestas sabidas para el texto. Es la prueba más honesta que
  // hay de este arreglo, porque son los datos reales del sitio.
  if (fs.existsSync('data/manifest.js')) {
    const MAN = new Function('var window = {};' + fs.readFileSync('data/manifest.js', 'utf8')
                             + '; return window.__MANIFEST__;')();
    const conAmbos = (MAN.tournaments || []).filter(x => x.tournamentDates && (x.endDate || x.startDate));
    let clavados = 0;
    const fallados = [];
    conAmbos.forEach(x => {
      const esp = parseInt(String(x.endDate || x.startDate).replace(/-/g, ''), 10);
      if (P(x.tournamentDates) === esp) clavados++;
      else fallados.push('"' + x.tournamentDates + '" dio ' + P(x.tournamentDates) + ' y va ' + esp);
    });
    chk(conAmbos.length > 100, 'hay catálogo de verdad con qué comparar', conAmbos.length + ' torneos');
    chk(clavados === conAmbos.length,
        'el texto de las fechas da IGUAL que las fechas ISO, torneo por torneo',
        clavados + '/' + conAmbos.length + (fallados.length ? '  ← ' + fallados.slice(0, 3).join(' · ') : ''));
  }

  // ── Rating en vivo (dos bugs reales: el mismo torneo contado 2× y el blitz colándose) ────────
  const NTN = new Function(extraerFuncion('_normTourName') + ' return _normTourName;')();
  chk(NTN('Torneo "La Plata"') === NTN('Torneo La Plata'),
      'las comillas rectas no hacen que un torneo se cuente dos veces', NTN('Torneo "La Plata"'));
  chk(NTN('Torneo \u201cLa Plata\u201d') === NTN('Torneo La Plata') &&
      NTN('Torneo \u2018La Plata\u2019') === NTN('Torneo La Plata'),
      'ni las comillas tipográficas “ ” ‘ ’');
  chk(NTN('  IRT   de   la    Primavera ') === 'irt de la primavera',
      'los espacios de más y las mayúsculas tampoco', NTN('  IRT   de   la    Primavera '));

  const ISP = new Function(extraerFuncion('_isStandardPace') + ' return _isStandardPace;')();
  chk(ISP('rapid') === false && ISP('blitz') === false,
      'el rápido y el blitz NO entran en el rating clásico en vivo');
  chk(ISP('standard') === true && ISP('') === true && ISP(undefined) === true,
      'y lo clásico —o sin ritmo anotado— sí');

  // El ritmo vive en el manifest cuando la web está publicada; en el localStorage está vacío.
  chk(/_embeddedTournaments/.test(extraerFuncion('_tourNamePaceMap')),
      'el mapa de ritmos sigue leyendo el manifest (si no, en la web publicada el blitz se cuela)');
  chk(/_embeddedTournaments/.test(extraerFuncion('_liveRatingStd')),
      'y el rating en vivo también (si no, en la web publicada sale vacío)');

  // ── Jaque mate calificado como ?? (el {mate:0} del motor no trae el signo) ───────────────────
  const FM = new Function(extraerFuncion('_faFixMate0') + ' return _faFixMate0;')();
  chk(FM({ mate:0 }, '8/8/8/8/8/8/8/8 b - - 0 1').mate === 1,
      'mate con las NEGRAS por mover = ganaron las blancas (+1), no un error');
  chk(FM({ mate:0 }, '8/8/8/8/8/8/8/8 w - - 0 1').mate === -1,
      'y con las blancas por mover, ganaron las negras (-1)');
  chk(FM({ mate:3 }, '8/8/8/8/8/8/8/8 w - - 0 1').mate === 3, 'un mate normal no se toca');
  chk(FM(null, 'x') === null, 'sin evaluación no inventa nada');
  chk(FM({ mate:0, d:22, bm:'Qh7#' }, '8/8/8/8/8/8/8/8 b - - 0 1').d === 22 &&
      FM({ mate:0, d:22, bm:'Qh7#' }, '8/8/8/8/8/8/8/8 b - - 0 1').bm === 'Qh7#',
      'y no pierde la profundidad ni la jugada del motor');

  // ── Mesas duplicadas del .xlsx (torneos por equipos) ─────────────────────────────────────────
  const DB = new Function(extraerFuncion('_crDedupBoards') + ' return _crDedupBoards;')();
  const mesa = (nW, nB, res) => ({ tW:'A', nW:nW, eW:2000, tB:'B', nB:nB, eB:2100, res:res });
  const conRepe = { teamRounds: { 1: [{ boards:[ mesa('Ana','Beto','1-0'), mesa('Cata','Dani','0-1'), mesa('Ana','Beto','1-0') ] }] } };
  const limpio = DB(conRepe);
  chk(limpio.teamRounds[1][0].boards.length === 2,
      'una mesa repetida tal cual se saca (3 → 2)', limpio.teamRounds[1][0].boards.length);
  chk(conRepe.teamRounds[1][0].boards.length === 3, 'y el original no se toca (devuelve una copia)');
  const distintoRes = { teamRounds: { 1: [{ boards:[ mesa('Ana','Beto','1-0'), mesa('Ana','Beto','0-1') ] }] } };
  chk(DB(distintoRes).teamRounds[1][0].boards.length === 2,
      'pero dos mesas iguales con RESULTADO distinto NO se tocan: son datos, no basura');
  const sinRepe = { teamRounds: { 1: [{ boards:[ mesa('Ana','Beto','1-0'), mesa('Cata','Dani','0-1') ] }] } };
  chk(DB(sinRepe) === sinRepe, 'si no hay nada que limpiar devuelve el MISMO objeto (no copia al pedo)');
  chk(DB(null) === null && DB({}).teamRounds === undefined, 'sin cruces por equipos no rompe');

  // ── Hermanos y apellidos ajenos (apellido-primero sin coma) ──────────────────────────────────
  const SC = new Function(extraerFuncion('normStr') + extraerFuncion('nameTokens')
                          + extraerFuncion('_crSurnameConflict') + ' return _crSurnameConflict;')();
  chk(SC('Duarte Fernandez Perseo', { name:'Agustin Duarte Fernandez' }) === false,
      'sin nombre de pila conocido en el medio, no opina (lo veta pgnNameMatchesPlayer)');
  chk(SC('Gomez Fernandez Agustin', { name:'Agustin Duarte Fernandez' }) === true,
      'un apellido AJENO pegado al suyo, delante del nombre de pila = otra persona');
  chk(SC('Fernandez Agustin', { name:'Agustin Duarte Fernandez' }) === false,
      'pero su propio apellido solo, delante del nombre, es él');
  chk(SC('Duarte Fernandez Agustin', { name:'Agustin Duarte Fernandez' }) === false,
      'y sus DOS apellidos delante del nombre, también');
  chk(SC('Duarte Fernandez, Agustin', { name:'Agustin Duarte Fernandez' }) === false,
      'con coma no se mete: de eso se ocupa pgnNameMatchesPlayer');
  chk(SC('', { name:'Agustin Duarte Fernandez' }) === false && SC('Algo', { name:'Ana' }) === false,
      'vacío o jugador de un solo nombre: no opina, no rompe');
}

console.log('\n=== 33. El botón 🏆 "Ver torneo" en el listado del perfil ===');
{
  // El enganche entre una fila del perfil y el torneo de la web es POR NOMBRE. Es seguro porque los
  // candidatos son sólo los torneos de ESE jugador (el manifest los sabe por número, playerIndex) y
  // porque al subir partidas eligiendo el torneo, _stampEvent pisa el [Event] con el nombre del
  // torneo — cambiando sólo las comillas dobles por simples, que _normTourName saca.
  const armar = (manifest) => new Function('_manifest',
    extraerFuncion('_normTourName') + extraerFuncion('_catEventName') + extraerFuncion('_tourLinkMap')
    + ' return _tourLinkMap;')(manifest);

  const MAN = {
    tournaments: [
      { id:'tz_111', name:'VIII Abierto Internacional de Villa Constitucion "Copa ArcelorMittal"' },
      { id:'tz_222', name:'Simultáneas del GM Diego Flores en Catamarca 2026' },
      { id:'tz_333', name:'Torneo en el que NO jugó' },
      { id:'tz_555', name:'Campeonato Panamericano U-20 2026',
        categories:[{ name:'Absoluto' }, { name:'Femenino' }] },
      { id:'tz_444', name:'Pool de un perfil', playerOnly:true }
    ],
    playerIndex: { 7: ['tz_111', 'tz_222', 'tz_444', 'tz_555'] }
  };
  const mapa = armar(MAN)({ id:7 });
  const norm = new Function(extraerFuncion('_normTourName') + ' return _normTourName;')();

  const idDe = k => (mapa[norm(k)] || {}).id;
  const catDe = k => (mapa[norm(k)] || {}).cat;
  chk(idDe('VIII Abierto Internacional de Villa Constitucion "Copa ArcelorMittal"') === 'tz_111',
      'el torneo del jugador engancha con su id', idDe('VIII Abierto Internacional de Villa Constitucion "Copa ArcelorMittal"'));

  // EL CASO CLAVE: en el perfil el nombre llega con comillas SIMPLES (_stampEvent cambia " por ')
  // y en el manifest está con DOBLES. Tienen que ser el mismo torneo igual.
  chk(idDe("VIII Abierto Internacional de Villa Constitucion 'Copa ArcelorMittal'") === 'tz_111',
      'y engancha aunque el perfil lo tenga con comillas SIMPLES y el sitio con DOBLES');

  chk(mapa[norm('Torneo en el que NO jugó')] === undefined,
      'un torneo en el que el jugador no jugó NO entra (aunque exista en la web)');
  chk(mapa[norm('Pool de un perfil')] === undefined,
      'los pools de perfil (playerOnly) tampoco: no son torneos de la web');
  chk(Object.keys(mapa).length === 5,
      'el mapa tiene los 2 sueltos + el de categorías con sus 2 pestañas', Object.keys(mapa).length);

  // ── Torneos por CATEGORÍAS (lo que faltaba: el Panamericano U-20, el Rápido y Blitz de España) ──
  // Las partidas quedan estampadas "<Torneo> · <Categoría>", que NO es el nombre del torneo, así
  // que esas filas del perfil se quedaban sin botón.
  chk(idDe('Campeonato Panamericano U-20 2026 · Absoluto') === 'tz_555',
      'una fila con categoría engancha con el torneo', idDe('Campeonato Panamericano U-20 2026 · Absoluto'));
  chk(catDe('Campeonato Panamericano U-20 2026 · Absoluto') === 0 &&
      catDe('Campeonato Panamericano U-20 2026 · Femenino') === 1,
      'y trae el número de SU categoría, para abrir el torneo en esa pestaña (&cat=N)',
      catDe('Campeonato Panamericano U-20 2026 · Absoluto') + ' / ' + catDe('Campeonato Panamericano U-20 2026 · Femenino'));
  chk(catDe('Campeonato Panamericano U-20 2026') === -1,
      'el torneo pelado sigue enganchando, sin categoría (-1)', catDe('Campeonato Panamericano U-20 2026'));
  chk(idDe('Campeonato Panamericano U-20 2026 · Sub 8') === undefined,
      'una categoría que no existe no engancha con nada');

  // El link COMPARTIBLE de una categoría: ?torneo=<id>&cat=<C>.
  const HREF = new Function(extraerFuncion('_tourHref') + extraerFuncion('_tourHrefCat')
                            + ' return _tourHrefCat;')();
  chk(HREF('tz_1786718869665', 1) === '?torneo=tz_1786718869665&cat=1',
      'el link de una categoría lleva &cat=<C> (antes la barra lo borraba)', HREF('tz_1786718869665', 1));
  chk(HREF('tz_1786198204110', -1) === '?torneo=tz_1786198204110' &&
      HREF('tz_1786198204110') === '?torneo=tz_1786198204110',
      'y un torneo sin categorías queda con el link pelado, como siempre');
  chk(HREF('tz_x', 0) === '?torneo=tz_x&cat=0', 'la categoría 0 también viaja (no se cae por ser 0)');

  // La barra tiene que SEGUIR a la pestaña: cada pestaña reentra con el historial ya apilado, así que
  // sin el replaceState el link copiado sería siempre el de la categoría con la que se entró.
  chk(SRC.includes("var _tdUrl = _tourHrefCat(id, _tdActiveCat);") &&
      SRC.includes("history.replaceState({ tourDetail: true }, '', _tdUrl)"),
      'y al cambiar de pestaña la URL se reemplaza (si no, se comparte siempre la primera)');

  // La coreografía: el clic tiene que llevar la categoría hasta el detalle del torneo.
  chk(/function tourFromProfileClick\(e, type, id, cat\)/.test(SRC) &&
      /openTourFromProfile\(type, id, cat\)/.test(SRC),
      'el clic del botón pasa la categoría');
  chk(/function openTourFromProfile\(type, id, cat\)/.test(SRC) &&
      /openTournamentDetail\(type, id, false, cat\)/.test(SRC),
      'y el detalle del torneo la recibe y abre esa pestaña');

  // Sin ficha en el playerIndex (jugador nuevo, o modo autor sin índice) se cae al catálogo
  // completo — que igual no tiene nombres repetidos, así que no puede llevar al torneo equivocado.
  const mapaSinIndice = armar(MAN)({ id:999 });
  chk(Object.keys(mapaSinIndice).length === 6,
      'sin ficha en el índice usa el catálogo entero (menos los playerOnly)', Object.keys(mapaSinIndice).length);

  chk(Object.keys(armar(null)({ id:7 })).length === 0, 'sin manifest devuelve vacío, no rompe');
  chk(Object.keys(armar({})({ id:7 })).length === 0, 'y con un manifest sin torneos, tampoco');

  // Candado del catálogo REAL: si dos torneos del sitio tuvieran el mismo nombre normalizado, un
  // botón podría llevar al equivocado. Hoy son 126 nombres únicos; esto avisa si eso cambia.
  if (fs.existsSync('data/manifest.js')) {
    const M = new Function('var window = {};' + fs.readFileSync('data/manifest.js', 'utf8')
                           + '; return window.__MANIFEST__;')();
    const vistos = {}, repes = [];
    (M.tournaments || []).forEach(x => {
      const k = norm(x.name || '');
      if (vistos[k]) repes.push(x.name); else vistos[k] = 1;
    });
    chk(repes.length === 0,
        'ningún torneo del catálogo comparte nombre con otro (si no, el 🏆 podría errarle)',
        (M.tournaments || []).length + ' torneos' + (repes.length ? '  ← repetidos: ' + repes.slice(0, 3).join(' · ') : ''));
  }
}

console.log('\n=== 34. La vitrina de trofeos del perfil ===');
{
  // De cada radiografía horneada salen el podio y las medallas, y se dan vuelta por jugador. Lo que
  // entra depende del FORMATO del torneo: hay medallas que en un cerrado o en un match no valen.
  const AW = new Function(extraerFuncion('_awardsFromStats') + ' return _awardsFromStats;')();
  const tipos = st => AW(st).map(a => a.k).join(',');

  const P = (nombre, pos, puntos, rp) => ({ pos: pos, nombre: nombre, raw: nombre, puntos: puntos, rp: rp });
  const premios = {
    mejorRp: { raw:'Gomez, Ana', nombre:'Ana Gomez', rp:2600, sobreElo:180 },
    femenina: { raw:'Diaz, Rosa', nombre:'Rosa Diaz', pos:27, puntos:'6½' },
    sub20:   { raw:'Perez, Juan', nombre:'Juan Perez', pos:14, puntos:'6½', edad:18 },
    mas50:   { raw:'Lopez, Luis', nombre:'Luis Lopez', pos:5, edad:55 },
    revelacion: { raw:'Sosa, Ivo', nombre:'Ivo Sosa', desde:107, hasta:37 },
    mesa1:   { raw:'Otro, Uno', nombre:'Uno Otro', n:9 },
    racha:   { raw:'Otro, Dos', nombre:'Dos Otro', n:5 },
    masRatingSumo: { raw:'Otro, Tres', nombre:'Tres Otro', delta:44 }
  };
  const podio = [P('Uno',1,'8',2663), P('Dos',2,'7½',2563), P('Tres',3,'7½',2436)];
  const armar = (jugadores, rondas) => ({ torneo:{ jugadores:jugadores, rondas:rondas },
                                          campeon: podio[0], podio: podio, premios: premios });

  // ── SUIZO / abierto: entra todo lo elegido ──
  chk(tipos(armar(232, 9)) === 'c,2,3,fem,s20,m50,rev',
      'en un abierto entran el podio y las cuatro medallas', tipos(armar(232, 9)));
  chk(!/mesa1|racha|masRatingSumo/.test(JSON.stringify(AW(armar(232, 9)))),
      'y NO entran la mesa 1, la racha ni el rating sumado (devalúan la copa)');
  // La mejor performance suele ser del campeón: era una medalla que repetía lo que ya decía la copa.
  chk(tipos(armar(232, 9)).indexOf('rp') < 0,
      'ni la mejor performance, que casi siempre es la del campeón');

  // ── CERRADO / round robin: sólo el podio ──
  // Bug real que cazó el autor: en el Magistral Szmetan-Giardelli (10 jugadores, 9 rondas) a
  // Faustino Oro le contaba "mejor sub-20", y era el único sub-20 invitado.
  chk(tipos(armar(10, 9)) === 'c,2,3',
      'en un cerrado de 10 sólo el podio: las medallas ahí no significan nada', tipos(armar(10, 9)));
  chk(tipos(armar(6, 5)) === 'c,2,3', 'un hexagonal (6 jugadores, 5 rondas) también es cerrado', tipos(armar(6, 5)));
  chk(tipos(armar(6, 10)) === 'c,2,3', 'y a dos vueltas (6 jugadores, 10 rondas) sigue siendo cerrado', tipos(armar(6, 10)));

  // ── MANO A MANO: sólo quién ganó ──
  // El otro caso del autor: en Oro vs Martínez Alcántara le contaba la performance y el sub-20.
  chk(tipos(armar(2, 6)) === 'c', 'en un match sólo cuenta quién ganó', tipos(armar(2, 6)));

  // ── El límite entre cerrado y suizo ──
  chk(tipos(armar(40, 9)).indexOf('s20') >= 0,
      'un suizo de 40 con 9 rondas NO es cerrado: las medallas valen', tipos(armar(40, 9)));
  chk(tipos(armar(10, 8)).indexOf('s20') >= 0,
      'y 10 jugadores con 8 rondas tampoco llega a todos-contra-todos', tipos(armar(10, 8)));

  // ── El detalle que se muestra al tocar el trofeo ──
  const uno = AW(armar(232, 9));
  const det = k => (uno.filter(a => a.k === k)[0] || {}).d;
  chk(det('c') === '8 pts · Rp 2663', 'el campeón muestra sus puntos y su performance', det('c'));
  chk(det('s20') === '18 años · 14º del torneo', 'el sub-20, su edad y en qué puesto salió', det('s20'));
  chk(det('rev') === 'entró 107º y terminó 37º', 'la revelación, de dónde salió y a dónde llegó', det('rev'));

  // ── Nada raro con datos incompletos ──
  chk(AW(null).length === 0 && AW({}).length === 0, 'sin radiografía no devuelve trofeos');
  chk(AW({ torneo:{ jugadores:50, rondas:9 } }).length === 0, 'sin podio ni premios tampoco');
  chk(AW({ campeon: podio[0] }).length === 1,
      'sin el bloque `torneo` no se cuelga: cae en "abierto" y da lo que haya', AW({ campeon: podio[0] }).length);

  // ── Medallas que en ese torneo no dicen nada ────────────────────────────────────────────────
  // Lo cazó el autor: en el Panamericano SUB 18 le contaba "mejor sub-20" a una jugadora. Claro:
  // ahí TODOS son sub-20. Lo mismo la mejor femenina en un campeonato femenino, o el mejor +50 en
  // un Senior. Se corta al CALCULAR, así no sale ni en la Radiografía ni en la vitrina del perfil.
  const EDAD = new Function(extraerFuncion('_stTopeEdad') + ' return _stTopeEdad;')();
  const FEMS = new Function(extraerFuncion('_stSoloFemenino') + ' return _stSoloFemenino;')();
  const VETS = new Function(extraerFuncion('_stSoloVeteranos') + ' return _stSoloVeteranos;')();
  const NCAT = new Function(extraerFuncion('_stNombreConCat') + ' return _stNombreConCat;')();

  chk(EDAD('Campeonato Panamericano Sub 18') === 18 && EDAD('World Youth U16') === 16,
      'del nombre sale el tope de edad', EDAD('Campeonato Panamericano Sub 18') + ' / ' + EDAD('World Youth U16'));
  chk(EDAD('Festival de la Juventud 2026 SUB 18F') === 18,
      'y también en las categorías tipo "SUB 18F" (la letra no tapa el número)');
  chk(EDAD('Torneo Juvenil de Verano') === 20 && EDAD('Olimpiada Escolar Infantil') === 20,
      'sin número, palabras como juvenil o infantil valen como tope 20');

  // EL CANDADO MÁS IMPORTANTE: hay 7 torneos con tope de RATING, no de edad.
  ['IRT CIUDAD DE BOLIVAR SUB 2400', 'Torneo IRT Sub2000 FASGBA 2026', 'IRT Sub 2400 Santa Rosa',
   'Panamerican Amateur U1700'].forEach(function(n) {
    chk(EDAD(n) === 0, 'un tope de RATING no es un tope de edad: ' + n.slice(0, 34), EDAD(n));
  });

  chk(FEMS('77° Campeonato Argentino Superior Femenino') === true &&
      FEMS("WR Women's Chess Tour") === true && FEMS('Festival 2026 SUB 14F') === true,
      'los torneos de mujeres se reconocen');
  // Y el que NO hay que sacar: las dos ramas en una sola tabla.
  chk(FEMS('Campeonato de España Individual Absoluto y Femenino 2026') === false,
      'pero "Absoluto y Femenino" es una tabla MIXTA: ahí la mejor femenina sí vale');
  chk(FEMS('IRT Ciudad de Vera 2026') === false, 'y un torneo común no se marca');

  // El campo RAMA de la ficha del torneo: manda sobre el nombre. Lo pidió el autor con "She Plays
  // 2026", un torneo de mujeres que no dice "femenino" en ningún lado: por el nombre es imposible
  // saberlo, así que se declara a mano y la Radiografía deja de adivinar.
  const ESFEM = new Function(extraerFuncion('_stSoloFemenino') + extraerFuncion('_stEsFemenino') +
                             ' return _stEsFemenino;')();
  chk(ESFEM({ rama: 'fem' }, 'She Plays 2026') === true,
      'marcado a mano como femenino, se respeta aunque el nombre no lo diga');
  chk(ESFEM({ rama: 'abs' }, '77° Campeonato Argentino Superior Femenino') === false,
      'y marcado como absoluto manda sobre el nombre (por si el nombre engaña al revés)');
  chk(ESFEM({ rama: '' }, 'Torneo Femenino de Rosario') === true &&
      ESFEM({}, 'IRT Ciudad de Vera 2026') === false && ESFEM(null, 'IRT de Vera') === false,
      'sin marcar, se sigue deduciendo del nombre como hasta ahora');

  // Y que el campo VIAJE: del formulario al torneo guardado, de ahí al publicar y a la Radiografía.
  chk(/tze-rama/.test(SRC) && /rama:rama\|\|null/.test(SRC.replace(/ /g, '')),
      'el formulario tiene el campo Rama y lo guarda en el torneo');
  chk(/metaCr\[entry\.id\] = \{[^}]*rama: entry\.rama/.test(SRC),
      'al publicar, la rama viaja con el torneo hasta la Radiografía');
  chk(/rama:\s+c \? \(c\.rama \|\| ''\) : ''/.test(SRC),
      'y en modo autor la toma del torneo abierto');
  chk(/femenina: _stEsFemenino\(meta, _nomCat\) \? null :/.test(extraerFuncion('_statsBuild')),
      'la medalla de mejor femenina se decide con la rama, no sólo con el nombre');

  chk(VETS('FIDE World Senior Chess Championships 2026 - Open 50+') === true &&
      VETS('Campeonato de Veteranos') === true && VETS('IRT de la primavera') === false,
      'los torneos de veteranos también');

  chk(NCAT({ name:'Festival Panamericano', cat:'SUB 18F' }) === 'Festival Panamericano SUB 18F',
      'para decidir se mira el nombre del torneo MÁS el de la categoría',
      NCAT({ name:'Festival Panamericano', cat:'SUB 18F' }));
  chk(NCAT({ name:'IRT de Vera' }) === 'IRT de Vera' && NCAT(null) === '',
      'sin categoría, alcanza con el nombre del torneo');

  // Que el corte esté donde se CALCULA (así vale para la Radiografía y para la vitrina).
  const build = extraerFuncion('_statsBuild');
  chk(/femenina: _stEsFemenino\(meta, _nomCat\) \? null :/.test(build) &&
      /sub20: \(_topeEdad && _topeEdad <= 20\) \? null :/.test(build) &&
      /mas50: _stSoloVeteranos\(_nomCat\) \? null :/.test(build),
      'las tres medallas se omiten al calcular, no al mostrar');

  // Contra el catálogo real.
  if (fs.existsSync('data/cr') && fs.existsSync('data/manifest.js')) {
    const W2 = {}; new Function('window', fs.readFileSync('data/manifest.js', 'utf8'))(W2);
    const TT2 = {}; ((W2.__MANIFEST__ && W2.__MANIFEST__.tournaments) || []).forEach(x => TT2[String(x.id)] = x);
    let hay = 0, sacadas = 0;
    fs.readdirSync('data/cr').filter(x => x.endsWith('.json')).forEach(x => {
      let d; try { d = JSON.parse(fs.readFileSync('data/cr/' + x, 'utf8')); } catch (e) { return; }
      const st = d && d.stats; if (!st || !st.premios) return;
      const tid = x.replace(/\.json$/, '').replace(/^cr2_/, '').replace(/^(tz|ls|hc)_/, '').replace(/_c\d+$/, '');
      const tt = TT2[tid] || TT2[tid.replace(/^(tz|ls|hc)_/, '')];
      const mc = x.match(/_c(\d+)\.json$/), ci = mc ? parseInt(mc[1], 10) : -1;
      const cn = (tt && tt.categories && ci >= 0 && tt.categories[ci]) ? tt.categories[ci].name : '';
      const nom = NCAT({ name: tt ? tt.name : '', cat: cn });
      const e = EDAD(nom), p = st.premios;
      if (p.sub20)    { hay++; if (e && e <= 20)      sacadas++; }
      if (p.femenina) { hay++; if (FEMS(nom))         sacadas++; }
      if (p.mas50)    { hay++; if (VETS(nom))         sacadas++; }
    });
    chk(hay > 100, 'hay medallas de categoría reales con qué probar', hay);
    // Antes del arreglo sobraban 25 (el "mejor sub-20" del Panamericano SUB 18 y compañía). El autor
    // volvió a publicar y se cayeron solas. Ahora el candado es al revés: NINGUNA puede sobrar. Si
    // esto vuelve a fallar es que se publicó con datos horneados antes del arreglo.
    chk(sacadas === 0, 'y en el catálogo publicado ya no sobra ninguna', sacadas + ' de ' + hay);
  }

  // ── El torneo tiene que haber TERMINADO ─────────────────────────────────────────────────────
  // Lo cazó el autor: el Scherer Masters 2026 termina el 6 de septiembre y ya repartía copas. La
  // radiografía se hornea igual estando en juego (a propósito), pero el trofeo se da al final.
  const FIN = new Function('todayKey', extraerFuncion('_isoToKey') + extraerFuncion('_awTourFinished')
                           + ' return _awTourFinished;')(() => 20260904);
  chk(FIN({ endDate:'2026-08-30' }, {}) === true, 'un torneo que ya terminó reparte trofeos');
  chk(FIN({ endDate:'2026-09-06' }, {}) === false, 'uno que termina el 6 y hoy es 4, todavía no');
  chk(FIN({ endDate:'2026-09-04' }, {}) === false,
      'y uno que termina HOY tampoco: puede estar jugándose la última ronda');
  chk(FIN({ endDate:'2026-09-06', finished:true }, {}) === true,
      'salvo que el autor lo haya marcado "Finalizado" a mano');
  chk(FIN({ endDate:'2026-09-06' }, { standingsFinal:true }) === true,
      'o que la tabla cargada sea la definitiva');
  chk(FIN({ startDate:'2026-08-01' }, {}) === true, 'con startDate solo, alcanza');
  chk(FIN({ dateKey:20260801 }, {}) === true, 'y con el dateKey horneado, también');
  chk(FIN(null, {}) === false && FIN({}, {}) === false, 'sin fecha ninguna, no se arriesga');

  // ── UN trofeo por jugador y por cuadro, y gana el más alto ──────────────────────────────────
  const BEST = new Function("var _AW_KINDS = ['c','2','3','rp','fem','s20','m50','rev'];"
                            + extraerFuncion('_awBestPerPlayer') + ' return _awBestPerPlayer;')();
  const jug = { 'Ana': { id:1 }, 'Beto': { id:2 }, 'Cata': { id:3 } };
  const buscar = raw => jug[raw] || null;
  const kOf = (prem) => { const m = BEST(prem, buscar); return Object.keys(m).map(k => k + ':' + m[k].k).join(','); };

  chk(kOf([{ raw:'Ana', k:'s20' }, { raw:'Ana', k:'c' }]) === '1:c',
      'si es campeón, no se le cuenta además el sub-20');
  chk(kOf([{ raw:'Ana', k:'fem' }, { raw:'Ana', k:'c' }, { raw:'Ana', k:'s20' }]) === '1:c',
      'la copa le gana a todas las medallas, vengan en el orden que vengan');
  // El ejemplo del autor: en un campeonato FEMENINO la campeona salía dos veces.
  chk(kOf([{ raw:'Ana', k:'fem' }, { raw:'Ana', k:'c' }]) === '1:c',
      'en un campeonato femenino la campeona va como CAMPEONA, no como "mejor femenina"');
  chk(kOf([{ raw:'Ana', k:'fem' }, { raw:'Ana', k:'3' }]) === '1:3',
      'y si la mejor femenina hizo podio, manda el puesto del podio');
  chk(kOf([{ raw:'Ana', k:'c' }, { raw:'Beto', k:'2' }, { raw:'Cata', k:'s20' }]) === '1:c,2:2,3:s20',
      'a cada uno el suyo: no se pisan entre jugadores distintos');
  chk(kOf([{ raw:'Ana', k:'s20' }, { raw:'Ana', k:'m50' }]) === '1:s20',
      'entre dos medallas queda la de más arriba en la lista');
  chk(kOf([{ raw:'Nadie', k:'c' }, { raw:'Ana', k:'2' }]) === '1:2',
      'los premios de gente sin perfil acá no ocupan lugar');
  chk(Object.keys(BEST([], buscar)).length === 0 && Object.keys(BEST(null, buscar)).length === 0,
      'sin premios no devuelve nada');
  chk(BEST([{ raw:'Ana', k:'c', d:'8 pts' }], buscar)[1].d === '8 pts', 'y se queda con el detalle del que gana');

  // ── Contra los cuadros REALES: las dos reglas juntas ────────────────────────────────────────
  if (fs.existsSync('data/cr') && fs.existsSync('data/manifest.js')) {
    const W = {}; new Function('window', fs.readFileSync('data/manifest.js', 'utf8'))(W);
    const TT = {}; ((W.__MANIFEST__ && W.__MANIFEST__.tournaments) || []).forEach(x => TT[String(x.id)] = x);
    let enCurso = 0, conTrofeo = 0, dobles = 0, femDuplicada = 0;
    fs.readdirSync('data/cr').filter(x => x.endsWith('.json')).forEach(x => {
      let d; try { d = JSON.parse(fs.readFileSync('data/cr/' + x, 'utf8')); } catch (e) { return; }
      if (!d || !d.stats) return;
      const tid = x.replace(/\.json$/, '').replace(/^cr2_/, '').replace(/^(tz|ls|hc)_/, '').replace(/_c\d+$/, '');
      const tt = TT[tid] || TT[tid.replace(/^(tz|ls|hc)_/, '')];
      if (!FIN(tt, d)) { enCurso++; return; }
      // un "jugador" por cada nombre distinto, para mirar la regla sin depender del match de nombres
      const ids = {}; let n = 0;
      const m = BEST(AW(d.stats), raw => { if (!ids[raw]) ids[raw] = { id: ++n }; return ids[raw]; });
      const ks = Object.keys(m).map(k => m[k].k);
      conTrofeo += ks.length;
      // nadie puede llevarse dos del mismo cuadro (por construcción), ni fem + podio
      const porNombre = {};
      AW(d.stats).forEach(a => { (porNombre[a.raw] = porNombre[a.raw] || []).push(a.k); });
      Object.keys(porNombre).forEach(nm => {
        const kk = porNombre[nm];
        if (kk.length > 1 && m[ids[nm].id] === undefined) dobles++;
        if (kk.indexOf('fem') >= 0 && ['c','2','3'].some(z => kk.indexOf(z) >= 0)
            && m[ids[nm].id] && m[ids[nm].id].k === 'fem') femDuplicada++;
      });
    });
    chk(enCurso >= 1, 'hay torneos en juego que se dejan afuera de la vitrina', enCurso + ' cuadros');
    chk(conTrofeo > 100, 'y los terminados sí reparten', conTrofeo + ' trofeos');
    chk(dobles === 0, 'ningún jugador se lleva dos trofeos del mismo cuadro');
    chk(femDuplicada === 0, 'y ninguna que hizo podio queda como "mejor femenina"');
  }

  // ── La pantalla de la vitrina ──────────────────────────────────────────────────────────────
  const HTML = new Function('_manifest', 'PLAYERS', '_ondemand', '_troMan',
    "var _AW_KINDS = ['c','2','3','rp','fem','s20','m50','rev'];"
    + SRC.match(/var _TRO_INFO = \{[\s\S]*?\n\};/)[0]
    + extraerFuncion('_troSello') + extraerFuncion('_troOlimpica')
    + extraerFuncion('_troCopa') + extraerFuncion('_troMedalla') + extraerFuncion('_troHtml')
    + "function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }"
    + "function escJs(s){ return String(s==null?'':s).replace(/\\\\/g,'\\\\\\\\').replace(/'/g,\"\\\\'\"); }"
    + "function _tourHref(k){ return '?torneo=' + encodeURIComponent(k); }"
    + "function _tourHrefCat(k,c){ return _tourHref(k) + ((c!=null&&c>=0)?('&cat='+c):''); }"
    + "function _resolveTourType(){ return 'ls'; }"
    + 'var _troDet=[], _troPin=-1;'
    + ' return function(p){ var h = _troHtml(p); return { h: h, det: _troDet.map(function(x){ return x.html; }).join(" | ") }; };');

  const MAN = {
    tournaments: [ { id:'tz_1', name:'Abierto de Villa Elisa' }, { id:'tz_2', name:'Panamericano U-20' } ],
    playerAwards: { 7: [
      { t:'tz_1', k:'s20', d:'13 años · 5º del torneo' },
      { t:'tz_1', k:'c',   d:'8 pts · Rp 2700' },
      { t:'tz_2', k:'3',   d:'6½ pts' },
      { t:'tz_2', k:'fem', d:'2ª del torneo', c:1 }
    ] }
  };
  const R = HTML(MAN, [], true, () => ({}))({ id:7 }), h = R.h, detTro = R.det;

  chk(/tro-card/.test(h) && /🏅 Vitrina/.test(h), 'la vitrina se dibuja');
  chk(/<b>1 campeonato · 1 podio · 2 medallas<\/b>/.test(h),
      'el encabezado resume campeonatos, podios y medallas',
      (h.match(/<b>([^<]*)<\/b>/) || [])[1]);

  // El orden manda: primero las copas del podio, después las medallas (aunque vengan mezcladas).
  const orden = [...h.matchAll(/class="tro-nm">([^<]+)</g)].map(m => m[1]);
  chk(orden.join(' | ') === 'Campeón | Tercer puesto | Mejor femenina | Mejor sub-20',
      'las copas van antes que las medallas, sin importar cómo vengan mezcladas', orden.join(' | '));

  // Los tres tamaños del podio son clases distintas (el CSS les da 58/44/36 px).
  chk(/class="tro tro-c"/.test(h) && /class="tro tro-3"/.test(h) && /class="tro tro-med"/.test(h),
      'la copa del campeón, la del tercero y las medallas usan clases distintas (tamaños distintos)');
  chk(/\.tro-c svg \{ width: 58px/.test(SRC) && /\.tro-2 svg \{ width: 44px/.test(SRC) && /\.tro-3 svg \{ width: 36px/.test(SRC),
      'y el CSS los hace grande, mediana y chica, en ese orden');

  // El detalle de cada trofeo, con su torneo y su link.
  chk(detTro.indexOf('Abierto de Villa Elisa') >= 0 && detTro.indexOf('8 pts · Rp 2700') >= 0,
      'cada trofeo guarda de qué torneo salió y con qué números');
  chk(h.indexOf('title="Campeón — Abierto de Villa Elisa"') > 0,
      'y el torneo también va en el title, para el globito del navegador');
  chk(detTro.indexOf('?torneo=tz_2&cat=1') >= 0,
      'si el premio es de una categoría, el link abre esa pestaña');
  chk(detTro.indexOf('?torneo=tz_1"') >= 0,
      'y si el torneo no tiene categorías, el link va pelado');
  chk(/onmouseenter="troShow\(/.test(h) && /onclick="troPick\(/.test(h),
      'se muestra al pasar el mouse y se clava al tocar (para el teléfono)');

  // ── Los tipos que se cargan a mano y el orden por NIVELES ───────────────────────────────────
  const MAN2 = {
    tournaments: [ { id:'tz_1', name:'Abierto de Villa Elisa' } ],
    playerAwards: { 9: [
      { k:'s20', y:2021, d:'16 años' },
      { k:'c',   t:'tz_1', y:2020, d:'8 pts' },
      { k:'oro', y:2018, d:'Olimpiada, tablero 3' },
      { k:'arg', y:2015, d:'Campeonato Argentino Absoluto' },
      { k:'mun', y:2022, d:'Mundial Sub-16' },
      { k:'sub', y:2019, d:'Zonal Sudamericano' }
    ] }
  };
  const R9 = HTML(MAN2, [], true, () => ({}))({ id:9 });
  const orden9 = [...R9.h.matchAll(/class="tro-nm">([^<]*?)(?:<span|<\/span>)/g)].map(m => m[1]);
  chk(orden9.join(' | ') === 'Campeón mundial | Medalla de oro olímpica | Campeón argentino | Campeón | Subcampeón | Mejor sub-20',
      'primero los títulos mayores (por año), después los campeonatos, y al final los logros',
      orden9.join(' | '));

  // El año se muestra debajo del nombre y es el que ordena.
  chk(/class="tro-anio">2022</.test(R9.h) && /class="tro-anio">2015</.test(R9.h),
      'cada trofeo muestra su año');

  // El resumen agrupa por lo que significa, no por el tipo.
  chk(/<b>3 campeonatos · 1 podio · 2 medallas<\/b>/.test(R9.h),
      'el resumen cuenta ganar como campeonato (sea el argentino, un mundial o un abierto)',
      (R9.h.match(/<b>([^<]*)<\/b>/) || [])[1]);

  // ── La bandera va DIBUJADA, no con el emoji ────────────────────────────────────────────────
  // En Windows los emoji de bandera no existen y se ven como las letras "AR": lo vio el autor.
  const SELLO = new Function(extraerFuncion('_troSello') + ' return _troSello;')();
  const ar = SELLO('ar');
  chk(ar.indexOf('#74acdf') > 0 && ar.indexOf('#f6b40e') > 0,
      'la bandera argentina se dibuja con sus colores (celeste y el sol), no con un emoji');
  chk(ar.indexOf('🇦🇷') < 0 && extraerFuncion('_troHtml').indexOf('🇦🇷') < 0,
      'y la vitrina no usa el emoji de bandera en ningún lado (en Windows se ve "AR")');
  chk(SELLO('mundo').indexOf('circle') > 0, 'el campeón mundial lleva un globo dibujado en la copa');
  chk(SELLO('') === '' && SELLO(null) === '', 'sin sello, la copa va lisa');

  // La copa con sello y la medalla olímpica son dibujos distintos.
  const COPA = new Function(extraerFuncion('_troSello') + extraerFuncion('_troCopa') + ' return _troCopa;')();
  chk(COPA(['#ffd24a','#c8921a','#7a5a08'], 'ar').indexOf('#74acdf') > 0, 'la copa acepta el sello de la bandera');
  chk(COPA(['#ffd24a','#c8921a','#7a5a08']).indexOf('#74acdf') < 0, 'y sin sello no lo lleva');
  const OLI = new Function(extraerFuncion('_troOlimpica') + ' return _troOlimpica;')();
  chk(OLI().indexOf('viewBox="0 0 44 54"') > 0, 'la medalla olímpica tiene su propio dibujo, más grande');
  chk(/\.tro-oro svg \{ width: 50px/.test(SRC), 'y el CSS la hace la medalla más grande de todas');

  // ── En la interfaz, la bandera va como IMAGEN, nunca como emoji ─────────────────────────────
  // En Windows los emoji de bandera no existen: el chip decia "AR Nacionales" en vez de mostrar
  // la bandera. Lo vio el autor. La app ya tenia _flagImg("ARG"), que devuelve el SVG local.
  chk(!/🇦🇷s*(Solo argentinos|Nacionales|La actuación|Argentinos en el torneo|¿argentino|Argentina no juega)/.test(SRC),
      'ningún botón ni rótulo visible usa el emoji de bandera');
  chk(SRC.split("_flagImg('ARG')").length - 1 >= 12,
      'los botones y rótulos la arman con _flagImg(ARG)', (SRC.split("_flagImg('ARG')").length - 1) + ' usos');
  chk(SRC.indexOf('assets/flags/ar.svg') > 0, 'y el HTML fijo del archivo también lleva la imagen');
  // En las redes sociales el emoji SÍ se ve bien, así que ese se deja.
  chk(/#AjedrezArgentino #Ajedrez ♟️🇦🇷/.test(SRC),
      'salvo el texto para compartir en redes, donde el emoji se ve bien');

  // ── El mueble ──────────────────────────────────────────────────────────────────────────────
  chk(/tro-mueble/.test(R9.h) && /tro-vidrio/.test(R9.h), 'los trofeos van adentro de un mueble con vidrio');
  chk(SRC.indexOf('.tro { width: 90px; flex: 0 0 90px; }') > 0,
      'las fichas tienen ancho FIJO: así las filas quedan parejas y los estantes corridos');
  chk(SRC.indexOf('width: fit-content; max-width: 100%;') > 0,
      'y el mueble mide lo que miden los trofeos, no todo el ancho de la tarjeta');
  chk(/\.tro-ico \{[^}]*border-bottom: 3px solid/.test(SRC),
      'el estante es el borde de abajo de cada ficha (sumados forman el vidrio corrido)');

  // La aclaración que pidió el autor.
  // Las mujeres van como Campeona/Subcampeona: el listado FIDE ya trae el sexo (campo female).
  const Rf = HTML(MAN, [], true, () => ({}))({ id:7, female:true });
  chk(Rf.h.indexOf('>Campeona<') > 0 && Rf.h.indexOf('>Campeón<') < 0,
      'una jugadora sale como CAMPEONA, no como campeón');
  chk(h.indexOf('>Campeón<') > 0, 'y un jugador sigue saliendo como campeón');
  chk(Rf.det.indexOf('Campeona') >= 0, 'el renglón del detalle también va en femenino');

  chk(/cuenta desde que ChessArgentino empezó a funcionar/.test(h),
      'la vitrina aclara que cuenta desde que arrancó el sitio');

  // Sin datos no dibuja nada (no una tarjeta vacía).
  chk(HTML(MAN, [], true, () => ({}))({ id: 999 }).h === '', 'un jugador sin trofeos no muestra vitrina vacía');
  chk(HTML({ tournaments: [] }, [], true, () => ({}))({ id: 7 }).h === '', 'y sin índice en el manifest tampoco (datos viejos)');
  chk(HTML(null, [], true, () => ({}))({ id: 7 }).h === '', 'ni sin manifest');

  // ── Los trofeos cargados A MANO ────────────────────────────────────────────────────────────
  // La historia grande (los campeones argentinos, el mundial de Candela, el sub-16 de Pichot) no
  // está en los torneos del sitio: la carga el autor desde el perfil.
  const manDe = () => ({ 7: [ { k:'arg', y:2009, d:'Campeonato Argentino Absoluto' },
                              { k:'oro', y:1950, d:'Olimpiada de Dubrovnik' } ] });
  const Rm = HTML(MAN, [], true, manDe)({ id:7 });
  const nombresM = [...Rm.h.matchAll(/class="tro-nm">([^<]*?)(?:<span|<\/span>)/g)].map(m => m[1]);
  chk(nombresM[0] === 'Campeón argentino' && nombresM[1] === 'Medalla de oro olímpica',
      'los cargados a mano se mezclan con los del sitio y van primeros (nivel 0, por año)',
      nombresM.join(' | '));
  chk(Rm.det.indexOf('Campeonato Argentino Absoluto') >= 0,
      'y muestran la descripción que escribió el autor');
  chk(Rm.h.indexOf('?torneo=') < 0 || !/Campeonato Argentino Absoluto[^|]*Ver torneo/.test(Rm.det),
      'sin torneo del sitio detrás, no inventan un link');

  // El ✕ y el botón de agregar SÓLO en modo autor.
  const Rautor = HTML(MAN, [], false, manDe)({ id:7 });
  chk(Rautor.h.indexOf('tro-add') > 0 && Rautor.h.indexOf('Agregar trofeo a mano') > 0,
      'en modo autor aparece el botón de agregar');
  chk((Rautor.h.match(/tro-del/g) || []).length === 2,
      'y el ✕ sólo en los dos cargados a mano, no en los del sitio',
      (Rautor.h.match(/tro-del/g) || []).length + ' de ' + (Rautor.h.match(/class="tro /g) || []).length + ' trofeos');
  chk(Rm.h.indexOf('tro-add') < 0 && Rm.h.indexOf('tro-del') < 0,
      'y en la web publicada no se ve ni el botón ni el ✕');
  chk(HTML(MAN, [], false, () => ({}))({ id: 999 }).h.indexOf('tro-add') > 0,
      'un jugador sin nada muestra igual el botón, para poder cargarle el primero');

  // Viajan al publicar por el mismo camino que el resto de lo que edita el autor.
  chk(SRC.split('__EMBEDDED_TROPHIES__=').length - 1 >= 3,
      'los trofeos a mano se incrustan en los tres exports',
      (SRC.split("'window.__EMBEDDED_TROPHIES__=' + JSON.stringify(_troMan())").length - 1) + ' exports');
  chk(/function _troMan\(\)[\s\S]{0,220}player_trophies/.test(SRC),
      'y se guardan en el navegador del autor (player_trophies)');
  chk(/function troAgregar\(pid\)/.test(SRC) && /function troBorrar\(pid, i\)/.test(SRC),
      'están el cartel para cargarlos y el borrado');
  chk(/window\.aaAsk\(\{ icono:'🗑'/.test(SRC),
      'y el borrado pregunta con el cartel de la app, no con el del navegador');

  // ── El horneado NO pisa el árbol de aperturas ──
  // El autor lo pidió expresamente. _stBakeForPublish copia TODOS los campos del cuadro y sólo
  // agrega `stats`; el árbol vive en `aperturas` y no se toca.
  const bake = extraerFuncion('_stBakeForPublish');
  chk(/for \(var kk in d\)[\s\S]*copia\[kk\] = d\[kk\]/.test(bake) && /copia\.stats = st/.test(bake),
      'el horneado copia todo el cuadro y sólo agrega stats (el árbol de aperturas queda intacto)');

  // ── Contra los cuadros REALES del sitio ──
  if (fs.existsSync('data/cr')) {
    const files = fs.readdirSync('data/cr').filter(x => x.endsWith('.json'));
    let conStats = 0, trofeos = 0, cerrados = 0, matches = 0, medallasEnCerrados = 0;
    files.forEach(x => {
      let d; try { d = JSON.parse(fs.readFileSync('data/cr/' + x, 'utf8')); } catch (e) { return; }
      const st = d && d.stats; if (!st) return;
      conStats++;
      const inf = st.torneo || {}, j = inf.jugadores || 0, r = inf.rondas || 0;
      const esMatch = j === 2, esCerrado = j > 2 && r >= j - 1;
      if (esMatch) matches++; if (esCerrado) cerrados++;
      const ks = AW(st).map(a => a.k);
      trofeos += ks.length;
      if ((esMatch || esCerrado) && ks.some(k => ['rp','fem','s20','m50','rev'].indexOf(k) >= 0)) medallasEnCerrados++;
    });
    chk(conStats > 100, 'hay radiografías reales con qué probar', conStats + ' torneos');
    chk(medallasEnCerrados === 0,
        'en ningún cerrado ni match del sitio se cuela una medalla', cerrados + ' cerrados y ' + matches + ' matches revisados');
    chk(trofeos > 500, 'y la vitrina reparte trofeos de verdad', trofeos + ' trofeos');
  }
}

console.log('\n=== 35. Horarios de ronda POR CATEGORÍA ===');
{
  // Lo trajo el autor con "Leyendas y Prodigios II": dos grupos, A a 10 rondas y B a 9. Los horarios
  // se cargaban en la ficha del torneo y valían para las dos categorías, asi que el GRUPO B mostraba
  // el calendario del A y no habia donde corregirlo. Ahora cada categoria puede tener los suyos y se
  // cargan tocando el renglon "Se juega" de la ronda, en modo autor.

  const detalle = extraerFuncion('openTournamentDetail');
  chk(/_rdtBase = roundDT;/.test(detalle) &&
      /if \(_cat\.roundDT\) roundDT = Object\.assign\(\{\}, roundDT \|\| \{\}, _cat\.roundDT\);/.test(detalle),
      'la categoría MEZCLA sus horarios sobre los del torneo (no los reemplaza)');
  chk(/_tdRoundDTBase = \(activeCat >= 0\)/.test(detalle),
      'y se recuerda lo heredado, para saber a qué volver si se quita el propio');
  chk(/_tdRoundDTCrk = crk/.test(detalle),
      'se guarda de qué cuadro es el detalle abierto (no editar otro de la página)');

  // El renglón clickeable.
  const panel = extraerFuncion('crBuildRoundPanel');
  chk(/_tdRoundDTEditable\(key\)/.test(panel) && /tdEditRoundDT\(/.test(panel),
      'el renglón "Se juega" se toca para editarlo');
  chk(/if\(_sched \|\| _schedEd\)/.test(panel) && /sin día ni hora/.test(panel),
      'y en modo autor sale aunque la ronda no tenga horario, para poder ponérselo');
  const edit = extraerFuncion('_tdRoundDTEditable');
  chk(/!_ondemand/.test(edit) && /crk === _tdRoundDTCrk/.test(edit),
      'en la web publicada NO se puede editar, y sólo vale para el cuadro abierto');

  // Dónde se guarda cada cosa.
  const store = extraerFuncion('_tdRoundDTStore');
  chk(/if \(catIdx >= 0\)/.test(store) && /cat\.roundDT = dt/.test(store) && /delete cat\.roundDT/.test(store),
      'con una categoría abierta se guarda en la categoría, y vacío la borra entera');
  chk(/heredado: _tdRoundDTBase/.test(store),
      'la categoría sabe qué heredaba, para volver a eso al quitar el propio');
  chk(["'hc'", "'tz'", "'ls'"].every(x => store.includes(x)),
      'y sin categorías se guarda en el torneo, en los tres tipos (hc/tz/ls)');

  const commit = extraerFuncion('_tdRoundDTCommit');
  chk(/if \(borrar\) delete dt\[n\];/.test(commit) && /if \(!dia\) delete dt\[n\];/.test(commit),
      'quitar borra sólo esa ronda; sin día tampoco se guarda nada');
  chk(/Object\.assign\(\{\}, store\.heredado \|\| \{\}, dt\)/.test(commit),
      'al repintar, lo quitado vuelve a mostrar el horario heredado');
  chk(/crBuildRoundPanel\(crk, data\.rounds\[r\], data, r\)/.test(commit) && !/openTournamentDetail/.test(commit),
      'se repinta la ronda sin recargar el detalle (la ronda abierta sigue abierta)');

  // Y que lo guardado VIAJE al publicar: va dentro de categories, que se copia entero.
  chk(/categories: entry\.categories \|\| null/.test(SRC),
      'los horarios por categoría viajan al publicar dentro de categories');

  // Contra el torneo REAL que trajo el autor.
  if (fs.existsSync('data/manifest.js')) {
    const W3 = {}; new Function('window', fs.readFileSync('data/manifest.js', 'utf8'))(W3);
    const lp = ((W3.__MANIFEST__ && W3.__MANIFEST__.tournaments) || [])
                 .find(x => String(x.id) === 'tz_1784773631535');
    if (lp) {
      chk((lp.categories || []).length === 2 && Object.keys(lp.roundDT || {}).length === 10,
          'el torneo del caso tiene 2 categorías y 10 horarios cargados en el torneo',
          (lp.categories || []).length + ' cats / ' + Object.keys(lp.roundDT || {}).length + ' horarios');
      chk((lp.categories || [])[1] && lp.categories[1].rounds === 9,
          'y el GRUPO B ya usaba un override por categoría (rondas 9), el mismo camino que los horarios');
    }
  }
}

console.log('\n' + (fallos ? ('❌ ' + fallos + ' PRUEBAS FALLARON') : '✅ Todas las pruebas pasaron.'));
console.log('   Corrieron ' + corridas + ' de ' + ESPERADAS + ' comprobaciones.'
          + (corridas < ESPERADAS ? '   ⚠️  FALTAN ' + (ESPERADAS - corridas) + ': algo se está salteando.' : '') + '\n');
process.exitCode = (fallos || corridas < ESPERADAS) ? 1 : 0;
