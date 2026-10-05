// ─────────────────────────────────────────────────────────────────────────────────────────────
// TRADUCTOR chess.js 1.4.0 → API de chess.js 0.10.3
//
// La app se escribió con chess.js 0.10.3 (load_pgn, in_check, move() que devuelve null…).
// La 1.4.0 es 4 a 10 veces más rápida pero cambia nombres y comportamientos. Este archivo
// envuelve la nueva y le pone EXACTAMENTE la cara de la vieja, para no tocar los ~200 lugares
// del index.html que la usan. Se arma con `node herramientas/chess-compat/armar.cjs`, que pega
// la librería nueva + este traductor en assets/chess.min.js.
//
// Diferencias de la 1.4.0 que se tapan acá (todas comprobadas contra la 0.10.3):
//  · move() / load_pgn() / new Chess(fenMalo) TIRAN error → acá devuelven null / false / tablero vacío.
//  · Sin {sloppy:true} la vieja es ESTRICTA; la nueva por defecto es permisiva.
//  · fen(): la nueva sólo escribe la casilla de "al paso" si la captura es posible; la vieja la
//    escribe siempre tras un avance doble. Las claves por FEN (libro, cachés) dependen de eso.
//  · get() de una casilla vacía: la nueva da undefined; la vieja null.
//  · header(): la nueva devuelve la plantilla con '?' y nulls; la vieja sólo lo que se cargó.
//  · moves({square}): la nueva pierde la desambiguación ("Nd2" en vez de "Nbd2").
//  · La nueva acepta "--" (jugada nula) y "0-0"; la vieja no.
//  · put()/remove(): la nueva recalcula los enroques; la vieja no los toca.
//  · Orden de las coronaciones (lo arregla armar.cjs en la fuente: dama, torre, alfil, caballo).
// ─────────────────────────────────────────────────────────────────────────────────────────────
/* global __ChessNueva */
var Chess = (function (N) {
  var BIG_PAWN = 4, CAPTURE = 2, EP_CAPTURE = 8, KSIDE = 32, QSIDE = 64;
  var FLAG_ORDEN = [[1, 'n'], [2, 'c'], [4, 'b'], [8, 'e'], [16, 'p'], [32, 'k'], [64, 'q']];
  var DEFAULT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var VACIO = '8/8/8/8/8/8/8/8 w - - 0 1';
  var RESULTADOS = ['1-0', '0-1', '1/2-1/2', '*'];
  var SQ = {}, SQUARES = [];
  for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
    var nombre = 'abcdefgh'.charAt(f) + '87654321'.charAt(r);
    SQ[nombre] = r * 16 + f; SQUARES.push(nombre);
  }
  function alg(i) { return 'abcdefgh'.charAt(i & 15) + '87654321'.charAt(i >> 4); }
  function stripped(s) { return s.replace(/=/, '').replace(/[+#]?[?!]*$/, ''); }
  function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }

  // La vieja deja SIEMPRE la casilla de al paso después de un avance doble (la nueva sólo si
  // hay un peón rival al lado). Con esto fen() y la cuenta de repeticiones quedan como antes.
  class Motor extends N.Chess {
    _makeMove(m) {
      super._makeMove(m);
      if ((m.flags & BIG_PAWN) && this._epSquare === -1) this._epSquare = m.color === 'b' ? m.to - 16 : m.to + 16;
    }
    // La nueva lleva una "huella" de cada posición (Zobrist, con BigInt: lento) sólo para contar
    // repeticiones. El traductor las cuenta como la vieja (comparando FEN), así que se apaga.
    _computeHash() { return 0n; }
    _pieceKey() { return 0n; }
    _epKey() { return 0n; }
    _castlingKey() { return 0n; }
    _set(sq, p) { this._board[sq] = p; }
    _clear(sq) { delete this._board[sq]; }
    _movePiece(de, a) { this._board[a] = this._board[de]; delete this._board[de]; }
    _incPositionCount() {}
    _decPositionCount() {}
    _updateSetup() {} // los headers los lleva el traductor (H)
    // Con un peón en la primera/última fila (sólo en un FEN armado a mano) la nueva genera una
    // jugada fuera del tablero y revienta a mitad de camino, dejando el tablero roto. La vieja
    // daba basura ("a" como jugada). Acá se descartan esas jugadas.
    _moves(o) {
      var b = this._board, borde = false;
      for (var i = 0; i < 8; i++) {
        if ((b[i] && b[i].type === 'p') || (b[112 + i] && b[112 + i].type === 'p')) { borde = true; break; }
      }
      if (!borde) return super._moves(o);
      o = o || {};
      var pseudo = super._moves({ legal: false, piece: o.piece, square: o.square })
        .filter(function (m) { return m.to >= 0 && !(m.to & 0x88); });
      var us = this._turn;
      if (o.legal === false || this._kings[us] === -1) return pseudo;
      var out = [];
      for (var k = 0; k < pseudo.length; k++) {
        this._makeMove(pseudo[k]);
        if (!this._isKingAttacked(us)) out.push(pseudo[k]);
        this._undoMove();
      }
      return out;
    }
  }

  // validate_fen de la 0.10.3, tal cual (la nueva es más estricta: exige reyes, etc.).
  function validarFen(fen) {
    var t = fen.split(/\s+/);
    if (t.length !== 6) return { valid: false, error_number: 1, error: 'FEN string must contain six space-delimited fields.' };
    if (isNaN(t[5]) || parseInt(t[5], 10) <= 0) return { valid: false, error_number: 2, error: '6th field (move number) must be a positive integer.' };
    if (isNaN(t[4]) || parseInt(t[4], 10) < 0) return { valid: false, error_number: 3, error: '5th field (half move counter) must be a non-negative integer.' };
    if (!/^(-|[abcdefgh][36])$/.test(t[3])) return { valid: false, error_number: 4, error: '4th field (en-passant square) is invalid.' };
    if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(t[2])) return { valid: false, error_number: 5, error: '3rd field (castling availability) is invalid.' };
    if (!/^(w|b)$/.test(t[1])) return { valid: false, error_number: 6, error: '2nd field (side to move) is invalid.' };
    var filas = t[0].split('/');
    if (filas.length !== 8) return { valid: false, error_number: 7, error: "1st field (piece positions) does not contain 8 '/'-delimited rows." };
    for (var i = 0; i < filas.length; i++) {
      var suma = 0, prevNum = false;
      for (var k = 0; k < filas[i].length; k++) {
        if (isNaN(filas[i][k])) {
          if (!/^[prnbqkPRNBQK]$/.test(filas[i][k])) return { valid: false, error_number: 9, error: '1st field (piece positions) is invalid [invalid piece].' };
          suma += 1; prevNum = false;
        } else {
          if (prevNum) return { valid: false, error_number: 8, error: '1st field (piece positions) is invalid [consecutive numbers].' };
          suma += parseInt(filas[i][k], 10); prevNum = true;
        }
      }
      if (suma !== 8) return { valid: false, error_number: 10, error: '1st field (piece positions) is invalid [row too large].' };
    }
    if ((t[3][1] == '3' && t[1] == 'w') || (t[3][1] == '6' && t[1] == 'b')) return { valid: false, error_number: 11, error: 'Illegal en-passant square' };
    return { valid: true, error_number: 0, error: 'No errors.' };
  }

  function flagStr(bits) {
    var s = '';
    for (var i = 0; i < FLAG_ORDEN.length; i++) if (bits & FLAG_ORDEN[i][0]) s += FLAG_ORDEN[i][1];
    return s;
  }

  function desambiguar(m, lista) {
    var amb = 0, mismaFila = 0, mismaCol = 0;
    for (var i = 0; i < lista.length; i++) {
      var o = lista[i];
      if (o.piece === m.piece && o.from !== m.from && o.to === m.to) {
        amb++;
        if ((o.from >> 4) === (m.from >> 4)) mismaFila++;
        if ((o.from & 15) === (m.from & 15)) mismaCol++;
      }
    }
    if (!amb) return '';
    if (mismaFila > 0 && mismaCol > 0) return alg(m.from);
    return mismaCol > 0 ? alg(m.from).charAt(1) : alg(m.from).charAt(0);
  }

  // SAN sin el '=' ni el jaque final: lo mismo que stripped(SAN) pero sin jugar la jugada.
  function sanPelado(m, lista) {
    if (m.flags & KSIDE) return 'O-O';
    if (m.flags & QSIDE) return 'O-O-O';
    var o = '';
    if (m.piece !== 'p') o += m.piece.toUpperCase() + desambiguar(m, lista);
    if (m.flags & (CAPTURE | EP_CAPTURE)) { if (m.piece === 'p') o += alg(m.from).charAt(0); o += 'x'; }
    o += alg(m.to);
    if (m.promotion) o += m.promotion.toUpperCase();
    return o;
  }

  function Chess(fenInicial) {
    var c, H = {};

    function fen() { return c.fen({ forceEnpassantSquare: true }); }
    function setup(f) { // update_setup de la vieja
      if (c._history.length > 0) return;
      if (f !== DEFAULT) { H.SetUp = '1'; H.FEN = f; } else { delete H.SetUp; delete H.FEN; }
    }
    function cargar(f, mantenerHeaders) {
      if (!validarFen(f).valid) return false;
      if (!mantenerHeaders) H = {};
      c.load(f, { skipValidation: true });
      setup(fen());
      return true;
    }
    function limpiar() { c.clear(); H = {}; setup(fen()); }
    function setHeader(args) {
      for (var i = 0; i < args.length; i += 2) {
        if (typeof args[i] === 'string' && typeof args[i + 1] === 'string') H[args[i]] = args[i + 1];
      }
      return H;
    }
    function legales() { return c._moves({ legal: true }); }
    function san(m, lista) { return c._moveToSan(m, lista); }
    function listaPara(m) { // para la desambiguación alcanza con las de la misma pieza
      return (m.piece === 'p' || m.piece === 'k') ? [] : c._moves({ legal: true, piece: m.piece });
    }
    function bonita(m, lista) {
      var o = { color: m.color, from: alg(m.from), to: alg(m.to), flags: flagStr(m.flags), piece: m.piece };
      if (m.promotion) o.promotion = m.promotion;
      if (m.captured) o.captured = m.captured;
      o.san = san(m, lista);
      return o;
    }
    function getPieza(sq) {
      var p = c._board[SQ[sq]];
      return p ? { type: p.type, color: p.color } : null;
    }
    function jugar(m) { c._makeMove(m); c._incPositionCount(); }

    // move_from_san de la 0.10.3 (estricta salvo con sloppy), sin generar el SAN entero de cada jugada.
    function desdeSan(texto, sloppy) {
      var limpio = stripped(texto), pieza, de, a, cor, mt = null, ini = limpio.charAt(0);
      // Primero la lectura estricta, sólo entre las jugadas de la pieza que nombra el SAN (un SAN
      // empieza con NBRQK, O del enroque o la columna del peón): mucho menos trabajo que todas.
      var tipo = ini === 'O' ? 'k' : (ini >= 'a' && ini <= 'h') ? 'p' : (ini && 'NBRQK'.indexOf(ini) > -1) ? ini.toLowerCase() : null;
      if (tipo) {
        var lt = c._moves({ legal: true, piece: tipo });
        for (var t = 0; t < lt.length; t++) if (limpio === sanPelado(lt[t], lt)) return { m: lt[t], lista: lt };
      }
      if (!sloppy) return null;
      // Con sloppy, el resto de la 0.10.3 tal cual: desambiguación "floja" y jugadas tipo e2e4.
      mt = limpio.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/);
      if (mt) { pieza = mt[1]; de = mt[2]; a = mt[3]; cor = mt[4]; }
      var lista = legales(), pseudo = null;
      for (var i = 0; i < lista.length; i++) {
        var m = lista[i];
        var primera = (m.flags & (KSIDE | QSIDE)) ? 'O' : m.piece === 'p' ? null : m.piece.toUpperCase();
        if ((primera === null || primera === ini) && limpio === sanPelado(m, lista)) return { m: m, lista: lista };
        if (!pseudo) pseudo = c._moves({ legal: false });
        if ((primera === null || primera === ini) && limpio === sanPelado(m, pseudo)) return { m: m, lista: lista };
        if (mt && (!pieza || pieza.toLowerCase() == m.piece) && SQ[de] == m.from && SQ[a] == m.to &&
            (!cor || cor.toLowerCase() == m.promotion)) return { m: m, lista: lista };
      }
      return null;
    }

    function triple() { // in_threefold_repetition de la vieja: compara los FEN de toda la partida
      var jugadas = [], vistas = {}, rep = false;
      for (;;) { var u = c._undoMove(); if (!u) break; jugadas.push(u); }
      for (;;) {
        var k = fen().split(' ').slice(0, 4).join(' ');
        vistas[k] = (k in vistas) ? vistas[k] + 1 : 1;
        if (vistas[k] >= 3) rep = true;
        if (!jugadas.length) break;
        c._makeMove(jugadas.pop());
      }
      return rep;
    }

    function parseHeaders(texto, opciones) {
      var nl = (typeof opciones === 'object' && typeof opciones.newline_char === 'string') ? opciones.newline_char : '\r?\n';
      var out = {}, lineas = texto.split(new RegExp(nl.replace(/\\/g, '\\')));
      for (var i = 0; i < lineas.length; i++) {
        var key = lineas[i].replace(/^\[([A-Z][A-Za-z]*)\s.*\]$/, '$1');
        var val = lineas[i].replace(/^\[[A-Za-z]+\s"(.*)"\]$/, '$1');
        if (trim(key).length > 0) out[key] = val;
      }
      return out;
    }

    if (fenInicial === undefined) {
      c = new Motor(DEFAULT); setup(fen());
    } else if (validarFen(fenInicial).valid) {
      c = new Motor(fenInicial, { skipValidation: true }); setup(fen());
    } else {
      c = new Motor(VACIO, { skipValidation: true }); // la vieja quedaba con el tablero vacío y sin headers
    }

    return {
      WHITE: 'w', BLACK: 'b', PAWN: 'p', KNIGHT: 'n', BISHOP: 'b', ROOK: 'r', QUEEN: 'q', KING: 'k',
      SQUARES: SQUARES.slice(),
      FLAGS: { NORMAL: 'n', CAPTURE: 'c', BIG_PAWN: 'b', EP_CAPTURE: 'e', PROMOTION: 'p', KSIDE_CASTLE: 'k', QSIDE_CASTLE: 'q' },
      load: function (f) { return cargar(f); },
      reset: function () { cargar(DEFAULT); },
      moves: function (op) {
        var legal = op === undefined || !('legal' in op) || op.legal;
        var lista;
        if (op !== undefined && 'square' in op) {
          if (!(op.square in SQ)) return [];
          lista = c._moves({ legal: legal, square: op.square });
        } else {
          lista = c._moves({ legal: legal });
        }
        var verbose = op !== undefined && 'verbose' in op && op.verbose;
        var todas = (legal && !(op && 'square' in op)) ? lista : null;
        var out = [];
        for (var i = 0; i < lista.length; i++) {
          if (!todas) todas = legales();
          out.push(verbose ? bonita(lista[i], todas) : san(lista[i], todas));
        }
        return out;
      },
      in_check: function () { return c.isCheck(); },
      in_checkmate: function () { return c.isCheckmate(); },
      in_stalemate: function () { return c.isStalemate(); },
      in_draw: function () { return c._halfMoves >= 100 || c.isStalemate() || c.isInsufficientMaterial() || triple(); },
      insufficient_material: function () { return c.isInsufficientMaterial(); },
      in_threefold_repetition: function () { return triple(); },
      game_over: function () {
        return c._halfMoves >= 100 || c.isCheckmate() || c.isStalemate() || c.isInsufficientMaterial() || triple();
      },
      validate_fen: function (f) { return validarFen(f); },
      fen: fen,
      board: function () {
        var out = [], fila = [];
        for (var i = 0; i <= 119; i++) {
          if (i & 0x88) { i += 7; continue; }
          var p = c._board[i];
          fila.push(p ? { type: p.type, color: p.color } : null);
          if ((i + 1) & 0x88) { out.push(fila); fila = []; }
        }
        return out;
      },
      pgn: function (op) {
        var nl = (typeof op === 'object' && typeof op.newline_char === 'string') ? op.newline_char : '\n';
        var ancho = (typeof op === 'object' && typeof op.max_width === 'number') ? op.max_width : 0;
        var res = [], hay = false, i;
        for (i in H) { res.push('[' + i + ' "' + H[i] + '"]' + nl); hay = true; }
        if (hay && c._history.length) res.push(nl);
        var rev = [];
        while (c._history.length > 0) rev.push(c._undoMove());
        var jug = [], s = '';
        while (rev.length > 0) {
          var m = rev.pop();
          if (!c._history.length && m.color === 'b') s = c._moveNumber + '. ...';
          else if (m.color === 'w') { if (s.length) jug.push(s); s = c._moveNumber + '.'; }
          s = s + ' ' + san(m, listaPara(m));
          c._makeMove(m);
        }
        if (s.length) jug.push(s);
        if (H.Result !== undefined) jug.push(H.Result);
        if (ancho === 0) return res.join('') + jug.join(' ');
        var w = 0;
        for (i = 0; i < jug.length; i++) {
          if (w + jug[i].length > ancho && i !== 0) {
            if (res[res.length - 1] === ' ') res.pop();
            res.push(nl); w = 0;
          } else if (i !== 0) { res.push(' '); w++; }
          res.push(jug[i]); w += jug[i].length;
        }
        return res.join('');
      },
      load_pgn: function (pgn, op) {
        var sloppy = op !== undefined && 'sloppy' in op && op.sloppy;
        function mask(s) { return s.replace(/\\/g, '\\'); }
        var nl = (typeof op === 'object' && typeof op.newline_char === 'string') ? op.newline_char : '\r?\n';
        var reH = new RegExp('^(\\[((?:' + mask(nl) + ')|.)*\\])(?:' + mask(nl) + '){2}');
        var hTxt = reH.test(pgn) ? reH.exec(pgn)[1] : '';
        cargar(DEFAULT);
        var hs = parseHeaders(hTxt, op);
        for (var k in hs) setHeader([k, hs[k]]);
        if (hs.SetUp === '1') { if (!('FEN' in hs && cargar(hs.FEN, true))) return false; }
        var ms = pgn.replace(hTxt, '').replace(new RegExp(mask(nl), 'g'), ' ');
        ms = ms.replace(/(\{[^}]+\})+?/g, '');
        for (var rav = /(\([^\(\)]+\))+?/g; rav.test(ms);) ms = ms.replace(rav, '');
        ms = ms.replace(/\d+\.(\.\.)?/g, '').replace(/\.\.\./g, '').replace(/\$\d+/g, '');
        var toks = trim(ms).split(new RegExp(/\s+/));
        toks = toks.join(',').replace(/,,+/g, ',').split(',');
        var j;
        for (var i = 0; i < toks.length - 1; i++) {
          j = desdeSan(toks[i], sloppy);
          if (!j) return false;
          jugar(j.m);
        }
        var ult = toks[toks.length - 1];
        if (RESULTADOS.indexOf(ult) > -1) {
          var hayH = false; for (var x in H) { hayH = true; break; }
          if (hayH && H.Result === undefined) setHeader(['Result', ult]);
        } else {
          j = desdeSan(ult, sloppy);
          if (!j) return false;
          jugar(j.m);
        }
        return true;
      },
      header: function () { return setHeader(arguments); },
      ascii: function () {
        var s = '   +------------------------+\n';
        for (var i = 0; i <= 119; i++) {
          if ((i & 15) === 0) s += ' ' + '87654321'[i >> 4] + ' |';
          var p = c._board[i];
          s += p ? ' ' + (p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase()) + ' ' : ' . ';
          if ((i + 1) & 0x88) { s += '|\n'; i += 8; }
        }
        return s + '   +------------------------+\n' + '     a  b  c  d  e  f  g  h\n';
      },
      turn: function () { return c._turn; },
      move: function (mv, op) {
        var sloppy = op !== undefined && 'sloppy' in op && op.sloppy, m = null, lista = null;
        if (typeof mv === 'string') {
          var j = desdeSan(mv, sloppy);
          if (j) { m = j.m; lista = j.lista; }
        } else if (typeof mv === 'object') {
          lista = (mv.from in SQ) ? c._moves({ legal: true, square: mv.from }) : [];
          for (var i = 0; i < lista.length; i++) {
            if (mv.from === alg(lista[i].from) && mv.to === alg(lista[i].to) &&
                (!('promotion' in lista[i]) || mv.promotion === lista[i].promotion)) { m = lista[i]; break; }
          }
        }
        if (!m) return null;
        var o = bonita(m, typeof mv === 'object' ? listaPara(m) : lista);
        jugar(m);
        return o;
      },
      undo: function () {
        var h = c._hash, m = c._undoMove();
        if (!m) return null;
        c._decPositionCount(h);
        return bonita(m, listaPara(m));
      },
      clear: function () { return limpiar(); },
      put: function (p, sq) {
        if (!('type' in p) || !('color' in p)) return false;
        if ('pnbrqkPNBRQK'.indexOf(p.type.toLowerCase()) === -1) return false;
        if (!(sq in SQ)) return false;
        if (!c._put({ type: p.type, color: p.color }, sq)) return false;
        setup(fen());
        return true;
      },
      get: getPieza,
      remove: function (sq) {
        var p = getPieza(sq);
        if (sq in SQ && c._board[SQ[sq]]) c._clear(SQ[sq]);
        if (p && p.type === 'k') c._kings[p.color] = -1;
        setup(fen());
        return p;
      },
      perft: function (d) { return c.perft(d); },
      square_color: function (sq) {
        if (sq in SQ) { var i = SQ[sq]; return ((i >> 4) + (i & 15)) % 2 === 0 ? 'light' : 'dark'; }
        return null;
      },
      history: function (op) {
        var verbose = op !== undefined && 'verbose' in op && op.verbose;
        var rev = [], out = [];
        while (c._history.length > 0) rev.push(c._undoMove());
        while (rev.length > 0) {
          var m = rev.pop(), lista = listaPara(m);
          out.push(verbose ? bonita(m, lista) : san(m, lista));
          c._makeMove(m);
        }
        return out;
      }
    };
  }
  return Chess;
})(__ChessNueva);
