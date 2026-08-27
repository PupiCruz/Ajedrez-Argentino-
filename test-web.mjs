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

console.log('\n' + (fallos ? ('❌ ' + fallos + ' PRUEBAS FALLARON') : '✅ Todas las pruebas pasaron.') + '\n');
process.exitCode = fallos ? 1 : 0;
