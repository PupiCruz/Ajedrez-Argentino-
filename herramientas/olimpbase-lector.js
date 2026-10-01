/* 📥 LECTOR DE OLIMPBASE → paquete de "Torneo histórico" de ChessArgentino (25/09/2026).
   Corre DENTRO de una pestaña de olimpbase.org: el autor lo instala como favorito (el botón
   "🔖 Copiar de OlimpBase" de Torneos históricos, en modo autor, arma el favorito con este archivo).
   Se para en cualquier página de una Olimpiada (la de información, la tabla, una ronda…), toca el
   favorito y este lee TODO el torneo página por página —una cada ~1,2 s, para no cargar a OlimpBase;
   su filtro anti-robots no se esquiva: se lee desde la propia pestaña, como una persona— y al final
   baja un archivo .json que se carga con "📥 Importar torneo histórico".
   Qué lee: la ficha (…in.html), la tabla de cada etapa (…fa.html, …ea.html), cada ronda (…fa01.html:
   mesas con color, resultado y el número de la partida en el PGN), la planilla de cada equipo
   (…arg.html: el nombre completo de cada jugador) y el PGN del torneo (/ob-games/37olm.pgn).
   Qué arma: el MISMO formato que armaban a mano los programitas de .claude/olimpbase/ para 1939
   (convert.mjs → limpiar-pgn.mjs → paquete.mjs), más un INFORME con lo que no cerró, que el
   importador de la app le muestra al autor antes de cargar.
   Sabe leer las Olimpiadas de todos contra todos (1927-1939 y 1950, con etapas o no) y, desde el
   28/09/2026, las SUIZAS de una sola etapa (1976-1996; las de 1998 en adelante el autor las tiene de
   Chess-Results). Desde el 30/09/2026 también las de GRUPOS Y FINALES (1952-1974; en 1960 y 1962 la
   Final C fue suiza: cada etapa decide sola si es suiza o todos contra todos) y las FEMENINAS:
   · las que se jugaron junto con la abierta (1972 Skopie, 1976 Haifa, 1978 Buenos Aires, 1980+): van en
     el mismo torneo. Si alguna de las dos tiene grupos y finales, las categorías se llaman
     "Absoluto · Final A", "Femenino · Grupo 1"… con `grupo` = Absoluto / Femenino (la app las muestra en
     dos pisos: arriba Absoluto | Femenino, abajo las etapas).
   · las que se jugaron APARTE (1957 Emmen, 1963 Split, 1966 Oberhausen, 1969 Lublin, 1974 Medellín):
     torneo propio (tz_ob1957w, "1.ª Olimpíada Femenina de Ajedrez · Emmen 1957", rama fem). Se toca el
     favorito parado en su página (/1957w/…).
   Formato de cada etapa (convert.mjs): cuadro 'rr' con grid + des [pts, MP]; mesas con nW = jugador
   del equipo de la IZQUIERDA (el de arriba del cruce) y res desde su lado.
   En las suizas la tabla es 'final' (como la de Chess-Results): played/w/d/l de los matches y des con
   los desempates en el orden oficial de ese año (puntos, Buchholz, MP… o puntos, MP, Buchholz en 1976). */
(async function () {
  'use strict';
  if (window.__aaOlimpLeyendo) return;
  window.__aaOlimpLeyendo = true;
  var PAUSA = 1200;   // ms entre página y página

  // ───────── El cartelito de la esquina ─────────
  var caja = document.createElement('div');
  caja.setAttribute('role', 'status');
  caja.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:340px;max-width:calc(100vw - 32px);'
    + 'background:#14231b;color:#eef5ef;border:1px solid #3c6b4e;border-radius:12px;padding:14px 16px;'
    + 'font:14px/1.45 system-ui,Segoe UI,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:left';
  document.body.appendChild(caja);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mostrar(titulo, cuerpo, cerrable) {
    caja.innerHTML = '<div style="font-weight:700;margin-bottom:6px">♞ ' + esc(titulo) + '</div>'
      + '<div>' + cuerpo + '</div>'
      + (cerrable ? '<button type="button" style="margin-top:10px;background:#3c6b4e;color:#fff;border:0;border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit">Cerrar</button>' : '');
    var b = caja.querySelector('button');
    if (b) b.onclick = function () { caja.remove(); window.__aaOlimpLeyendo = false; };
  }
  function barra(hechas, total, que) {
    var pc = total ? Math.round(100 * hechas / total) : 0;
    mostrar('Copiando de OlimpBase…', esc(que)
      + '<div style="margin-top:8px;height:8px;background:#2a4234;border-radius:4px;overflow:hidden"><div style="height:100%;width:' + pc + '%;background:#7fd19b"></div></div>'
      + '<div style="margin-top:4px;font-size:12px;opacity:.8">Página ' + hechas + ' de ' + total + ' · no cierres esta pestaña</div>');
  }
  function fallar(msg) { mostrar('No se pudo copiar', esc(msg), true); }

  if (!/(^|\.)olimpbase\.org$/.test(location.hostname)) {
    fallar('Este botón se usa en olimpbase.org: entrá a la página de una Olimpiada y tocalo ahí.');
    return;
  }
  var mY = window.__aaOlimpAnio ? [0, String(window.__aaOlimpAnio)] : location.pathname.match(/^\/(\d{4})w?\//);   // (__aaOlimpAnio: para probar; desde /2008w/ también: se lee la abierta + la femenina)
  if (!mY) {
    fallar('Abrí primero la página de una Olimpiada (por ejemplo la de Estocolmo 1937) y tocá el botón ahí.');
    return;
  }
  var Y = mY[1], BASE = location.origin + '/' + Y + '/';
  // Parado en una femenina (/1957w/…). (Para probar: window.__aaOlimpFem = true junto con __aaOlimpAnio.)
  var esFem = window.__aaOlimpAnio ? !!window.__aaOlimpFem : /^\/\d{4}w\//.test(location.pathname);
  var BASE_W = location.origin + '/' + Y + 'w/';

  // ───────── Traer páginas, de a una y con pausa ─────────
  var ultimo = 0, hechas = 0, total = 1, yaLeidas = {};
  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function traer(url, binario, que) {
    if (!binario && url in yaLeidas) { hechas++; return yaLeidas[url]; }   // (la ficha de la femenina se mira dos veces)
    var t = await traer0(url, binario, que);
    if (!binario) yaLeidas[url] = t;
    return t;
  }
  async function traer0(url, binario, que) {
    var espera = ultimo + PAUSA - Date.now();
    if (espera > 0) await dormir(espera);
    ultimo = Date.now();
    barra(hechas, total, que || '');
    for (var intento = 0; intento < 3; intento++) {
      try {
        var r = await fetch(url, { credentials: 'same-origin' });
        if (r.ok) { hechas++; return binario ? await r.arrayBuffer() : await r.text(); }
        if (r.status === 404) { hechas++; return null; }
      } catch (e) {}
      await dormir(3000 * (intento + 1));
    }
    throw new Error('No se pudo leer ' + url + '. Revisá la conexión y volvé a tocar el botón.');
  }
  function html(t) { return new DOMParser().parseFromString(t || '', 'text/html'); }
  function txt(el) { return el ? String(el.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
  // Una tabla como GRILLA: cada celda ocupa todas las posiciones de su rowspan/colspan. Así las filas
  // que vienen "cortas" (OlimpBase pone UNA celda alta en las rondas con BYE, en los matches no
  // jugados y en la columna "fin." de los grupos) quedan alineadas solas.
  function grilla(table) {
    var G = [];
    Array.prototype.forEach.call(table.rows, function (tr, r) {
      G[r] = G[r] || [];
      var c = 0;
      Array.prototype.forEach.call(tr.cells, function (td) {
        while (G[r][c]) c++;
        var rs = Math.max(1, td.rowSpan || 1), cs = Math.max(1, td.colSpan || 1);
        for (var i = 0; i < rs; i++) for (var j = 0; j < cs; j++) (G[r + i] = G[r + i] || [])[c + j] = { td: td, arriba: i === 0, alta: rs > 1 };
        c += cs;
      });
    });
    return G;
  }
  // El número de la partida dentro del PGN del torneo: show_game_ob ('37olm.pgn', '9') → 9.º juego.
  function refPartida(td) {
    var a = td && td.querySelector('a[href*="show_game"]');
    var m = a && (a.getAttribute('href') || '').match(/show_game_ob\s*\(\s*'([^']+)'\s*,\s*'(\d+)'/);
    return m ? { f: m[1].toLowerCase(), n: +m[2] } : null;
  }

  // ───────── Nombres ─────────
  // Apellido "plegado", para comparar lo que escriben distinto las páginas de ronda ("Staahlberg",
  // "Book"), las planillas ("Ståhlberg", "Böök") y el PGN.
  function plegar(s) {
    return String(s || '').toLowerCase().replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
      .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/đ/g, 'd').replace(/ı/g, 'i')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/dj/g, 'd').replace(/oe/g, 'o').replace(/aa/g, 'a').replace(/ae/g, 'a').replace(/ue/g, 'u')
      .replace(/[^a-z]/g, '');
  }
  function apellido(s) { return plegar(String(s || '').replace(/^(GM|IM|FM|CM|WGM|WIM|WFM|WCM|HGM)\s+/, '').split(',')[0]); }   // (1950+: "IM Gligoric")
  // Parecido de dos apellidos: 100 si son iguales; 60 si difieren en una letra cada ~6 (1931: la planilla
  // dice "Hāzenfuss" y el PGN "Hasenfuss"); si no, cuántas letras comparten al principio.
  function distancia(a, b) {
    var p = [], i, j;
    for (j = 0; j <= b.length; j++) p[j] = j;
    for (i = 1; i <= a.length; i++) {
      var q = [i];
      for (j = 1; j <= b.length; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      p = q;
    }
    return p[b.length];
  }
  function parecido(a, b) {
    var a0 = a, b0 = b;
    a = apellido(a); b = apellido(b);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (Math.min(a.length, b.length) >= 5 && distancia(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 6))) return 60;
    var i = 0; while (i < a.length && a[i] === b[i]) i++;
    if (i < 4) {
      // Nombre dado vuelta: la planilla dice "Nguku, Namale Ben" y el PGN "Namale, Ben Nguku" (2004).
      // Vale si el apellido de uno es una palabra ENTERA (de 4 letras o más) del nombre del otro.
      var palabras = function (s) { return String(s || '').split(/[\s,]+/).map(plegar).filter(function (w) { return w.length >= 4; }); };
      if (palabras(b0).indexOf(a) >= 0 || palabras(a0).indexOf(b) >= 0) return 50;
    }
    return i;
  }
  var MES_EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  var MES_ES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var CIUDAD_ES = { 'London': 'Londres', 'The Hague': 'La Haya', 'Hamburg': 'Hamburgo', 'Prague': 'Praga', 'Warsaw': 'Varsovia',
    'Stockholm': 'Estocolmo', 'Munich': 'Múnich', 'Moscow': 'Moscú', 'Havana': 'La Habana', 'Nice': 'Niza', 'Lucerne': 'Lucerna',
    'Thessaloniki': 'Salónica', 'Yerevan': 'Ereván', 'Istanbul': 'Estambul', 'Turin': 'Turín', 'Dresden': 'Dresde',
    'Khanty-Mansiysk': 'Janti-Mansiisk', 'Baku': 'Bakú', 'Valletta': 'La Valeta', 'Leipzig': 'Leipzig', 'Tel Aviv': 'Tel Aviv',
    'Siegen': 'Siegen', 'Skopje': 'Skopie', 'Geneva': 'Ginebra', 'Vienna': 'Viena', 'Brussels': 'Bruselas', 'Copenhagen': 'Copenhague',
    'La Valletta': 'La Valeta', 'Dubai': 'Dubái' };
  var PAIS_ES_EXTRA = { 'Czechoslovakia': 'Checoslovaquia', 'Yugoslavia': 'Yugoslavia', 'USSR': 'Unión Soviética', 'Soviet Union': 'Unión Soviética',
    'West Germany': 'Alemania Occidental', 'East Germany': 'Alemania Oriental', 'Palestine': 'Palestina',
    'England': 'Inglaterra', 'Scotland': 'Escocia', 'Wales': 'Gales' };
  var _regEn = null;
  function paisES(n) {
    n = String(n || '').trim().replace(/^The /, '');
    if (PAIS_ES_EXTRA[n]) return PAIS_ES_EXTRA[n];
    try {
      if (!_regEn) {
        _regEn = {};
        var en = new Intl.DisplayNames(['en'], { type: 'region' }), es = new Intl.DisplayNames(['es'], { type: 'region' });
        for (var a = 65; a <= 90; a++) for (var b = 65; b <= 90; b++) {
          var c = String.fromCharCode(a, b);
          try { var e = en.of(c); if (e && e !== c) _regEn[e.toLowerCase()] = es.of(c); } catch (x) {}
        }
      }
      return _regEn[n.toLowerCase()] || n;
    } catch (x) { return n; }
  }
  // "Dubrovnik, Yugoslavia (today's Croatia)" → "Dubrovnik, Yugoslavia (hoy Croacia)"
  function lugarES(s) {
    s = String(s || '').replace(/^([^,(]+?)\s*\((?!today)([^)]+)\)\s*$/i, '$1, $2');   // "Haifa (Israel)" (1976-1986)
    s = s.replace(/,\s*(today'?s\s+[^,)]+)\s*$/i, ' ($1)');   // "Novi Sad (Yugoslavia, today's Serbia)" (1990)
    var hoy = '', m = String(s || '').match(/\(today'?s ([^)]+)\)/i);
    if (m) hoy = ' (hoy ' + paisES(m[1]) + ')';
    var partes = String(s || '').replace(/\([^)]*\)/g, '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var ciudad = CIUDAD_ES[partes[0]] || partes[0] || '';
    var pais = partes.length > 1 ? paisES(partes[partes.length - 1]) : '';
    return { ciudad: ciudad, lugar: ciudad + (pais ? ', ' + pais : '') + hoy };
  }
  // "31th July - 14th August 1937" / "18th - 30th July 1927" → fechas.
  function fechas(s) {
    var m = String(s || '').match(/(\d{1,2})\w*\s*([A-Za-z]+)?\s*(\d{4})?\s*[-–]\s*(\d{1,2})\w*\s+([A-Za-z]+)\s+(\d{4})/);
    if (!m) return null;
    var m2 = MES_EN[m[5].toLowerCase()], m1 = m[2] ? MES_EN[m[2].toLowerCase()] : m2, y2 = +m[6], y1 = m[3] ? +m[3] : y2;
    if (!m1 || !m2) return null;
    var dd = function (n) { return String(n).padStart(2, '0'); };
    return { txt: (+m[1]) + ' ' + MES_ES[m1] + (y1 !== y2 ? ' ' + y1 : '') + ' – ' + (+m[4]) + ' ' + MES_ES[m2] + ' ' + y2,
      ini: y1 + '-' + dd(m1) + '-' + dd(m[1]), fin: y2 + '-' + dd(m2) + '-' + dd(m[4]) };
  }
  function limpiarPersona(s) {
    s = String(s || '').trim();
    s = s.replace(/\s*,?\s*other sources.*$/i, '');   // (1992: "Leonardo Moguel ,other sources mention also …")
    if (!s || /^n\/?a$/i.test(s)) return '';
    return s.replace(/\s*\([A-Z]{2,3}\)\s*/g, ' ').replace(/^(Mr|Mrs|Ms)\.?\s+/i, '').trim();
  }
  // Nombre de la etapa en castellano.
  function etapaES(n, unica) {
    var m;
    if (/final group/i.test(n)) return unica ? 'Todos contra todos' : 'Final';
    if ((m = n.match(/^Final\s+([A-Z])$/i))) return 'Final ' + m[1].toUpperCase();
    if ((m = n.match(/^Group\s+(\w+)$/i))) return 'Grupo ' + m[1];
    if ((m = n.match(/prelim\w*.*?(\w+)$/i))) return 'Preliminar ' + m[1];
    return n;
  }
  function puntos(s) { var v = parseFloat(String(s || '').replace(/\s+/g, '').replace('½', '.5').replace(/^\.5$/, '0.5')); return isNaN(v) ? 0 : v; }
  function resultado(s) {
    s = String(s || '').replace(/\s+/g, '').replace(/1\/2/g, '½');
    if (/^\+w\/?o-$/i.test(s) || s === '+-') return '+--';
    if (/^-w\/?o\+$/i.test(s) || s === '-+') return '--+';
    if (/^-w\/?o-$/i.test(s) || s === '--') return '---';
    return s;
  }
  // Siglas de equipo: "ARG", "IBCA" y los segundos equipos del anfitrión ("ARG2" = Argentina "B", 1978).
  var SIGLA = /^[A-Z]{2,4}\d?$/;
  function tablero(bo) { var m = String(bo).match(/^(\d+)(\s*res)?/i); if (!m) return 9; return m[2] ? 4 + +m[1] : +m[1]; }

  // Lee UNA competencia entera (pasos 1 a 5): la abierta está en /1996/, la femenina en /1996w/ (mismas
  // páginas, mismos nombres de archivo). que = '' o 'Femenina · ' (para el cartelito).
  async function leer(BASE, que) {
    // ───────── 1) La ficha ─────────
    if (que) total += 1;
    var dIn = html(await traer(BASE + Y + 'in.html', false, que + 'La ficha del torneo'));
    var titulo = dIn.title || '';
    if (!/olimpbase/i.test(titulo + txt(dIn.body).slice(-400))) throw new Error('OlimpBase no mostró la página (¿pidió verificar que sos una persona?). Recargá la página y volvé a tocar el botón.');
    var mOrd = titulo.match(/(\d+)(?:st|nd|rd|th)\s+(?:Women'?s\s+)?Chess Olympiad/i);   // (femenina 1978: "8th Women's Chess Olympiad")
    if (!mOrd) throw new Error('Esta página no es de una Olimpiada de las que sé leer (' + titulo + ').');
    var ficha = {};
    dIn.querySelectorAll('tr').forEach(function (tr) {
      if (tr.cells.length < 2) return;
      var k = txt(tr.cells[0]).replace(/:$/, '');
      if (k && k.length < 40 && !(k in ficha)) ficha[k] = txt(tr.cells[1]);
    });
    var etapas = [], vistas = {};
    dIn.querySelectorAll('a[href]').forEach(function (a) {
      var h = a.getAttribute('href') || '', m = h.match(new RegExp('^' + Y + '([a-z]{2})\\.html$'));
      if (!m || m[1] === 'in' || m[1] === 'id' || vistas[m[1]]) return;
      vistas[m[1]] = 1;
      etapas.push({ st: m[1], ob: txt(a) });
    });
    if (!etapas.length) throw new Error('No encontré las tablas del torneo en la ficha.');
    var pgnUrls = [];
    dIn.querySelectorAll('a[href]').forEach(function (a) {
      var h = a.getAttribute('href') || '';
      if (/\.pgn$/i.test(h)) { var u = new URL(h, BASE + Y + 'in.html').href; if (pgnUrls.indexOf(u) < 0) pgnUrls.push(u); }
    });
    // Desde 1988 la ficha enlaza un .zip (games/88olm.zip; la femenina games/96olw.zip), que desde acá no se
    // puede abrir; el mismo PGN, suelto, está en /ob-games/88olm.pgn (si no existe, traer() da null y se
    // sigue sin partidas).
    if (!pgnUrls.length) {
      var zip = Array.prototype.map.call(dIn.querySelectorAll('a[href$=".zip"]'), function (a) { return (a.getAttribute('href') || '').split('/').pop(); })[0];
      pgnUrls.push(location.origin + '/ob-games/' + (zip ? zip.replace(/\.zip$/i, '.pgn') : Y.slice(2) + 'olm.pgn'));
    }
    // Los grupos preliminares (e*) primero, como se jugó; después las finales.
    etapas.sort(function (a, b) { return (a.st[0] === 'e' ? 0 : 1) - (b.st[0] === 'e' ? 0 : 1) || (a.st < b.st ? -1 : 1); });

    // ───────── 2) Tabla de cada etapa ─────────
    total += etapas.length + pgnUrls.length;
    var equiposHref = {};   // código → página del equipo
    var playoff = '';       // 'gold' | 'silver' | 'bronze' si hubo desempate por una medalla
    for (var ei = 0; ei < etapas.length; ei++) {
      var E = etapas[ei];
      var dSt = html(await traer(BASE + Y + E.st + '.html', false, que + 'La tabla: ' + E.ob));
      var tabla = null;
      dSt.querySelectorAll('table').forEach(function (t) {
        if (tabla || !t.rows.length) return;
        var cab = Array.prototype.map.call(t.rows[0].cells, txt);
        if (cab.indexOf('code') >= 0 && cab.indexOf('pts') >= 0) tabla = t;
      });
      if (!tabla) throw new Error('No encontré la tabla de ' + E.ob + '.');
      var G = grilla(tabla);
      E.cab = G[0].map(function (g) { return txt(g.td); });
      E.filas = G.slice(1).map(function (fila) { return fila.map(function (g) { return g ? txt(g.td) : ''; }); });
      // ¿Suiza o todos contra todos? Lo dicen las columnas de las rondas: en la suiza cada celda es rival +
      // puntos ("FRA3"); en el cuadro cruzado, puntos a secas y "●" en la diagonal. (Leipzig 1960 y Varna
      // 1962: grupos y Finales A-B todos contra todos, pero la Final C fue una suiza de 11 rondas.)
      var conSigla = 0, conBola = 0;
      E.cab.forEach(function (h, i) {
        if (!/^\d+$/.test(h)) return;
        E.filas.forEach(function (fl) { var v = String(fl[i] || '').replace(/\s+/g, ''); if (v === '●') conBola++; else if (/^[A-Z]{2,5}\d?[\d½]+$/.test(v)) conSigla++; });
      });
      E.suizo = conSigla > conBola;
      // Desempate por una medalla, anotado debajo de la tabla (Medellín 1974, Final A femenina: "Play-off for
      // gold: Soviet Union-Romania 3-1 (2-0, 1-1)"). Sus partidas vienen en el PGN con [Event "… play-off"].
      var mPo = txt(dSt.body).match(/Play-?off for (gold|silver|bronze)/i);
      if (mPo) playoff = mPo[1].toLowerCase();
      E.nR = 0;
      dSt.querySelectorAll('a[href]').forEach(function (a) {
        var h = a.getAttribute('href') || '', m = h.match(new RegExp('^' + Y + E.st + '(\\d{2})\\.html$'));
        if (m) E.nR = Math.max(E.nR, +m[1]);
        var mt = h.match(new RegExp('^' + Y + '([a-z]{3,4}\\d?)\\.html$'));
        if (mt && SIGLA.test(txt(a))) equiposHref[txt(a)] = h;
      });
      total += E.nR;
    }
    var codigos = Object.keys(equiposHref);
    total += codigos.length;

    // ───────── 3) Las rondas ─────────
    var rondas = {};   // st+r → [{a, aName, b, bName, score, boards:[{l, lc, res, r, ref}]}]
    for (ei = 0; ei < etapas.length; ei++) {
      E = etapas[ei];
      for (var r = 1; r <= E.nR; r++) {
        var dR = html(await traer(BASE + Y + E.st + String(r).padStart(2, '0') + '.html', false, que + (etapas.length === 1 ? 'Ronda ' + r : etapaES(E.ob, false) + ' · ronda ' + r)));
        var cruces = [];
        dR.querySelectorAll('table').forEach(function (t) {
          if (!t.rows.length) return;
          // El renglón de arriba del cruce. Todos contra todos: "ARG | Argentina | 2½ : 1½ | Polonia | POL"
          // (el marcador con clase rr-match-score). Suizo (1976+): "RUS | bandera | Russia | 2649 | 3½ : ½ |
          // 2398 | Finland | bandera | FIN" (con el Elo medio de cada equipo). Se toma el marcador y, a cada
          // lado, el primer texto que no sea un número.
          var c0 = Array.prototype.map.call(t.rows[0].cells, txt), n = c0.length;
          if (n < 3 || !SIGLA.test(c0[0]) || !SIGLA.test(c0[n - 1])) return;
          // El marcador: "2½ : 1½" (1988-1996) o "1 — 3" (1976-1986, clase sw-match-score).
          var sEl = t.rows[0].querySelector('.rr-match-score, .sw-match-score'), iS = -1;
          if (sEl) iS = Array.prototype.indexOf.call(t.rows[0].cells, sEl.closest('td,th'));
          if (iS < 0) for (var k = 1; k < n - 1; k++) if (/^[\d½]+\s*[:—–-]\s*[\d½]+$/.test(c0[k])) { iS = k; break; }
          if (iS < 0) return;
          var mSc = c0[iS].match(/^([\d½]+)\s*[:—–-]\s*([\d½]+)$/);
          if (!mSc) return;
          c0[iS] = mSc[1] + ' : ' + mSc[2];
          var noNum = function (x) { return x && !/^[\d.,]+$/.test(x); };
          var aN = '', bN = '';
          for (k = 1; k < iS && !aN; k++) if (noNum(c0[k])) aN = c0[k];
          for (k = n - 2; k > iS && !bN; k--) if (noNum(c0[k])) bN = c0[k];
          var M = { a: c0[0], aName: aN, b: c0[n - 1], bName: bN, score: c0[iS], boards: [], nota: '' };
          for (var i = 1; i < t.rows.length; i++) {
            var cs = t.rows[i].cells;
            var ce = t.rows[i].querySelector('td.ce');
            if (cs.length < 5 || !ce) { var nt = txt(t.rows[i]); if (nt) M.nota = nt; continue; }
            var colIzq = (cs[1].getAttribute('style') || '') + ' ' + (cs[1].className || '');
            var eL = txt(cs[1]), eR = txt(cs[cs.length - 2]);
            M.boards.push({ l: txt(cs[0]), r: txt(cs[cs.length - 1]), res: resultado(txt(ce)),
              lc: /white/i.test(colIzq) ? 'w' : (/black|cccccc/i.test(colIzq) ? 'b' : ''), ref: refPartida(ce),
              eL: /^\d{3,4}$/.test(eL) ? +eL : 0, eR: /^\d{3,4}$/.test(eR) ? +eR : 0 });
          }
          // La app dibuja el tablero 1 con blancas para el equipo de la IZQUIERDA (y alterna). Si OlimpBase
          // puso a la izquierda al que llevaba negras en el 1, se da vuelta el cruce entero.
          if (M.boards.length && M.boards[0].lc === 'b') {
            var sc0 = M.score.split(':').map(function (x) { return x.trim(); });
            var inv0 = function (x) { return x === '1-0' ? '0-1' : x === '0-1' ? '1-0' : x === '+--' ? '--+' : x === '--+' ? '+--' : x; };
            M = { a: M.b, aName: M.bName, b: M.a, bName: M.aName, score: sc0[1] + ' : ' + sc0[0], nota: M.nota, girado: true,
              boards: M.boards.map(function (b) { return { l: b.r, r: b.l, res: inv0(b.res), lc: b.lc === 'b' ? 'w' : (b.lc === 'w' ? 'b' : ''), ref: b.ref, eL: b.eR, eR: b.eL }; }) };
          }
          cruces.push(M);
        });
        rondas[E.st + r] = cruces;
      }
    }

    // ───────── 4) La planilla de cada equipo ─────────
    var equipos = {};   // código → { cols:[{st, r}], jugadores:[{bo, name, celdas:[{v, opp}]}] }
    var etapaPorNombre = {};
    etapas.forEach(function (x) { etapaPorNombre[x.ob.toLowerCase()] = x.st; });
    for (var ci = 0; ci < codigos.length; ci++) {
      var code = codigos[ci];
      var dT = html(await traer(new URL(equiposHref[code], BASE).href, false, que + 'Planilla de ' + code));
      var tt = null;
      dT.querySelectorAll('table').forEach(function (t) { if (!tt && t.rows.length && /^Stage:?$/i.test(txt(t.rows[0].cells[0]))) tt = t; });
      if (!tt) { equipos[code] = { cols: [], jugadores: [] }; continue; }
      var GT = grilla(tt), ancho = GT[0].length, cols = [], cuenta = {};
      for (var c = 0; c < ancho; c++) {
        var g0 = GT[0][c], nom = g0 ? txt(g0.td) : '';
        if (/^stage:?$/i.test(nom) || !nom) { cols.push(null); continue; }
        if (/results/i.test(nom)) { cols.push('fin'); continue; }
        var st = etapaPorNombre[nom.toLowerCase()];
        cuenta[nom] = (cuenta[nom] || 0) + 1;
        cols.push(st ? { st: st, r: cuenta[nom] } : null);
      }
      // Las primeras columnas son el rótulo: "tablero | nombre | bandera" (1937) o sólo "nombre | bandera"
      // (1927: sin número de tablero; ahí el orden de la planilla ES el orden de tablero).
      var anchoRot = Math.max(1, GT[0][0].td.colSpan || 1), jug = [];
      for (var fr = 1; fr < GT.length; fr++) {
        var fila = GT[fr]; if (!fila || !fila[0]) continue;
        if (/:$/.test(txt(fila[0].td))) continue;   // Round: / Opponent: / Score:
        var bo = '', nombre = '', eloP = 0;
        for (var k = 0; k < anchoRot; k++) {
          if (!fila[k] || !fila[k].arriba) continue;
          var tk = txt(fila[k].td);
          if (!bo && !nombre && /^\d+(\s*res\.?)?$/i.test(tk)) bo = tk;
          else if (!nombre && (/(^|\s)let(\s|$)/.test(fila[k].td.className || '') || /,/.test(tk))) nombre = tk;
          else if (nombre && !eloP && /^\d{4}$/.test(tk)) eloP = +tk;   // (1976+: "1 | GM Spangenberg, Hugo | 2555")
        }
        if (!nombre || /empty\s*board|^N\.?\s?N\.?$/i.test(nombre)) continue;   // (1978 "-- empty board --", 1992 "NN": no son jugadores)
        // Desde 1950 el título viene pegado al nombre ("IM Gligoric, Svetozar"): va aparte.
        var mTi = nombre.match(/^(GM|IM|FM|CM|WGM|WIM|WFM|WCM|HGM)\s+(.+)$/), ti = '';
        if (mTi) { ti = mTi[1]; nombre = mTi[2]; }
        var j = { bo: bo || String(jug.length + 1), name: nombre, ti: ti, elo: eloP, celdas: {}, sum: [] };
        for (c = 0; c < ancho; c++) {
          var col = cols[c], g = fila[c];
          if (!col || !g) continue;
          if (col === 'fin') { if (g.arriba) j.sum.push(txt(g.td)); continue; }
          // Celda alta (BYE / match no jugado): no es una partida de ESTE jugador.
          var v = (g.arriba && !g.alta) ? txt(g.td) : '';
          j.celdas[col.st + col.r] = { v: v, opp: v ? (g.td.getAttribute('title') || '') : '', ref: v ? refPartida(g.td) : null };
        }
        jug.push(j);
      }
      equipos[code] = { jugadores: jug };
    }

    // ───────── 5) El PGN ─────────
    var pgn = {};   // archivo → [partidas]
    for (var pi = 0; pi < pgnUrls.length; pi++) {
      var buf = await traer(pgnUrls[pi], true, que + 'Las partidas (PGN)');
      if (!buf) continue;
      var texto;
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { texto = new TextDecoder('windows-1252').decode(buf); }
      var lista = texto.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split(/\n(?=\[Event )/).map(function (s) { return s.trim(); }).filter(function (s) { return /^\[Event /.test(s); });
      pgn[pgnUrls[pi].split('/').pop().toLowerCase()] = lista.map(function (s) {
        var h = function (k) { var m = s.match(new RegExp('\\[' + k + ' "([^"]*)"\\]')); return m ? m[1] : ''; };
        // (wc/bc: la sigla del equipo pegada al nombre, "Gaprindashvili, Nona URS"; d: la fecha.)
        var sig = function (k) { var m = h(k).match(/\s([A-Z]{3,4}\d?)$/); return m ? m[1] : ''; };
        return { txt: s, ev: h('Event'), r: parseInt(h('Round'), 10) || 0, w: h('White').replace(/\s+[A-Z]{3,4}\d?$/, ''), b: h('Black').replace(/\s+[A-Z]{3,4}\d?$/, ''), res: h('Result'),
          wc: sig('White'), bc: sig('Black'), d: h('Date'), usada: false };
      });
    }
    // Las partidas de cada ronda, para no recorrer las ~3000 de una suiza en cada mesa.
    var pgnRonda = {};
    Object.keys(pgn).forEach(function (fk) { pgn[fk].forEach(function (x) { (pgnRonda[x.r] = pgnRonda[x.r] || []).push(x); }); });
    // Tableros por match: 4 en la abierta, 3 en la femenina (para los puntos del rival que no se presentó).
    var nTab = 0;
    Object.keys(rondas).forEach(function (k) { rondas[k].forEach(function (m) { nTab = Math.max(nTab, m.boards.length); }); });
    return { dIn: dIn, titulo: titulo, mOrd: mOrd, ficha: ficha, etapas: etapas, rondas: rondas, equipos: equipos, pgn: pgn, pgnRonda: pgnRonda, nTab: nTab || 4, playoff: playoff,
      // (Hasta 2006 la tabla trae Buchholz; desde Dresde 2008, "MP | dSB | dSMP | pts" y la ficha dice "Swiss".)
      suizo: etapas.length === 1 && (etapas[0].suizo || etapas[0].cab.indexOf('Buch') >= 0 || etapas[0].cab.indexOf('dSB') >= 0 || /swiss/i.test(ficha['Competition format'] || '')) };
  }

  try {
    barra(0, 1, 'Leyendo la ficha del torneo');
    // Parado en una femenina: ¿se jugó junto con la abierta (su ficha enlaza la de la abierta: 1972, 1976,
    // 1978…) o aparte (1957, 1963, 1966, 1969, 1974: otra sede, otro año)? Junto → se lee todo como si se
    // hubiera tocado desde la abierta. Aparte → torneo propio, sólo la femenina.
    var soloFem = false;
    if (esFem) {
      var dWin = html(await traer(BASE_W + Y + 'in.html', false, 'La ficha del torneo'));
      soloFem = !dWin.querySelector('a[href="../' + Y + '/' + Y + 'in.html"]');
      if (soloFem) BASE = BASE_W;
    }
    var D0 = await leer(BASE, '');
    // ───────── 6) Armar el torneo ─────────
    // Suiza (1976+): una sola etapa y la tabla con Buchholz. Las de todos contra todos no lo tienen.
    var suizo = D0.suizo, ficha = D0.ficha, mOrd = D0.mOrd;
    // La femenina, si se jugó a la par (misma sede, carpeta /1972w/): va en el mismo torneo.
    var Dw = null;
    var ciudadDe = function (fc) { return String(fc['City'] || '').split(/[,(]/)[0].trim(); };
    if (!soloFem && D0.dIn.querySelector('a[href="../' + Y + 'w/' + Y + 'in.html"]')) {
      Dw = await leer(BASE_W, 'Femenina · ');
      if (ciudadDe(Dw.ficha) !== ciudadDe(ficha)) Dw = null;
    }
    // Con grupos y finales en alguna de las dos, las categorías van en dos pisos (grupo Absoluto / Femenino).
    var conGrupo = !!Dw && (D0.etapas.length > 1 || Dw.etapas.length > 1);
    barra(total, total, 'Armando el archivo…');
    var f = fechas(ficha['Date'] || ficha['Dates']), L = lugarES(ficha['City']);
    var nombreTorneo = mOrd[1] + '.ª Olimpíada ' + (soloFem ? 'Femenina ' : '') + 'de Ajedrez · ' + L.ciudad + ' ' + Y;
    var ID = 'tz_ob' + Y + (soloFem ? 'w' : '');
    var informe = { anio: Y, fuente: BASE + Y + 'in.html', mesas: 0, conPartida: 0, wo: 0, sinPartida: [], partidasPGN: 0, sueltas: [],
      resultados: [], nombres: [], sinJugar: [], corregidos: [], descansos: [], equipos: [] };
    var cfgCats = [], cr = {}, partidasPorCat = [];

  // Arma las categorías de UNA competencia (la abierta o la femenina) y suma al informe.
  function armar(D, rama) {
    var etapas = D.etapas, rondas = D.rondas, equipos = D.equipos, pgn = D.pgn, pgnRonda = D.pgnRonda;
    // Nombre de cada equipo: el del cruce. Países que ya no existen con ese nombre: aclarado y sin
    // bandera (nunca la de hoy). La app traduce el resto al mostrarlo (_paisES).
    var nombreEq = {};
    Object.keys(rondas).forEach(function (k) { rondas[k].forEach(function (m) { nombreEq[m.a] = m.aName; nombreEq[m.b] = m.bName; }); });
    etapas.forEach(function (x) {
      var iC = x.cab.indexOf('code'), iT = x.cab.indexOf('team');
      x.filas.forEach(function (fl) { if (SIGLA.test(fl[iC] || '') && !nombreEq[fl[iC]] && fl[iT]) nombreEq[fl[iC]] = fl[iT]; });   // (no el encabezado "code/team")
    });
    function nombreDe(c) {
      // 'Argentina "B"' → "Argentina B" (la app traduce "Argentina" y conserva la letra); "The Philippines".
      var n = String(nombreEq[c] || c).replace(/\s*"([A-Z])"\s*$/, ' $1').replace(/^The\s+/i, '');
      if (/^Czecho-Slovakia$/i.test(n)) return 'Czechoslovakia';   // (1992)
      // Como los escribe Chess-Results (así la app los dice en castellano).
      var COMO_CR = { 'U.S. Virgin Islands': 'US Virgin Islands', 'Antigua': 'Antigua and Barbuda', 'Republic of South Africa': 'South Africa',
        'Guernsey-Jersey': 'Guernsey y Jersey',   // (1982: un solo equipo de las dos islas; sin bandera)
        'Virgin Islands': 'US Virgin Islands' };   // (1968-1972, sigla VIR: las de EE. UU.; las británicas llegan mucho después)
      if (COMO_CR[n]) return COMO_CR[n];
      if (/^IBCA$/i.test(n)) return 'IBCA (ajedrecistas ciegos)';
      if (/^IPCA$/i.test(n)) return 'IPCA (ajedrecistas con discapacidad física)';
      if (/^ICSC$/i.test(n)) return 'ICSC (ajedrecistas sordos)';
      if (/^ICCD$/i.test(n)) return 'ICCD (ajedrecistas sordos)';   // el ICSC con su nombre nuevo (2016)
      if (/^Palestine$/i.test(n) && +Y < 1948) return 'Palestina (mandato británico)';
      if (/Bohemia/i.test(n)) return 'Bohemia y Moravia';
      if (/Serbs, Croats and Slovenes/i.test(n)) return 'Reino de los Serbios, Croatas y Eslovenos';   // Yugoslavia antes de 1929
      return n;
    }
    function fedDe(c) {
      var n = nombreEq[c] || '';
      if (/Bohemia/i.test(n) || (/^Palestine$/i.test(n) && +Y < 1948)) return '';
      if (/Serbs, Croats and Slovenes/i.test(n)) return 'SCS';   // su tricolor lisa (la app la tiene)
      if (/^Great Britain$/i.test(n)) return 'GBR';               // bandera británica, no la inglesa
      if (/^West Germany$/i.test(n)) return 'FRG';                // OlimpBase le dice GER; la app: "Alemania Occidental"
      if (/Rhodesia/i.test(n)) return 'RHO';                      // OlimpBase le pone ZIM: sin la bandera de Zimbabue (1970, 1974)
      if (/^(IBCA|IPCA|ICSC|ICCD)$/i.test(n)) return '';                // no son países: sin bandera
      c = c.replace(/\d$/, '');        // ARG2 = Argentina "B": la misma bandera
      if (c === 'CSR') return 'TCH';   // Checoslovaquia (la app la conoce como TCH; su bandera = la de Chequia)
      if (c === 'ROM') return 'ROU';   // Rumania: OlimpBase usa el código viejo
      // Bandera de la ÉPOCA (la app: _FED_HIST_FLAG). Yugoslavia: lisa el reino y la RF (1992-2003), con
      // estrella la socialista (1946-1991). Antillas: seis estrellas hasta 1985; AHO a secas = cinco.
      if (c === 'YUG') return (+Y >= 1946 && +Y <= 1991) ? 'YGE' : 'YGL';
      if (c === 'AHO' && +Y < 1986) return 'AHX';
      if (c === 'GEO' && +Y < 2004) return 'GEX';   // Georgia: la granate con el cantón negro y blanco hasta enero de 2004
      if (c === 'GDR' && +Y < 1960) return 'GDX';   // Alemania Oriental: tricolor lisa hasta octubre de 1959 (después, con el emblema)
      var FIDE = { MAU: 'MTN', LIB: 'LBN', SIN: 'SGP', GBG: '',   // Mauritania, Líbano, Singapur (siglas viejas); Guernsey-Jersey
        COG: 'CGO', SIL: 'SLE', TGO: 'TOG', BTN: 'BHU',   // siglas OLÍMPICAS (2010+) → las de la FIDE: Congo, Sierra Leona, Togo, Bután
        VIR: 'ISV' };   // Islas Vírgenes de EE. UU. (1968-1972). Sarre (SAA, 1952-56) queda SAA: la app lo conoce, sin bandera
      if (c in FIDE) return FIDE[c];
      return c;
    }

    Object.keys(pgn).forEach(function (k) { informe.partidasPGN += pgn[k].length; });
    // Evento del PGN → etapa (lo enseñan las partidas con número; si hay una sola etapa, todo es de esa).
    var evEtapa = {}, votos = {};
    function jugadoresEn(code, clave) {
      return (equipos[code] ? equipos[code].jugadores : []).filter(function (j) { return j.celdas[clave] && j.celdas[clave].v; })
        .sort(function (a, b) { return tablero(a.bo) - tablero(b.bo); });
    }
    // El jugador de la planilla que se sentó en esa mesa: por apellido; si hay dos (hermanos), el que
    // jugó contra ese rival; si no, el del mismo orden de tablero.
    // (vez = cuántas mesas ANTERIORES de este match ya tenían ese mismo apellido de este lado.)
    function elegir(code, clave, apell, rival, idx, vez) {
      var js = jugadoresEn(code, clave);
      var mismos = js.filter(function (j) { return apellido(j.name) === apellido(apell); });
      if (mismos.length > 1) {
        var x = mismos.filter(function (j) { return apellido(j.celdas[clave].opp) === apellido(rival); });
        if (x.length === 1) return { j: x[0], seguro: true };
        // Hermanos (1978: "Broomes, M." y "Broomes, G." de Guyana): la inicial del nombre, si la página la da.
        var ini = (String(apell).split(',')[1] || '').replace(/[^A-Za-zÀ-ÿ]/g, '').charAt(0).toLowerCase();
        if (ini) { x = mismos.filter(function (j) { return plegar((j.name.split(',')[1] || '').trim().charAt(0)) === plegar(ini); }); if (x.length === 1) return { j: x[0], seguro: true }; }
        // Si no, el orden de tablero, que en las Olimpiadas es obligatorio (1978: los Pantebre Martínez de
        // Andorra): el primero de la lista va en la primera de sus mesas, el segundo en la siguiente…
        if (mismos[vez || 0]) return { j: mismos[vez || 0], seguro: true };
      }
      if (mismos.length === 1) return { j: mismos[0], seguro: true };
      var parec = js.filter(function (j) { return parecido(j.name, apell) >= 4; });
      if (parec.length === 1) return { j: parec[0], seguro: true };
      return { j: js[idx] || null, seguro: false };
    }

    etapas.forEach(function (E) {
      var catIdx = cfgCats.length;
      var suizo = E.suizo || D.suizo;   // (esta etapa: la Final C de 1960 es suiza y el resto no)
      var grupo = conGrupo ? (rama === 'fem' ? 'Femenino' : 'Absoluto') : '';
      var etiqueta = grupo ? (etapas.length === 1 ? grupo : grupo + ' · ' + etapaES(E.ob, false))
        : (D.suizo ? (rama === 'fem' ? 'Femenino' : 'Absoluto') : etapaES(E.ob, etapas.length === 1));
      var iCode = E.cab.indexOf('code'), iPts = E.cab.indexOf('pts'), iMP = E.cab.indexOf('MP'), iRk = E.cab.indexOf('no.');
      if (iRk < 0) iRk = E.cab.indexOf('pos.');
      var colsGrid = E.cab.map(function (h, i) { return /^\d+$/.test(h) ? i : -1; }).filter(function (i) { return i >= 0; });
      // Suizo: la columna de cada ronda dice rival + puntos ("FIN3½"). Los cruces que la página de la ronda
      // no muestra (el rival no se presentó: 1996 R1 Chile "MLI4") se agregan como "no se jugó".
      var siglas = { BYE: 1 };
      E.filas.forEach(function (fl) { if (SIGLA.test(fl[iCode] || '')) siglas[fl[iCode]] = 1; });
      var celda = function (x) {   // "FIN3½" → [, 'FIN', '3½']; "LUX3½" es Luxemburgo 3½ (no "LUX3"): la sigla más larga que exista
        x = String(x || '').replace(/\s+/g, '');
        for (var lg = 5; lg >= 2; lg--) if (siglas[x.slice(0, lg)] && /^[\d½]+$/.test(x.slice(lg))) return [x, x.slice(0, lg), x.slice(lg)];
        return null;
      };
      if (suizo) {
        colsGrid.forEach(function (ic, ri) {
          var r0 = ri + 1, R0 = rondas[E.st + r0] = rondas[E.st + r0] || [], hay = {};
          R0.forEach(function (m) { hay[m.a] = hay[m.b] = 1; });
          E.filas.forEach(function (fl) {
            var yo = fl[iCode], mm = celda(fl[ic]);
            if (!yo || !mm || hay[yo] || hay[mm[1]]) return;
            // Ronda libre por número impar de equipos ("BYE2"): Chess-Results no la guarda como cruce, y acá
            // tampoco (sería un rival "BYE" en las estadísticas). La tabla final ya trae esos puntos.
            if (mm[1] === 'BYE') { informe.descansos.push(etiqueta + ' R' + r0 + ': ' + nombreDe(yo) + ' (' + mm[2] + ' puntos)'); hay[yo] = 1; return; }
            var suyo = E.filas.filter(function (x) { return x[iCode] === mm[1]; })[0];
            var mp = suyo && celda(suyo[ic]);
            var ptsRival = mp && mp[1] === yo ? mp[2] : String(D.nTab - puntos(mm[2])).replace('.5', '½').replace(/^0½$/, '½');
            R0.push({ a: yo, aName: '', b: mm[1], bName: '', score: mm[2] + ' : ' + ptsRival, boards: [], nota: '', sintetico: true });
            hay[yo] = hay[mm[1]] = 1;
          });
        });
      }
      var jugaron = {};
      for (var r = 1; r <= E.nR; r++) (rondas[E.st + r] || []).forEach(function (m) { jugaron[m.a] = 1; jugaron[m.b] = 1; });
      var orden = [], rkAnt = 0;
      var iMatch = E.cab.indexOf('matches'), iBuch = E.cab.indexOf('Buch'), iDSB = E.cab.indexOf('dSB'), iDSMP = E.cab.indexOf('dSMP');
      var iDes = [iPts, iBuch, iMP, iDSB, iDSMP].filter(function (i) { return i >= 0; }).sort(function (x, y) { return x - y; });
      var dec = function (s) { return String(s || '').replace(/\s+/g, '').replace(/^½$/, '0.5').replace(/½$/, '.5'); };
      var teams = E.filas.filter(function (fl) { return fl[iCode] && jugaron[fl[iCode]]; }).map(function (fl) {
        var rk = parseInt(fl[iRk], 10) || rkAnt; rkAnt = rk; orden.push(fl[iCode]);
        if (suizo) {
          // Como la tabla final de Chess-Results: matches jugados/ganados/empatados/perdidos y los desempates
          // en el orden en que OlimpBase los pone (que es el oficial de ese año).
          var w = +fl[iMatch] || 0, d = +fl[iMatch + 1] || 0, l = +fl[iMatch + 2] || 0;
          var des = iDes.map(function (i) { return dec(fl[i]); });
          return { rk: rk, name: nombreDe(fl[iCode]), fed: fedDe(fl[iCode]), played: String(w + d + l), w: String(w), d: String(d), l: String(l), des: des };
        }
        return { rk: rk, name: nombreDe(fl[iCode]), fed: fedDe(fl[iCode]), grid: colsGrid.map(function (i) { return fl[i] === '●' ? '*' : fl[i]; }), des: [fl[iPts], fl[iMP]] };
      });
      if (suizo && etapas.length === 1) informe.desempates = iDes.map(function (i) { return { pts: 'puntos de partida', Buch: 'Buchholz', MP: 'puntos de match', dSB: 'Berger (sin el peor rival)', dSMP: 'suma de puntos de match de los rivales (sin el peor)' }[E.cab[i]]; });
      var noDe = function (c) { return String(orden.indexOf(c) + 1); };
      var teamRounds = {}, teamCrosses = {}, partidas = [];
      for (r = 1; r <= E.nR; r++) {
        var R = rondas[E.st + r]; if (!R) continue;
        teamRounds[r] = []; teamCrosses[r] = [];
        R.forEach(function (m, mi) {
          var sc = m.score.split(':').map(function (x) { return x.trim(); });
          teamCrosses[r].push({ no: String(mi + 1), aFed: fedDe(m.a), aName: nombreDe(m.a), aPts: '', aRes: sc[0], bRes: sc[1], bPts: '', bName: nombreDe(m.b), bFed: fedDe(m.b) });
          var boards = [], sentados = {};
          m.boards.forEach(function (b, bi) {
            var clave = E.st + r;
            var antes = m.boards.slice(0, bi), vezL = 0, vezR = 0;
            antes.forEach(function (x) { if (apellido(x.l) === apellido(b.l)) vezL++; if (apellido(x.r) === apellido(b.r)) vezR++; });
            // "-- empty board --" (1978 R1 Filipinas–Andorra: llegaron dos filipinos): mesa sin jugador. Se usa
            // el rótulo que la app ya reconoce de Chess-Results; la mesa cuenta como incomparecencia.
            // SIEMPRE es incomparecencia (1992 la pone "1 - 0" y el PGN la trae como partida contra "EMPTY").
            // "NN" (1992, Yemen) es otra cosa: un jugador sin nombre que SÍ jugó. m = cómo figura en el PGN.
            var vacio = function (s) {
              s = String(s || '').trim();
              if (/empty\s*board/i.test(s)) return { j: { name: 'Sin jugador asignado', m: 'EMPTY', vacia: true, ti: '', elo: 0 }, seguro: true };
              if (/^N\.?\s?N\.?$/i.test(s)) return { j: { name: 'NN', m: 'NN', ti: '', elo: 0 }, seguro: true };
              return null;
            };
            var A = vacio(b.l) || elegir(m.a, clave, b.l, b.r, bi, vezL);
            var B = vacio(b.r) || elegir(m.b, clave, b.r, b.l, bi, vezR);
            if (!A.j || !B.j) { informe.nombres.push(etiqueta + ' R' + r + ' ' + m.a + '-' + m.b + ' mesa ' + (bi + 1) + ': no encontré a ' + (!A.j ? b.l : b.r) + ' en la planilla'); return; }
            if (!A.seguro) informe.nombres.push(etiqueta + ' R' + r + ' mesa ' + (bi + 1) + ': "' + b.l + '" → ' + A.j.name + ' (por orden de tablero)');
            if (!B.seguro) informe.nombres.push(etiqueta + ' R' + r + ' mesa ' + (bi + 1) + ': "' + b.r + '" → ' + B.j.name + ' (por orden de tablero)');
            // El mismo jugador en dos mesas del match = error de la página de la ronda (1928 R13 Bélgica–Suecia:
            // repite "Koltanowski–Karlin" y falta Jonsson–Censer). La PLANILLA sabe quién jugó esa ronda: si
            // queda UNO solo sin sentar, es él (y su partida está en el PGN). Si no, se avisa.
            [[A, m.a], [B, m.b]].forEach(function (par) {
              var X = par[0], nm = X.j.name;
              if (X.j.m) return;   // (mesa vacía / NN: pueden repetirse)
              if (sentados[nm]) {
                var libres = jugadoresEn(par[1], clave).filter(function (j) { return !sentados[j.name]; });
                if (libres.length === 1) {
                  informe.corregidos.push(etiqueta + ' R' + r + ' ' + nombreDe(m.a) + '–' + nombreDe(m.b) + ' mesa ' + (bi + 1) + ': la página repite a ' + nm + '; según la planilla jugó ' + libres[0].name);
                  X.j = libres[0];
                } else informe.nombres.push(etiqueta + ' R' + r + ' ' + nombreDe(m.a) + '–' + nombreDe(m.b) + ': ' + nm + ' figura en dos mesas (error de OlimpBase)');
              }
              sentados[X.j.name] = 1;
            });
            if (A.j.vacia || B.j.vacia) b.res = { '1-0': '+--', '0-1': '--+' }[b.res] || (/^[+-]/.test(b.res) ? b.res : '---');
            var nA = A.j.m || A.j.name, nB = B.j.m || B.j.name;   // (así se buscan en el PGN)
            var mesa = { tW: A.j.ti || '', nW: A.j.name, eW: b.eL || A.j.elo || 0, tB: B.j.ti || '', nB: B.j.name, eB: b.eR || B.j.elo || 0, res: b.res };
            boards.push(mesa);
            informe.mesas++;
            if (/^(\+--|--\+|---)$/.test(b.res)) {
              // Incomparecencia: no hay partida. Si el PGN trae un renglón para esa mesa (1937: Stoltz–Reid
              // figura 0-1 sin jugadas), se lo marca como visto para que no aparezca "suelto" en el informe.
              informe.wo++;
              (pgnRonda[r] || []).forEach(function (x) {
                if (!x.usada && Math.max(Math.min(parecido(x.w, nA), parecido(x.b, nB)), Math.min(parecido(x.w, nB), parecido(x.b, nA))) >= 4) x.usada = true;
              });
              return;
            }
            // La partida: primero por su número en el PGN; se comprueba que sea de esa ronda y de esos dos.
            var g = null;
            // ¿El resultado de esa partida coincide con el de la mesa? (Emmen 1957: Finlandia y Francia se
            // cruzaron en el Grupo 1 y otra vez en la Final C, las dos veces en la "ronda 4": hay dos partidas
            // Vuorenpää–Chaudé de Silans con Round 4 y la que va es la del resultado de la tabla.)
            var acuerda = function (x) {
              var bA = parecido(x.w, nA) + parecido(x.b, nB) >= parecido(x.w, nB) + parecido(x.b, nA);
              var rA = String(x.res || '').replace('1/2-1/2', '½-½');
              if (!bA) rA = rA === '1-0' ? '0-1' : rA === '0-1' ? '1-0' : rA;
              return rA === b.res;
            };
            if (b.ref && pgn[b.ref.f]) {
              var cand = pgn[b.ref.f][b.ref.n - 1];
              if (cand && !cand.usada && (!cand.r || cand.r === r) && Math.max(parecido(cand.w, nA) + parecido(cand.b, nB), parecido(cand.w, nB) + parecido(cand.b, nA)) >= 8) g = cand;
            }
            if (!g || !acuerda(g)) {
              var mejor = null, ms = -1;
              // Primero entre las partidas cuyo [Event] es de esta etapa; si no aparece ninguna, entre todas las de
              // la ronda. (Buenos Aires 1978, femenina: las finales A-D comparten el mismo [Event], la Final A se lo
              // quedaba por votos y 3 mesas de las Finales C y D sin número de partida no encontraban la suya.)
              [true, false].forEach(function (porEvento) {
                if (mejor && ms >= 4) return;
                (pgnRonda[r] || []).forEach(function (x) {
                  if (x.usada || /play-?off/i.test(x.ev)) return;   // (las del desempate van aparte, más abajo)
                  if (porEvento && x.ev && evEtapa[x.ev] && evEtapa[x.ev] !== E.st) return;
                  var s = Math.max(Math.min(parecido(x.w, nA), parecido(x.b, nB)), Math.min(parecido(x.w, nB), parecido(x.b, nA)));
                  if (s >= 4 && acuerda(x)) s += 0.5;   // a igual nombre, la del mismo resultado
                  if (s > ms) { ms = s; mejor = x; }
                });
              });
              // (Con número de partida, se cambia sólo por otra de los mismos dos con el resultado justo.)
              if (mejor && ms >= 4 && (!g || acuerda(mejor))) g = mejor;
            }
            // El PGN con el número de RONDA mal (Lublin 1969: Eretová–Kärner dice "Round 1" y se jugó en la 9.ª;
            // la fecha, 17/09, es la de la 9.ª): si en OTRA ronda queda UNA sola partida sin usar de estos dos,
            // con el mismo resultado y del mismo día que las de esta ronda, es esa. Sin fechas no se adivina.
            var rondaMal = 0;
            if (!g) {
              var diasR = {};
              (pgnRonda[r] || []).forEach(function (x) { if (x.d && /^\d{4}\.\d\d\.\d\d$/.test(x.d)) diasR[x.d] = 1; });
              var otras = [];
              Object.keys(pgnRonda).forEach(function (rr) {
                if (+rr === r) return;
                pgnRonda[rr].forEach(function (x) {
                  if (x.usada || /play-?off/i.test(x.ev) || !x.d || !diasR[x.d]) return;
                  if (Math.max(Math.min(parecido(x.w, nA), parecido(x.b, nB)), Math.min(parecido(x.w, nB), parecido(x.b, nA))) >= 4 && acuerda(x)) otras.push(x);
                });
              });
              if (otras.length === 1) {
                g = otras[0]; rondaMal = g.r || -1;
                var dm = g.d.split('.');
                informe.corregidos.push(etiqueta + ' R' + r + ': ' + A.j.name + ' – ' + B.j.name + ': el PGN la trae como ronda ' + (g.r || '?') + ', pero es del ' + (+dm[2]) + '/' + dm[1] + ', el día de la ronda ' + r);
              }
            }
            if (!g) { informe.sinPartida.push(etiqueta + ' R' + r + ': ' + A.j.name + ' – ' + B.j.name + ' (' + b.res + ')'); return; }
            g.usada = true;
            if (g.ev) { votos[g.ev] = votos[g.ev] || {}; votos[g.ev][E.st] = (votos[g.ev][E.st] || 0) + 1; if (!evEtapa[g.ev] && votos[g.ev][E.st] >= 3) evEtapa[g.ev] = E.st; }
            informe.conPartida++;
            // Con el nombre de pila de desempate: 1988 R11 "Moussa, Alaa-Eddine – Moussa, Issa" (mismo apellido).
            var pila = function (s) { return plegar((String(s || '').split(',')[1] || '').trim().split(/\s+/)[0]); };
            var pp = function (x, y) { return parecido(x, y) + (pila(x) && pila(x) === pila(y) ? 1 : 0); };
            var blancasA = pp(g.w, nA) + pp(g.b, nB) >= pp(g.w, nB) + pp(g.b, nA);
            var inv = function (x) { return x === '1-0' ? '0-1' : x === '0-1' ? '1-0' : x; };
            var resA = (blancasA ? g.res : inv(g.res)).replace('1/2-1/2', '½-½');
            if (resA !== b.res) informe.resultados.push(etiqueta + ' R' + r + ': ' + A.j.name + ' – ' + B.j.name + ' (la tabla dice ' + b.res + ', el PGN ' + resA + ')');
            var W = blancasA ? A.j.name : B.j.name, N = blancasA ? B.j.name : A.j.name;
            var WT = blancasA ? nombreDe(m.a) : nombreDe(m.b), BT = blancasA ? nombreDe(m.b) : nombreDe(m.a);
            var limpio = g.txt.replace(/\[White "[^"]*"\]/, '[White "' + W + '"]')
              .replace(/\[Black "[^"]*"\]/, '[Black "' + N + '"]\n[WhiteTeam "' + WT + '"]\n[BlackTeam "' + BT + '"]')
              .replace(/\[Event "[^"]*"\]/, '[Event "' + nombreTorneo + ' · ' + etiqueta + '"]')
              .replace(/\[Site "[^"]*"\]/, '[Site "' + L.lugar + '"]');
            if (rondaMal) limpio = limpio.replace(/\[Round "[^"]*"\]/, '[Round "' + r + '"]');
            partidas.push({ r: r, mi: mi, bi: bi, pgn: limpio });
          });
          if (!m.boards.length) informe.sinJugar.push(etiqueta + ' R' + r + ': ' + nombreDe(m.a) + ' ' + m.score + ' ' + nombreDe(m.b) + (m.sintetico ? ' (sólo figura en la tabla: el rival no se presentó)' : ''));
          if (m.girado) informe.girados = (informe.girados || 0) + 1;
          teamRounds[r].push(Object.assign({ aNo: noDe(m.a), aName: nombreDe(m.a), bNo: noDe(m.b), bName: nombreDe(m.b), score: sc[0] + ' : ' + sc[1], boards: boards },
            m.boards.length ? {} : { nota: 'No se jugó: el match se dio ' + sc[0] + '-' + sc[1] + ', sin partidas.' }));
        });
      }
      // Planteles: los inscriptos del equipo con lo que hicieron EN ESTA etapa.
      var teamRoster = orden.map(function (code, i) {
        return { no: i + 1, name: nombreDe(code), capt: '', eloAvg: '', players: (equipos[code] ? equipos[code].jugadores : []).map(function (j) {
          var pts = 0, gm = 0;
          Object.keys(j.celdas).forEach(function (k) { if (k.indexOf(E.st) === 0 && /^\d+$/.test(k.slice(E.st.length)) && j.celdas[k].v) { gm++; pts += puntos(j.celdas[k].v); } });
          return { bo: /res/i.test(j.bo) ? D.nTab + (parseInt(j.bo, 10) || 1) : tablero(j.bo), ti: j.ti || '', nm: j.name, elo: j.elo || 0, fed: fedDe(code), fid: '', pts: String(pts), gm: String(gm), rp: '' };
        }) };
      });
      cr['cr2_tz_' + ID + '_c' + catIdx] = { teamRounds: teamRounds, teamCrosses: teamCrosses, teamStandings: { kind: suizo ? 'final' : 'rr', teams: teams }, teamRoster: teamRoster };
      // Con la femenina adentro, cada categoría lleva su Rama (la Radiografía no reparte "mejor femenina" en ella).
      // La que abre al entrar: la Final A de la abierta (la de la femenina se abre al tocar "Femenino").
      // Sistema y rondas por categoría cuando no son los del torneo (Final C suiza de 1960; los grupos de
      // la femenina de 1976 dentro de una Olimpiada suiza).
      cfgCats.push(Object.assign({ name: etiqueta, broadcast: null, crurl: null }, rama ? { rama: rama } : {}, grupo ? { grupo: grupo } : {},
        E.st[0] === 'e' ? { sinPodio: true } : {}, (etapas.length > 1 && E.st === 'fa' && !(grupo && rama === 'fem')) ? { inicial: true } : {},
        (suizo ? 'swiss' : 'rr') !== formatoTorneo ? { format: suizo ? 'swiss' : 'rr' } : {},
        (suizo && etapas.length > 1) || (grupo && E.nR !== D0.etapas[0].nR) ? { rounds: E.nR } : {}));
      partidas.sort(function (x, y) { return x.r - y.r || x.mi - y.mi || x.bi - y.bi; });
      partidasPorCat.push({ ev: nombreTorneo + ' · ' + etiqueta, lista: partidas.map(function (x) { return x.pgn; }) });
    });
    // ───── Desempate por una medalla ─────
    // Medellín 1974: la Unión Soviética y Rumania empataron la Final A y jugaron un match a dos rondas por
    // el oro (3-1). No tiene páginas de ronda ni columna en la tabla: se arma con las partidas del PGN
    // ([Event "6th olw play-off"], con la sigla del equipo pegada al nombre) y la planilla de cada equipo.
    // Va como categoría aparte y sin podio (el orden final ya lo da la Final A).
    var po = [];
    Object.keys(pgn).forEach(function (fk) { pgn[fk].forEach(function (x) { if (!x.usada && /play-?off/i.test(x.ev) && x.wc && x.bc && x.r) po.push(x); }); });
    var poEq = [];
    po.forEach(function (x) { [x.wc, x.bc].forEach(function (c) { if (poEq.indexOf(c) < 0) poEq.push(c); }); });
    if (po.length && poEq.length === 2 && poEq.every(function (c) { return equipos[c]; })) (function () {
      var grupoPo = conGrupo ? (rama === 'fem' ? 'Femenino' : 'Absoluto') : '';
      var nomPo = { gold: 'Desempate por el oro', silver: 'Desempate por la plata', bronze: 'Desempate por el bronce' }[D.playoff] || 'Desempate';
      var etqPo = grupoPo ? grupoPo + ' · ' + nomPo : nomPo;
      var jugPo = function (code, nm) {
        var mejor = null, ms = 3;
        equipos[code].jugadores.forEach(function (j) { var s = parecido(j.name, nm); if (s > ms) { ms = s; mejor = j; } });
        return mejor || { bo: '9', name: nm, ti: '', elo: 0 };
      };
      var medio = function (v) { return (Math.floor(v) || (v % 1 ? '' : '0')) + (v % 1 ? '½' : ''); };
      var pts = {}, mp = {}, hizo = {}, cuenta = {};   // hizo[code][nombre] = {pts, gm}
      poEq.forEach(function (c) { pts[c] = 0; mp[c] = 0; hizo[c] = {}; });
      var nroR = [];
      po.forEach(function (x) { if (nroR.indexOf(x.r) < 0) nroR.push(x.r); });
      nroR.sort(function (a, b) { return a - b; });
      var teamRounds = {}, teamCrosses = {}, partidas = [];
      nroR.forEach(function (r0, ri) {
        var r = ri + 1;
        var gs = po.filter(function (x) { return x.r === r0; }).map(function (x) {
          var jw = jugPo(x.wc, x.w), jb = jugPo(x.bc, x.b);
          return { x: x, jw: jw, jb: jb, bo: Math.min(tablero(jw.bo), tablero(jb.bo)) };
        }).sort(function (a, b) { return a.bo - b.bo; });
        // A la izquierda, el equipo que lleva blancas en el tablero 1 (así la app alterna bien los colores).
        var izq = gs[0].x.wc, der = izq === poEq[0] ? poEq[1] : poEq[0];
        var sI = 0, sD = 0, boards = [];
        gs.forEach(function (G, bi) {
          var x = G.x, blancasIzq = x.wc === izq;
          var A = blancasIzq ? G.jw : G.jb, B = blancasIzq ? G.jb : G.jw;
          var res = x.res.replace('1/2-1/2', '½-½');
          var resA = blancasIzq ? res : (res === '1-0' ? '0-1' : res === '0-1' ? '1-0' : res);
          var pA = resA === '1-0' ? 1 : resA === '0-1' ? 0 : 0.5;
          sI += pA; sD += 1 - pA;
          [[izq, A, pA], [der, B, 1 - pA]].forEach(function (q) { var h0 = hizo[q[0]][q[1].name] = hizo[q[0]][q[1].name] || { j: q[1], pts: 0, gm: 0 }; h0.pts += q[2]; h0.gm++; });
          boards.push({ tW: A.ti || '', nW: A.name, eW: A.elo || 0, tB: B.ti || '', nB: B.name, eB: B.elo || 0, res: resA });
          informe.mesas++; informe.conPartida++;
          x.usada = true;
          var W = blancasIzq ? A.name : B.name, N = blancasIzq ? B.name : A.name;
          partidas.push({ r: r, bi: bi, pgn: x.txt.replace(/\[White "[^"]*"\]/, '[White "' + W + '"]')
            .replace(/\[Black "[^"]*"\]/, '[Black "' + N + '"]\n[WhiteTeam "' + nombreDe(x.wc) + '"]\n[BlackTeam "' + nombreDe(x.bc) + '"]')
            .replace(/\[Event "[^"]*"\]/, '[Event "' + nombreTorneo + ' · ' + etqPo + '"]')
            .replace(/\[Site "[^"]*"\]/, '[Site "' + L.lugar + '"]')
            .replace(/\[Round "[^"]*"\]/, '[Round "' + r + '"]') });
        });
        pts[izq] += sI; pts[der] += sD;
        mp[izq] += sI > sD ? 2 : sI === sD ? 1 : 0; mp[der] += sD > sI ? 2 : sI === sD ? 1 : 0;
        teamRounds[r] = [{ _a: izq, _b: der, aName: nombreDe(izq), bName: nombreDe(der), score: medio(sI) + ' : ' + medio(sD), boards: boards }];
        teamCrosses[r] = [{ no: '1', aFed: fedDe(izq), aName: nombreDe(izq), aPts: '', aRes: medio(sI), bRes: medio(sD), bPts: '', bName: nombreDe(der), bFed: fedDe(der) }];
      });
      // El ganador arriba (más puntos de partida; a igualdad, de match).
      if (pts[poEq[1]] > pts[poEq[0]] || (pts[poEq[1]] === pts[poEq[0]] && mp[poEq[1]] > mp[poEq[0]])) poEq.reverse();
      Object.keys(teamRounds).forEach(function (k) { teamRounds[k].forEach(function (m) {
        m.aNo = String(poEq.indexOf(m._a) + 1); m.bNo = String(poEq.indexOf(m._b) + 1); delete m._a; delete m._b;
      }); });
      var empate = pts[poEq[0]] === pts[poEq[1]] && mp[poEq[0]] === mp[poEq[1]];
      var teams = poEq.map(function (c, i) {
        return { rk: empate ? 1 : i + 1, name: nombreDe(c), fed: fedDe(c), grid: i === 0 ? ['*', medio(pts[c])] : [medio(pts[c]), '*'], des: [medio(pts[c]), String(mp[c])] };
      });
      var teamRoster = poEq.map(function (c, i) {
        return { no: i + 1, name: nombreDe(c), capt: '', eloAvg: '', players: Object.keys(hizo[c]).map(function (k) {
          var h0 = hizo[c][k], j = h0.j;
          return { bo: /res/i.test(j.bo) ? D.nTab + (parseInt(j.bo, 10) || 1) : tablero(j.bo), ti: j.ti || '', nm: j.name, elo: j.elo || 0, fed: fedDe(c), fid: '', pts: String(h0.pts), gm: String(h0.gm), rp: '' };
        }).sort(function (a, b) { return a.bo - b.bo; }) };
      });
      cr['cr2_tz_' + ID + '_c' + cfgCats.length] = { teamRounds: teamRounds, teamCrosses: teamCrosses, teamStandings: { kind: 'rr', teams: teams }, teamRoster: teamRoster };
      cfgCats.push(Object.assign({ name: etqPo, broadcast: null, crurl: null, sinPodio: true }, rama ? { rama: rama } : {}, grupoPo ? { grupo: grupoPo } : {},
        formatoTorneo !== 'rr' ? { format: 'rr' } : {}, { rounds: nroR.length }));
      partidas.sort(function (x, y) { return x.r - y.r || x.bi - y.bi; });
      partidasPorCat.push({ ev: nombreTorneo + ' · ' + etqPo, lista: partidas.map(function (x) { return x.pgn; }) });
      informe.playoff = (informe.playoff ? informe.playoff + ' ' : '') + (grupoPo ? grupoPo + ': ' : '') + nomPo + ' entre ' + paisES(nombreDe(poEq[0])) + ' y ' + paisES(nombreDe(poEq[1]))
        + ' (' + medio(pts[poEq[0]]) + '-' + medio(pts[poEq[1]]) + ', ' + po.length + ' partidas): va como categoría aparte, sin podio.';
    })();
    var pre = rama === 'fem' ? 'Femenino ' : '';
    Object.keys(pgn).forEach(function (fk) { pgn[fk].forEach(function (x) { if (!x.usada) informe.sueltas.push(pre + 'R' + x.r + ': ' + x.w + ' – ' + x.b + ' (' + x.res + ')'); }); });
    Object.keys(nombreEq).sort().forEach(function (c) {
      if (informe.equipos.some(function (e) { return e.code === c; })) return;
      informe.equipos.push({ code: c, name: nombreDe(c), fed: fedDe(c), es: nombreDe(c) !== (nombreEq[c] || c) });
    });
  }
    var formatoTorneo = suizo ? 'swiss' : 'rr';
    armar(D0, Dw ? 'abs' : '');
    if (Dw) { armar(Dw, 'fem'); informe.femenina = true; if (conGrupo) informe.femeninaGrupos = true; }
    if (soloFem) informe.soloFemenina = true;
    ['sinPartida', 'sueltas', 'resultados', 'nombres', 'sinJugar', 'corregidos', 'descansos'].forEach(function (k) { informe['n_' + k] = informe[k].length; informe[k] = informe[k].slice(0, 60); });
    // Fechas: la app engancha las partidas con su torneo sólo si su [Date] cae entre las fechas del
    // torneo (±3 días). OlimpBase a veces se equivoca en la ficha: 1933 dice "12th - 23rd July" y se
    // jugó en JUNIO (la reseña de la misma página y el PGN lo confirman) → el torneo quedaba sin
    // partidas. Si las partidas no entran en la ficha, mandan las fechas de las partidas.
    var dia = function (iso, k) { var t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
    var isoDe = function (p) { var m = p.match(/\[Date "(\d{4})\.(\d\d)\.(\d\d)"\]/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; };
    // Pero si casi todas entran y unas pocas traen mal el AÑO (Helsinki 1952: 80 partidas dicen "1951.08.12"
    // en vez de 1952), manda la ficha y a esas se les corrige el año.
    if (f) {
      var nCon = 0, nDentro = 0, nArre = 0, nMal = 0;
      var entra = function (d) { return d >= dia(f.ini, -3) && d <= dia(f.fin, 3); };
      partidasPorCat.forEach(function (x) { x.lista.forEach(function (p) { var d = isoDe(p); if (d) { nCon++; if (entra(d)) nDentro++; } }); });
      if (nCon && nDentro < nCon && nDentro >= 0.8 * nCon) {
        partidasPorCat.forEach(function (x) { x.lista = x.lista.map(function (p) {
          var d = isoDe(p); if (!d || entra(d)) return p;
          var d2 = [f.ini.slice(0, 4), f.fin.slice(0, 4)].map(function (a) { return a + d.slice(4); }).filter(entra)[0];
          if (!d2) { nMal++; return p; }
          nArre++;
          return p.replace(/\[Date "[^"]*"\]/, '[Date "' + d2.replace(/-/g, '.') + '"]');
        }); });
        if (nArre) informe.fechasPgn = nArre + (nArre === 1 ? ' partida del PGN traía' : ' partidas del PGN traían') + ' mal el año (el día y el mes sí caen en el torneo): corregido.';
        if (nMal) informe.fechasPgn = (informe.fechasPgn ? informe.fechasPgn + ' ' : '') + nMal + ' con una fecha fuera del torneo que no se pudo arreglar sola.';
      }
    }
    var dMin = '', dMax = '';
    partidasPorCat.forEach(function (x) { x.lista.forEach(function (p) {
      var d = isoDe(p); if (!d) return;
      if (!dMin || d < dMin) dMin = d; if (!dMax || d > dMax) dMax = d;
    }); });
    if (dMin) {
      if (!f || dMin < dia(f.ini, -3) || dMax > dia(f.fin, 3)) {
        var txtDe = function (iso) { return +iso.slice(8) + ' ' + MES_ES[+iso.slice(5, 7)]; };
        var fPgn = { ini: dMin, fin: dMax, txt: txtDe(dMin) + (dMin.slice(0, 4) !== dMax.slice(0, 4) ? ' ' + dMin.slice(0, 4) : '') + ' – ' + txtDe(dMax) + ' ' + dMax.slice(0, 4) };
        informe.fechas = 'OlimpBase da como fechas "' + (ficha['Date'] || ficha['Dates'] || '—') + '", pero las partidas son del ' + fPgn.txt + ': se usan las de las partidas.';
        f = fPgn;
      }
    }

    var director = limpiarPersona(ficha['Tournament Director']) || limpiarPersona(ficha['Chief Arbiter']);
    var cfg = {
      name: nombreTorneo, type: 'Internacional', location: L.lugar,
      venue: (ficha['Venue'] && !/^n\/?a$/i.test(ficha['Venue'])) ? ficha['Venue'] : '',
      organizer: 'FIDE', director: director,
      dates: f ? f.txt : (ficha['Date'] || ficha['Dates'] || ''), startDate: f ? f.ini : '', endDate: f ? f.fin : '',
      status: 'done', finished: true, format: suizo ? 'swiss' : 'rr', rounds: suizo ? D0.etapas[0].nR : undefined, pace: 'standard', isTeam: true, categories: cfgCats,
      weburl: BASE + Y + 'in.html',
      coleccion: 'olimpiadas', coleccionSolo: true,
      rama: soloFem ? 'fem' : undefined,
      about: 'Datos: OlimpBase (olimpbase.org), de Wojciech Bartelski.'
    };
    var partidasObj = {};
    partidasPorCat.forEach(function (x) { if (x.lista.length) partidasObj[x.ev] = x.lista; });
    var paquete = { tipo: 'chessargentino-torneo-historico', v: 1, creado: new Date().toISOString().slice(0, 10), lector: 2,
      id: ID, cfg: cfg, cr: cr, partidas: partidasObj, informe: informe };
    window.__aaOlimpPaquete = paquete;

    // ───────── 7) Bajar el archivo ─────────
    var nombreArchivo = 'Olimpiada ' + (soloFem ? 'femenina ' : '') + Y + ' - ' + L.ciudad + '.json';
    var blob = new Blob([JSON.stringify(paquete)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombreArchivo;
    document.body.appendChild(a);
    if (!window.__aaOlimpSinBajar) a.click();   // (para probar sin descargar)
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    var avisos = informe.n_sinPartida + informe.n_resultados + informe.n_nombres;
    mostrar('¡Listo! ' + nombreTorneo,
      'Se bajó <b>' + esc(nombreArchivo) + '</b> (' + Math.round(blob.size / 1024) + ' KB)'
      + (Dw ? ', con la <b>abierta y la femenina</b>' + (conGrupo ? ' (cada una con sus grupos y finales)' : ' (dos categorías)') : '') + '.<br>'
      + informe.conPartida + ' de ' + (informe.mesas - informe.wo) + ' mesas con su partida'
      + (informe.wo ? ' (y ' + informe.wo + ' por incomparecencia)' : '')
      + (avisos ? ' · <span style="color:#ffd27a">⚠️ ' + avisos + ' cosas para revisar</span>' : ' · ✅ todo cerró') + '.<br>'
      + '<span style="opacity:.85">Ahora, en la app: 🏛️ Torneos históricos → 📥 Importar torneo histórico → elegí ese archivo.</span>', true);
  } catch (e) {
    fallar(e && e.message ? e.message : String(e));
  }
})();
