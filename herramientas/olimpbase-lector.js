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
   Hoy sabe leer las Olimpiadas de todos contra todos (1927-1939 y 1950, con etapas o no).
   Formato de cada etapa (convert.mjs): cuadro 'rr' con grid + des [pts, MP]; mesas con nW = jugador
   del equipo de la IZQUIERDA (el de arriba del cruce) y res desde su lado. */
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
  var mY = window.__aaOlimpAnio ? [0, String(window.__aaOlimpAnio)] : location.pathname.match(/^\/(\d{4})\//);   // (__aaOlimpAnio: para probar)
  if (!mY) {
    fallar('Abrí primero la página de una Olimpiada (por ejemplo la de Estocolmo 1937) y tocá el botón ahí.');
    return;
  }
  var Y = mY[1], BASE = location.origin + '/' + Y + '/';

  // ───────── Traer páginas, de a una y con pausa ─────────
  var ultimo = 0, hechas = 0, total = 1;
  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function traer(url, binario, que) {
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
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/oe/g, 'o').replace(/aa/g, 'a').replace(/ae/g, 'a').replace(/ue/g, 'u')
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
    a = apellido(a); b = apellido(b);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (Math.min(a.length, b.length) >= 5 && distancia(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 6))) return 60;
    var i = 0; while (i < a.length && a[i] === b[i]) i++;
    return i;
  }
  var MES_EN = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  var MES_ES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var CIUDAD_ES = { 'London': 'Londres', 'The Hague': 'La Haya', 'Hamburg': 'Hamburgo', 'Prague': 'Praga', 'Warsaw': 'Varsovia',
    'Stockholm': 'Estocolmo', 'Munich': 'Múnich', 'Moscow': 'Moscú', 'Havana': 'La Habana', 'Nice': 'Niza', 'Lucerne': 'Lucerna',
    'Thessaloniki': 'Salónica', 'Yerevan': 'Ereván', 'Istanbul': 'Estambul', 'Turin': 'Turín', 'Dresden': 'Dresde',
    'Khanty-Mansiysk': 'Janti-Mansiisk', 'Baku': 'Bakú', 'Valletta': 'La Valeta', 'Leipzig': 'Leipzig', 'Tel Aviv': 'Tel Aviv',
    'Siegen': 'Siegen', 'Skopje': 'Skopie', 'Geneva': 'Ginebra', 'Vienna': 'Viena', 'Brussels': 'Bruselas', 'Copenhagen': 'Copenhague' };
  var PAIS_ES_EXTRA = { 'Czechoslovakia': 'Checoslovaquia', 'Yugoslavia': 'Yugoslavia', 'USSR': 'Unión Soviética', 'Soviet Union': 'Unión Soviética',
    'West Germany': 'Alemania Occidental', 'East Germany': 'Alemania Oriental', 'Palestine': 'Palestina' };
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
  function tablero(bo) { var m = String(bo).match(/^(\d+)(\s*res)?/i); if (!m) return 9; return m[2] ? 4 + +m[1] : +m[1]; }

  try {
    // ───────── 1) La ficha ─────────
    barra(0, 1, 'Leyendo la ficha del torneo');
    var dIn = html(await traer(BASE + Y + 'in.html', false, 'La ficha del torneo'));
    var titulo = dIn.title || '';
    if (!/olimpbase/i.test(titulo + txt(dIn.body).slice(-400))) throw new Error('OlimpBase no mostró la página (¿pidió verificar que sos una persona?). Recargá la página y volvé a tocar el botón.');
    var mOrd = titulo.match(/(\d+)(?:st|nd|rd|th)\s+Chess Olympiad/i);
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
    // Los grupos preliminares (e*) primero, como se jugó; después las finales.
    etapas.sort(function (a, b) { return (a.st[0] === 'e' ? 0 : 1) - (b.st[0] === 'e' ? 0 : 1) || (a.st < b.st ? -1 : 1); });

    // ───────── 2) Tabla de cada etapa ─────────
    total = 1 + etapas.length + pgnUrls.length;
    var equiposHref = {};   // código → página del equipo
    for (var ei = 0; ei < etapas.length; ei++) {
      var E = etapas[ei];
      var dSt = html(await traer(BASE + Y + E.st + '.html', false, 'La tabla: ' + E.ob));
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
      E.nR = 0;
      dSt.querySelectorAll('a[href]').forEach(function (a) {
        var h = a.getAttribute('href') || '', m = h.match(new RegExp('^' + Y + E.st + '(\\d{2})\\.html$'));
        if (m) E.nR = Math.max(E.nR, +m[1]);
        var mt = h.match(new RegExp('^' + Y + '([a-z]{3})\\.html$'));
        if (mt && /^[A-Z]{2,4}$/.test(txt(a))) equiposHref[txt(a)] = h;
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
        var dR = html(await traer(BASE + Y + E.st + String(r).padStart(2, '0') + '.html', false, etapaES(E.ob, etapas.length === 1) + ' · ronda ' + r));
        var cruces = [];
        dR.querySelectorAll('table').forEach(function (t) {
          if (!t.rows.length || !t.rows[0].querySelector('.rr-match-score')) return;
          var c0 = t.rows[0].cells, n = c0.length;
          var M = { a: txt(c0[0]), aName: txt(c0[1]), b: txt(c0[n - 1]), bName: txt(c0[n - 2]), score: txt(t.rows[0].querySelector('.rr-match-score')), boards: [], nota: '' };
          if (!/^[A-Z]{2,4}$/.test(M.a) || !/^[A-Z]{2,4}$/.test(M.b) || !/:/.test(M.score)) return;
          for (var i = 1; i < t.rows.length; i++) {
            var cs = t.rows[i].cells;
            var ce = t.rows[i].querySelector('td.ce');
            if (cs.length < 5 || !ce) { var nt = txt(t.rows[i]); if (nt) M.nota = nt; continue; }
            var colIzq = (cs[1].getAttribute('style') || '') + ' ' + (cs[1].className || '');
            M.boards.push({ l: txt(cs[0]), r: txt(cs[cs.length - 1]), res: resultado(txt(ce)),
              lc: /white/i.test(colIzq) ? 'w' : (/black|cccccc/i.test(colIzq) ? 'b' : ''), ref: refPartida(ce) });
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
      var dT = html(await traer(new URL(equiposHref[code], BASE).href, false, 'Planilla de ' + code));
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
        var bo = '', nombre = '';
        for (var k = 0; k < anchoRot; k++) {
          if (!fila[k] || !fila[k].arriba) continue;
          var tk = txt(fila[k].td);
          if (!bo && /^\d+(\s*res\.?)?$/i.test(tk)) bo = tk;
          else if (!nombre && (/(^|\s)let(\s|$)/.test(fila[k].td.className || '') || /,/.test(tk))) nombre = tk;
        }
        if (!nombre) continue;
        // Desde 1950 el título viene pegado al nombre ("IM Gligoric, Svetozar"): va aparte.
        var mTi = nombre.match(/^(GM|IM|FM|CM|WGM|WIM|WFM|WCM|HGM)\s+(.+)$/), ti = '';
        if (mTi) { ti = mTi[1]; nombre = mTi[2]; }
        var j = { bo: bo || String(jug.length + 1), name: nombre, ti: ti, celdas: {}, sum: [] };
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
      var buf = await traer(pgnUrls[pi], true, 'Las partidas (PGN)');
      if (!buf) continue;
      var texto;
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { texto = new TextDecoder('windows-1252').decode(buf); }
      var lista = texto.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split(/\n(?=\[Event )/).map(function (s) { return s.trim(); }).filter(function (s) { return /^\[Event /.test(s); });
      pgn[pgnUrls[pi].split('/').pop().toLowerCase()] = lista.map(function (s) {
        var h = function (k) { var m = s.match(new RegExp('\\[' + k + ' "([^"]*)"\\]')); return m ? m[1] : ''; };
        return { txt: s, ev: h('Event'), r: parseInt(h('Round'), 10) || 0, w: h('White').replace(/\s+[A-Z]{3}$/, ''), b: h('Black').replace(/\s+[A-Z]{3}$/, ''), res: h('Result'), usada: false };
      });
    }
    barra(total, total, 'Armando el archivo…');

    // ───────── 6) Armar el torneo ─────────
    var f = fechas(ficha['Date']), L = lugarES(ficha['City']);
    var nombreTorneo = mOrd[1] + '.ª Olimpíada de Ajedrez · ' + L.ciudad + ' ' + Y;
    var ID = 'tz_ob' + Y;
    // Nombre de cada equipo: el del cruce. Países que ya no existen con ese nombre: aclarado y sin
    // bandera (nunca la de hoy). La app traduce el resto al mostrarlo (_paisES).
    var nombreEq = {};
    Object.keys(rondas).forEach(function (k) { rondas[k].forEach(function (m) { nombreEq[m.a] = m.aName; nombreEq[m.b] = m.bName; }); });
    etapas.forEach(function (x) {
      var iC = x.cab.indexOf('code'), iT = x.cab.indexOf('team');
      x.filas.forEach(function (fl) { if (fl[iC] && !nombreEq[fl[iC]] && fl[iT]) nombreEq[fl[iC]] = fl[iT]; });
    });
    function nombreDe(c) {
      var n = nombreEq[c] || c;
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
      if (c === 'CSR') return 'TCH';   // Checoslovaquia (la app la conoce como TCH; su bandera = la de Chequia)
      if (c === 'ROM') return 'ROU';   // Rumania: OlimpBase usa el código viejo
      return c;
    }

    var informe = { anio: Y, fuente: BASE + Y + 'in.html', mesas: 0, conPartida: 0, wo: 0, sinPartida: [], partidasPGN: 0, sueltas: [],
      resultados: [], nombres: [], sinJugar: [], corregidos: [], equipos: [] };
    Object.keys(pgn).forEach(function (k) { informe.partidasPGN += pgn[k].length; });
    // Evento del PGN → etapa (lo enseñan las partidas con número; si hay una sola etapa, todo es de esa).
    var evEtapa = {}, votos = {};
    function jugadoresEn(code, clave) {
      return (equipos[code] ? equipos[code].jugadores : []).filter(function (j) { return j.celdas[clave] && j.celdas[clave].v; })
        .sort(function (a, b) { return tablero(a.bo) - tablero(b.bo); });
    }
    // El jugador de la planilla que se sentó en esa mesa: por apellido; si hay dos (hermanos), el que
    // jugó contra ese rival; si no, el del mismo orden de tablero.
    function elegir(code, clave, apell, rival, idx) {
      var js = jugadoresEn(code, clave);
      var mismos = js.filter(function (j) { return apellido(j.name) === apellido(apell); });
      if (mismos.length > 1) { var x = mismos.filter(function (j) { return apellido(j.celdas[clave].opp) === apellido(rival); }); if (x.length === 1) return { j: x[0], seguro: true }; }
      if (mismos.length === 1) return { j: mismos[0], seguro: true };
      var parec = js.filter(function (j) { return parecido(j.name, apell) >= 4; });
      if (parec.length === 1) return { j: parec[0], seguro: true };
      return { j: js[idx] || null, seguro: false };
    }

    var cfgCats = [], cr = {}, partidasPorCat = [];
    etapas.forEach(function (E, catIdx) {
      var etiqueta = etapaES(E.ob, etapas.length === 1);
      var iCode = E.cab.indexOf('code'), iPts = E.cab.indexOf('pts'), iMP = E.cab.indexOf('MP'), iRk = E.cab.indexOf('no.');
      var colsGrid = E.cab.map(function (h, i) { return /^\d+$/.test(h) ? i : -1; }).filter(function (i) { return i >= 0; });
      var jugaron = {};
      for (var r = 1; r <= E.nR; r++) (rondas[E.st + r] || []).forEach(function (m) { jugaron[m.a] = 1; jugaron[m.b] = 1; });
      var orden = [], rkAnt = 0;
      var teams = E.filas.filter(function (fl) { return fl[iCode] && jugaron[fl[iCode]]; }).map(function (fl) {
        var rk = parseInt(fl[iRk], 10) || rkAnt; rkAnt = rk; orden.push(fl[iCode]);
        return { rk: rk, name: nombreDe(fl[iCode]), fed: fedDe(fl[iCode]), grid: colsGrid.map(function (i) { return fl[i] === '●' ? '*' : fl[i]; }), des: [fl[iPts], fl[iMP]] };
      });
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
            var A = elegir(m.a, clave, b.l, b.r, bi), B = elegir(m.b, clave, b.r, b.l, bi);
            if (!A.j || !B.j) { informe.nombres.push(etiqueta + ' R' + r + ' ' + m.a + '-' + m.b + ' mesa ' + (bi + 1) + ': no encontré a ' + (!A.j ? b.l : b.r) + ' en la planilla'); return; }
            if (!A.seguro) informe.nombres.push(etiqueta + ' R' + r + ' mesa ' + (bi + 1) + ': "' + b.l + '" → ' + A.j.name + ' (por orden de tablero)');
            if (!B.seguro) informe.nombres.push(etiqueta + ' R' + r + ' mesa ' + (bi + 1) + ': "' + b.r + '" → ' + B.j.name + ' (por orden de tablero)');
            // El mismo jugador en dos mesas del match = error de la página de la ronda (1928 R13 Bélgica–Suecia:
            // repite "Koltanowski–Karlin" y falta Jonsson–Censer). La PLANILLA sabe quién jugó esa ronda: si
            // queda UNO solo sin sentar, es él (y su partida está en el PGN). Si no, se avisa.
            [[A, m.a], [B, m.b]].forEach(function (par) {
              var X = par[0], nm = X.j.name;
              if (sentados[nm]) {
                var libres = jugadoresEn(par[1], clave).filter(function (j) { return !sentados[j.name]; });
                if (libres.length === 1) {
                  informe.corregidos.push(etiqueta + ' R' + r + ' ' + nombreDe(m.a) + '–' + nombreDe(m.b) + ' mesa ' + (bi + 1) + ': la página repite a ' + nm + '; según la planilla jugó ' + libres[0].name);
                  X.j = libres[0];
                } else informe.nombres.push(etiqueta + ' R' + r + ' ' + nombreDe(m.a) + '–' + nombreDe(m.b) + ': ' + nm + ' figura en dos mesas (error de OlimpBase)');
              }
              sentados[X.j.name] = 1;
            });
            var mesa = { tW: A.j.ti || '', nW: A.j.name, eW: 0, tB: B.j.ti || '', nB: B.j.name, eB: 0, res: b.res };
            boards.push(mesa);
            informe.mesas++;
            if (/^(\+--|--\+|---)$/.test(b.res)) {
              // Incomparecencia: no hay partida. Si el PGN trae un renglón para esa mesa (1937: Stoltz–Reid
              // figura 0-1 sin jugadas), se lo marca como visto para que no aparezca "suelto" en el informe.
              informe.wo++;
              Object.keys(pgn).forEach(function (fk) { pgn[fk].forEach(function (x) {
                if (!x.usada && x.r === r && Math.max(Math.min(parecido(x.w, A.j.name), parecido(x.b, B.j.name)), Math.min(parecido(x.w, B.j.name), parecido(x.b, A.j.name))) >= 4) x.usada = true;
              }); });
              return;
            }
            // La partida: primero por su número en el PGN; se comprueba que sea de esa ronda y de esos dos.
            var g = null;
            if (b.ref && pgn[b.ref.f]) {
              var cand = pgn[b.ref.f][b.ref.n - 1];
              if (cand && !cand.usada && (!cand.r || cand.r === r) && Math.max(parecido(cand.w, A.j.name) + parecido(cand.b, B.j.name), parecido(cand.w, B.j.name) + parecido(cand.b, A.j.name)) >= 8) g = cand;
            }
            if (!g) {
              var mejor = null, ms = -1;
              Object.keys(pgn).forEach(function (fk) {
                pgn[fk].forEach(function (x) {
                  if (x.usada || x.r !== r) return;
                  if (x.ev && evEtapa[x.ev] && evEtapa[x.ev] !== E.st) return;
                  var s = Math.max(Math.min(parecido(x.w, A.j.name), parecido(x.b, B.j.name)), Math.min(parecido(x.w, B.j.name), parecido(x.b, A.j.name)));
                  if (s > ms) { ms = s; mejor = x; }
                });
              });
              if (mejor && ms >= 4) g = mejor;
            }
            if (!g) { informe.sinPartida.push(etiqueta + ' R' + r + ': ' + A.j.name + ' – ' + B.j.name + ' (' + b.res + ')'); return; }
            g.usada = true;
            if (g.ev) { votos[g.ev] = votos[g.ev] || {}; votos[g.ev][E.st] = (votos[g.ev][E.st] || 0) + 1; if (!evEtapa[g.ev] && votos[g.ev][E.st] >= 3) evEtapa[g.ev] = E.st; }
            informe.conPartida++;
            var blancasA = parecido(g.w, A.j.name) + parecido(g.b, B.j.name) >= parecido(g.w, B.j.name) + parecido(g.b, A.j.name);
            var inv = function (x) { return x === '1-0' ? '0-1' : x === '0-1' ? '1-0' : x; };
            var resA = (blancasA ? g.res : inv(g.res)).replace('1/2-1/2', '½-½');
            if (resA !== b.res) informe.resultados.push(etiqueta + ' R' + r + ': ' + A.j.name + ' – ' + B.j.name + ' (la tabla dice ' + b.res + ', el PGN ' + resA + ')');
            var W = blancasA ? A.j.name : B.j.name, N = blancasA ? B.j.name : A.j.name;
            var WT = blancasA ? nombreDe(m.a) : nombreDe(m.b), BT = blancasA ? nombreDe(m.b) : nombreDe(m.a);
            var limpio = g.txt.replace(/\[White "[^"]*"\]/, '[White "' + W + '"]')
              .replace(/\[Black "[^"]*"\]/, '[Black "' + N + '"]\n[WhiteTeam "' + WT + '"]\n[BlackTeam "' + BT + '"]')
              .replace(/\[Event "[^"]*"\]/, '[Event "' + nombreTorneo + ' · ' + etiqueta + '"]')
              .replace(/\[Site "[^"]*"\]/, '[Site "' + L.lugar + '"]');
            partidas.push({ r: r, mi: mi, bi: bi, pgn: limpio });
          });
          if (!m.boards.length) informe.sinJugar.push(etiqueta + ' R' + r + ': ' + nombreDe(m.a) + ' ' + m.score + ' ' + nombreDe(m.b));
          teamRounds[r].push(Object.assign({ aNo: noDe(m.a), aName: nombreDe(m.a), bNo: noDe(m.b), bName: nombreDe(m.b), score: sc[0] + ' : ' + sc[1], boards: boards },
            m.boards.length ? {} : { nota: 'No se jugó: el match se dio ' + sc[0] + '-' + sc[1] + ', sin partidas.' }));
        });
      }
      // Planteles: los inscriptos del equipo con lo que hicieron EN ESTA etapa.
      var teamRoster = orden.map(function (code, i) {
        return { no: i + 1, name: nombreDe(code), capt: '', eloAvg: '', players: (equipos[code] ? equipos[code].jugadores : []).map(function (j) {
          var pts = 0, gm = 0;
          Object.keys(j.celdas).forEach(function (k) { if (k.indexOf(E.st) === 0 && /^\d+$/.test(k.slice(E.st.length)) && j.celdas[k].v) { gm++; pts += puntos(j.celdas[k].v); } });
          return { bo: tablero(j.bo), ti: j.ti || '', nm: j.name, elo: 0, fed: fedDe(code), fid: '', pts: String(pts), gm: String(gm), rp: '' };
        }) };
      });
      cr['cr2_tz_' + ID + '_c' + catIdx] = { teamRounds: teamRounds, teamCrosses: teamCrosses, teamStandings: { kind: 'rr', teams: teams }, teamRoster: teamRoster };
      cfgCats.push(Object.assign({ name: etiqueta, broadcast: null, crurl: null },
        E.st[0] === 'e' ? { sinPodio: true } : {}, (etapas.length > 1 && E.st === 'fa') ? { inicial: true } : {}));
      partidas.sort(function (x, y) { return x.r - y.r || x.mi - y.mi || x.bi - y.bi; });
      partidasPorCat.push({ ev: nombreTorneo + ' · ' + etiqueta, lista: partidas.map(function (x) { return x.pgn; }) });
    });
    Object.keys(pgn).forEach(function (fk) { pgn[fk].forEach(function (x) { if (!x.usada) informe.sueltas.push('R' + x.r + ': ' + x.w + ' – ' + x.b + ' (' + x.res + ')'); }); });
    Object.keys(nombreEq).sort().forEach(function (c) { informe.equipos.push({ code: c, name: nombreDe(c), fed: fedDe(c), es: nombreDe(c) !== (nombreEq[c] || c) }); });
    ['sinPartida', 'sueltas', 'resultados', 'nombres', 'sinJugar', 'corregidos'].forEach(function (k) { informe['n_' + k] = informe[k].length; informe[k] = informe[k].slice(0, 60); });

    var director = limpiarPersona(ficha['Tournament Director']) || limpiarPersona(ficha['Chief Arbiter']);
    var cfg = {
      name: nombreTorneo, type: 'Internacional', location: L.lugar,
      venue: (ficha['Venue'] && !/^n\/?a$/i.test(ficha['Venue'])) ? ficha['Venue'] : '',
      organizer: 'FIDE', director: director,
      dates: f ? f.txt : (ficha['Date'] || ''), startDate: f ? f.ini : '', endDate: f ? f.fin : '',
      status: 'done', finished: true, format: 'rr', pace: 'standard', isTeam: true, categories: cfgCats,
      weburl: BASE + Y + 'in.html',
      coleccion: 'olimpiadas', coleccionSolo: true,
      about: 'Datos: OlimpBase (olimpbase.org), de Wojciech Bartelski.'
    };
    var partidasObj = {};
    partidasPorCat.forEach(function (x) { if (x.lista.length) partidasObj[x.ev] = x.lista; });
    var paquete = { tipo: 'chessargentino-torneo-historico', v: 1, creado: new Date().toISOString().slice(0, 10), lector: 1,
      id: ID, cfg: cfg, cr: cr, partidas: partidasObj, informe: informe };
    window.__aaOlimpPaquete = paquete;

    // ───────── 7) Bajar el archivo ─────────
    var nombreArchivo = 'Olimpiada ' + Y + ' - ' + L.ciudad + '.json';
    var blob = new Blob([JSON.stringify(paquete)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombreArchivo;
    document.body.appendChild(a);
    if (!window.__aaOlimpSinBajar) a.click();   // (para probar sin descargar)
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    var avisos = informe.n_sinPartida + informe.n_resultados + informe.n_nombres;
    mostrar('¡Listo! ' + nombreTorneo,
      'Se bajó <b>' + esc(nombreArchivo) + '</b> (' + Math.round(blob.size / 1024) + ' KB).<br>'
      + informe.conPartida + ' de ' + (informe.mesas - informe.wo) + ' mesas con su partida'
      + (informe.wo ? ' (y ' + informe.wo + ' por incomparecencia)' : '')
      + (avisos ? ' · <span style="color:#ffd27a">⚠️ ' + avisos + ' cosas para revisar</span>' : ' · ✅ todo cerró') + '.<br>'
      + '<span style="opacity:.85">Ahora, en la app: 🏛️ Torneos históricos → 📥 Importar torneo histórico → elegí ese archivo.</span>', true);
  } catch (e) {
    fallar(e && e.message ? e.message : String(e));
  }
})();
