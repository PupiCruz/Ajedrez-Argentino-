// 🎬 "Un día como hoy" en VIDEO vertical (1080×1920, MP4) para Instagram / Reels / TikTok.
// Dibuja cada cuadro con el tablero y las piezas de la web, marca cada jugada con su símbolo (!! ! ?! ? ??)
// y en las brillantes (!!) y los errores graves frena con un efecto. El video arma sólo en esta PC (usa ffmpeg).
//
// Uso (desde esta carpeta):
//   node video-hoy.mjs partida-prueba.json salida/prueba.mp4          ← el video entero
//   node video-hoy.mjs partida-prueba.json salida --fotos             ← sólo unas fotos para mirar cómo queda
//
// La partida es un .json (ver partida-prueba.json): cabecera + jugadas [san, símbolo, eval en centipeones o "#N"].
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Resvg } from '@resvg/resvg-js';
import { Chess } from 'chess.js';
import { armarAudio, cargarSonidosPupi, sonidoClic } from './audio.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(AQUI, '../../assets');
const W = 1080, H = 1920, FPS = 30;
const BX = 60, BY = 330, S = 960, C = S / 8;               // tablero
const COL = { fondo1: '#0b1220', fondo2: '#16233a', oro: '#ffc940', claro: '#dde8ef', oscuro: '#658da6', texto: '#e8eef6', gris: '#9fb3c8' };
const NAG = {
  '!!': { c: '#1fae92', t: '¡JUGADÓN!', sub: 'Jugadón' }, '!': { c: '#4f8fd6', t: '', sub: 'Muy buena' },
  '?!': { c: '#e0a82e', t: '', sub: 'Imprecisión' }, '?': { c: '#e58f2a', t: 'ERROR', sub: 'Error' },
  '??': { c: '#d64545', t: '¡COLGADA!', sub: 'Colgada' },
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const pop = (t) => { t = clamp(t, 0, 1); const s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };   // easeOutBack

// ── ffmpeg ──
function buscarFfmpeg() {
  const probar = (p) => { try { return spawnSync(p, ['-version']).status === 0; } catch (e) { return false; } };
  if (probar('ffmpeg')) return 'ffmpeg';
  const raiz = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const d of fs.readdirSync(raiz)) if (/FFmpeg/i.test(d)) {
      const sub = path.join(raiz, d);
      for (const e of fs.readdirSync(sub)) { const p = path.join(sub, e, 'bin', 'ffmpeg.exe'); if (fs.existsSync(p)) return p; }
    }
  } catch (e) { /* nada */ }
  return null;
}

// ── piezas de la web ──
const PIEZAS = {};
for (const c of ['w', 'b']) for (const t of ['K', 'Q', 'R', 'B', 'N', 'P']) {
  PIEZAS[c + t] = fs.readFileSync(path.join(ASSETS, 'piezas', c + t + '.svg'), 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
const CARAS = {};
for (const f of fs.readdirSync(path.join(AQUI, 'caras-png'))) CARAS[f.replace('.png', '')] = 'data:image/png;base64,' + fs.readFileSync(path.join(AQUI, 'caras-png', f)).toString('base64');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, 'logo.png')).toString('base64');

// ── la partida: posiciones y animaciones de cada jugada ──
const sqXY = (sq) => ({ x: BX + 'abcdefgh'.indexOf(sq[0]) * C, y: BY + (8 - +sq[1]) * C });
function prepararPartida(P) {
  const ch = new Chess();
  let id = 0;
  let piezas = [];
  for (const fila of ch.board()) for (const p of fila) if (p) piezas.push({ id: id++, c: p.color, t: p.type.toUpperCase(), sq: p.square });
  const snaps = [piezas.map((p) => ({ ...p }))];
  const anims = [null];
  P.jugadas.forEach(([san], i) => {
    let mejor = null;
    { const mb = P.pupi && P.pupi[i + 1] && /(?:Mejor era|Preferible era|Resistía un poco más con)\s+([^\s.]+)/.exec(P.pupi[i + 1].b || '');
      if (mb) { try { const mm = new Chess(ch.fen()).move(mb[1].replace(/^[TDACR]/, (x) => ({ T: 'R', D: 'Q', A: 'B', C: 'N', R: 'K' })[x])); if (mm) mejor = { from: mm.from, to: mm.to }; } catch (e) { /* no se entendió: sin flecha */ } } }
    const m = ch.move(san);
    if (!m) throw new Error('Jugada ilegal #' + (i + 1) + ': ' + san);
    const mueve = [], a = { mueve, quita: null, promo: null, from: m.from, to: m.to, mejor };
    const mover = piezas.find((p) => p.sq === m.from);
    let capSq = m.to;
    if (m.flags.includes('e')) capSq = m.to[0] + m.from[1];
    if (m.captured) { const q = piezas.find((p) => p.sq === capSq && p !== mover); if (q) a.quita = q.id; }
    mueve.push({ id: mover.id, de: m.from, a: m.to });
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const r = m.color === 'w' ? '1' : '8';
      const rook = piezas.find((p) => p.sq === (m.flags.includes('k') ? 'h' : 'a') + r && p.t === 'R' && p.c === m.color);
      mueve.push({ id: rook.id, de: rook.sq, a: (m.flags.includes('k') ? 'f' : 'd') + r });
    }
    if (m.promotion) a.promo = { id: mover.id, t: m.promotion.toUpperCase() };
    // nuevas posiciones
    const nuevas = piezas.filter((p) => p.id !== a.quita).map((p) => ({ ...p }));
    for (const mv of mueve) nuevas.find((p) => p.id === mv.id).sq = mv.a;
    if (a.promo) nuevas.find((p) => p.id === a.promo.id).t = a.promo.t;
    piezas = nuevas;
    snaps.push(piezas.map((p) => ({ ...p })));
    anims.push(a);
  });
  return { snaps, anims };
}

const esp = (san) => String(san).replace(/^[KQRBN]/, (m) => ({ K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' })[m]).replace(/=([QRBN])/, (m, x) => '=' + ({ Q: 'D', R: 'T', B: 'A', N: 'C' })[x]);
const winP = (e) => { if (typeof e === 'string') return e.startsWith('#-') ? 0 : 100; if (e == null) return 50; return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * e)) - 1); };
const evTexto = (e) => { if (typeof e === 'string') return (e.startsWith('#-') ? '-M' : '+M') + e.replace('#', '').replace('-', ''); if (e == null) return ''; const v = e / 100; return (v > 0 ? '+' : '') + v.toFixed(1); };
const evNum = (e) => (typeof e === 'string' ? (e.startsWith('#-') ? -1500 : 1500) : e == null ? 20 : e);
const fechaLarga = (f) => { const [a, m, d] = f.split('.').map(Number); return d + ' de ' + ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1] + ' de ' + a; };
const ajustar = (txt, max, ancho, factor = 0.56) => Math.min(max, Math.floor(ancho / (Math.max(1, String(txt).length) * factor)));

// ── cada cuadro ──
function estrella(cx, cy, r, rot, op, col) {
  const p = []; for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.28 : r; const an = rot + k * Math.PI / 4; p.push((cx + Math.cos(an) * rr).toFixed(1) + ',' + (cy + Math.sin(an) * rr).toFixed(1)); }
  return '<polygon points="' + p.join(' ') + '" fill="' + col + '" opacity="' + op.toFixed(2) + '"/>';
}
function insignia(cx, cy, nag, escala) {
  const n = NAG[nag]; if (!n) return '';
  const r = 30 * escala;
  return '<g><circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="' + n.c + '" stroke="#fff" stroke-width="' + (4 * escala).toFixed(1) + '"/>'
    + '<text x="' + cx + '" y="' + (cy + 13 * escala).toFixed(1) + '" text-anchor="middle" font-size="' + (38 * escala).toFixed(1) + '" font-weight="800" fill="#fff">' + esc(nag) + '</text></g>';
}

function envolver(txt, ancho, tam, factor) {
  const max = Math.max(8, Math.floor(ancho / (tam * factor))), out = [];
  let linea = '';
  for (const pal of String(txt || '').split(/\s+/).filter(Boolean)) {
    if ((linea + ' ' + pal).trim().length > max && linea) { out.push(linea); linea = pal; } else linea = (linea + ' ' + pal).trim();
  }
  if (linea) out.push(linea);
  return out;
}
function dibujar(P, G, est) {
  // est = { p, a, th, fase, fa }  p = jugada actual (0 = inicial) · a = avance del movimiento (0..1) · th = segundos desde que cayó
  const { p, a, th } = est;
  const jug = p > 0 ? P.jugadas[p - 1] : null;
  const nag = jug ? jug[1] : '';
  const an = p > 0 ? G.anims[p] : null;
  const prev = G.snaps[Math.max(0, p - 1)], cur = G.snaps[p];
  const flash = nag === '!!' && th >= 0 && th < 0.3 ? 0.55 * (1 - th / 0.3) : 0;
  let s = '';
  s += '<defs><linearGradient id="fondo" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="' + COL.fondo2 + '"/><stop offset="1" stop-color="' + COL.fondo1 + '"/></linearGradient>'
    + '<clipPath id="tab"><rect x="' + BX + '" y="' + BY + '" width="' + S + '" height="' + S + '" rx="20"/></clipPath>'
    + '<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>'
    + '<linearGradient id="oroG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f2a900"/></linearGradient>'
    + '<filter id="sombra" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#000" flood-opacity="0.45"/></filter></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#fondo)"/>';

  // Encabezado
  s += '<rect x="' + BX + '" y="40" width="440" height="56" rx="28" fill="' + COL.oro + '"/>'
    + '<rect x="' + (BX + 22) + '" y="55" width="28" height="26" rx="5" fill="none" stroke="#0b1220" stroke-width="4"/><rect x="' + (BX + 22) + '" y="55" width="28" height="8" fill="#0b1220"/>'
    + '<text x="' + (BX + 64) + '" y="78" font-size="31" font-weight="800" letter-spacing="2" fill="#0b1220">UN DÍA COMO HOY</text>';
  const fl = fechaLarga(P.fecha);
  s += '<text x="' + BX + '" y="178" font-size="' + ajustar(fl, 78, 960, 0.55) + '" font-weight="800" fill="#fff">' + esc(fl) + '</text>';
  const ev = P.evento + (P.ronda ? ' · ' + P.ronda : '');
  s += '<text x="' + BX + '" y="226" font-size="' + ajustar(ev, 34, 960, 0.5) + '" font-weight="600" fill="' + COL.gris + '">' + esc(ev) + '</text>';

  // Jugador de arriba (negras)
  const barra = (y, J, mueve) => '<rect x="' + BX + '" y="' + y + '" width="' + S + '" height="72" rx="14" fill="rgba(255,255,255,0.08)"/>'
    + (mueve ? '<rect x="' + BX + '" y="' + y + '" width="9" height="72" rx="4" fill="' + COL.oro + '"/>' : '')
    + '<text x="' + (BX + 28) + '" y="' + (y + 48) + '" font-size="' + ajustar(J.nombre, 38, 600, 0.56) + '" font-weight="700" fill="#fff">' + esc(J.nombre) + '</text>'
    + '<text x="' + (BX + S - 22) + '" y="' + (y + 47) + '" text-anchor="end" font-size="30" font-weight="600" fill="' + COL.gris + '">' + esc((J.equipo || '') + (J.elo ? ' · ' + J.elo : '')) + '</text>';
  const mueveBlancas = p % 2 === 0;
  s += barra(248, P.negras, !mueveBlancas && p < P.jugadas.length);

  // Tablero
  s += '<rect x="' + (BX - 4) + '" y="' + (BY + 6) + '" width="' + (S + 8) + '" height="' + (S + 8) + '" rx="24" fill="#000" opacity="0.35"/><rect x="' + BX + '" y="' + BY + '" width="' + S + '" height="' + S + '" rx="20" fill="' + COL.claro + '"/>';
  s += '<g clip-path="url(#tab)">';
  const resaltar = new Set(an ? [an.from, an.to] : []);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = 'abcdefgh'[f] + (8 - r), clara = (r + f) % 2 === 0;
    s += '<rect x="' + (BX + f * C) + '" y="' + (BY + r * C) + '" width="' + (C + 0.5) + '" height="' + (C + 0.5) + '" fill="' + (clara ? COL.claro : COL.oscuro) + '"/>';
    if (resaltar.has(sq)) s += '<rect x="' + (BX + f * C) + '" y="' + (BY + r * C) + '" width="' + (C + 0.5) + '" height="' + (C + 0.5) + '" fill="#f6f669" opacity="' + (clara ? 0.62 : 0.5) + '"/>';
    if (r === 7) s += '<text x="' + (BX + (f + 1) * C - 8) + '" y="' + (BY + S - 9) + '" text-anchor="end" font-size="22" font-weight="700" fill="' + (clara ? COL.oscuro : COL.claro) + '">' + 'abcdefgh'[f] + '</text>';
    if (f === 0) s += '<text x="' + (BX + 8) + '" y="' + (BY + r * C + 26) + '" font-size="22" font-weight="700" fill="' + (clara ? COL.oscuro : COL.claro) + '">' + (8 - r) + '</text>';
  }
  // Piezas (las que no se mueven primero; la que se mueve, encima)
  const mueven = new Map(); if (an) for (const m of an.mueve) mueven.set(m.id, m);
  const dibujarPieza = (pz, x, y, op, esc2) => {
    const c = esc2 || 1, tam = C * c, off = (C - tam) / 2;
    return '<svg x="' + (x + off).toFixed(1) + '" y="' + (y + off).toFixed(1) + '" width="' + tam.toFixed(1) + '" height="' + tam.toFixed(1) + '" viewBox="0 0 45 45" opacity="' + op.toFixed(2) + '">' + PIEZAS[pz.c + pz.t] + '</svg>';
  };
  const t = ease(a);
  let capa1 = '', capa2 = '';
  const base = an ? prev : cur;
  for (const pz of base) {
    const mv = mueven.get(pz.id);
    if (mv) {
      const A = sqXY(mv.de), B = sqXY(mv.a);
      const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t;
      const tipo = (an.promo && an.promo.id === pz.id && a > 0.6) ? { ...pz, t: an.promo.t } : pz;
      capa2 += dibujarPieza(tipo, x, y, 1, 1 + 0.1 * Math.sin(Math.PI * a));
    } else if (an && an.quita === pz.id) {
      const q = sqXY(pz.sq); capa1 += dibujarPieza(pz, q.x, q.y, clamp(1 - (a - 0.45) / 0.4, 0, 1), 1 - 0.25 * ease((a - 0.45) / 0.4));
    } else { const q = sqXY(pz.sq); capa1 += dibujarPieza(pz, q.x, q.y, 1, 1); }
  }
  s += capa1 + capa2;

  // Efectos de la jugada (cuando ya cayó la pieza)
  if (an && jug && a >= 1) {
    const D = sqXY(an.to), cx = D.x + C / 2, cy = D.y + C / 2;
    if (nag === '!!') {
      s += '<rect x="' + BX + '" y="' + BY + '" width="' + S + '" height="' + S + '" fill="url(#vig)" opacity="' + clamp(th / 0.4, 0, 1).toFixed(2) + '"/>';
      for (let k = 0; k < 3; k++) {
        const ph = ((th * 1.25) + k / 3) % 1;
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (50 + ph * 230).toFixed(1) + '" fill="none" stroke="#ffd34d" stroke-width="' + (12 * (1 - ph) + 2).toFixed(1) + '" opacity="' + (0.95 * (1 - ph)).toFixed(2) + '"/>';
      }
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (C * 0.62).toFixed(1) + '" fill="#ffd34d" opacity="' + (0.22 + 0.12 * Math.sin(th * 9)).toFixed(2) + '"/>';
      const ptos = [[-1.9, -1.3], [1.8, -1.6], [-2.4, 0.9], [2.3, 1.2], [0.2, -2.3], [-0.7, 2.2], [1.1, 2.0], [-1.6, -2.1], [2.6, -0.3], [-2.8, -0.4]];
      ptos.forEach(([dx, dy], k) => {
        const tw = Math.max(0, Math.sin(th * 6 + k * 1.7)), px = clamp(cx + dx * C * 0.8, BX + 20, BX + S - 20), py = clamp(cy + dy * C * 0.8, BY + 20, BY + S - 20);
        if (th > 0.12 + k * 0.03) s += estrella(px, py, 14 + 16 * tw, th * 0.8 + k, 0.35 + 0.65 * tw, k % 2 ? '#fff6c2' : '#ffd34d');
      });
    } else if (nag === '??' || nag === '?') {
      const col = NAG[nag].c, sh = th < 0.5 ? Math.sin(th * 55) * 7 * (1 - th / 0.5) : 0;
      for (let k = 0; k < 2; k++) { const ph = ((th * 1.5) + k / 2) % 1; s += '<circle cx="' + (cx + sh) + '" cy="' + cy + '" r="' + (70 - ph * 40 + (nag === '??' ? 30 : 0)).toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="10" opacity="' + (0.8 * (1 - ph)).toFixed(2) + '"/>'; }
    }
    const tFlecha = (NAG[nag] && NAG[nag].t && nag !== '!!') ? 1.0 : 0.5;
    if (an.mejor && th > tFlecha) {
      const A = sqXY(an.mejor.from), B = sqXY(an.mejor.to), k2 = ease((th - tFlecha) / 0.35);
      const x1 = A.x + C / 2, y1 = A.y + C / 2, x2 = x1 + (B.x + C / 2 - x1) * k2, y2 = y1 + (B.y + C / 2 - y1) * k2;
      const ang = Math.atan2(y2 - y1, x2 - x1), L2 = Math.hypot(x2 - x1, y2 - y1), cab = 46, rec = Math.max(0, L2 - cab * 0.8);
      const ex = x1 + Math.cos(ang) * rec, ey = y1 + Math.sin(ang) * rec;
      if (L2 > 20) s += '<g opacity="0.88"><line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="#3ddc97" stroke-width="22" stroke-linecap="round"/>'
        + '<polygon points="' + [[x2, y2], [x2 - Math.cos(ang - 0.5) * cab, y2 - Math.sin(ang - 0.5) * cab], [x2 - Math.cos(ang + 0.5) * cab, y2 - Math.sin(ang + 0.5) * cab]].map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ') + '" fill="#3ddc97"/></g>';
    }
    const esc3 = nag === '!!' ? 1.15 + 0.25 * pop(th / 0.35) : nag === '??' || nag === '?' ? 0.9 + 0.4 * pop(th / 0.25) : 0.9 + 0.3 * pop(th / 0.2);
    if (nag) s += insignia(D.x + C - 18, D.y + 18, nag, esc3);
    // Cartel grande
    const n = NAG[nag];
    if (n && n.t && th >= 0) {
      const fade = nag === '!!' ? 1 : 1 - clamp((th - 0.85) / 0.25, 0, 1), k = pop(th / 0.4), ancho = nag === '!!' ? 640 : nag === '??' ? 660 : 380, alto = 112;
      const gx = BX + S / 2, gy = BY + (nag === '!!' ? 150 : 150);
      const relleno = nag === '!!' ? 'url(#oroG)' : n.c, tinta = nag === '!!' ? '#3a2600' : '#fff';
      if (fade > 0) s += '<g opacity="' + fade.toFixed(2) + '" transform="translate(' + gx + ' ' + gy + ') scale(' + Math.max(0.01, k).toFixed(3) + ') rotate(' + (nag === '!!' ? -4 : 0) + ')">'
        + '<rect x="' + (-ancho / 2) + '" y="' + (-alto / 2) + '" width="' + ancho + '" height="' + alto + '" rx="30" fill="' + relleno + '" stroke="#fff" stroke-width="6"/>'
        + '<text x="0" y="' + (alto * 0.17) + '" text-anchor="middle" font-size="' + (nag === '!!' ? 76 : 68) + '" font-weight="900" fill="' + tinta + '">' + esc(n.t) + '</text></g>';
    }
  }
  s += '</g>';
  if (flash > 0) s += '<rect width="' + W + '" height="' + H + '" fill="#fff" opacity="' + flash.toFixed(2) + '"/>';

  // Jugador de abajo (blancas)
  s += barra(BY + S + 12, P.blancas, mueveBlancas && p < P.jugadas.length);

  // Jugada actual + eval
  const yP = BY + S + 100;
  const eAnt = p > 1 ? P.jugadas[p - 2][2] : 20, eAct = p > 0 ? P.jugadas[p - 1][2] : 20;
  const ev1 = evNum(eAnt), ev2 = evNum(eAct), evMix = ev1 + (ev2 - ev1) * ease(a);
  const wp = (typeof eAct === 'string' && a >= 1) ? winP(eAct) : winP(evMix);
  if (jug) {
    const num = Math.ceil(p / 2) + (p % 2 ? '.' : '…'), txt = num + ' ' + esp(jug[0]);
    s += '<text x="' + (BX + 4) + '" y="' + (yP + 52) + '" font-size="64" font-weight="800" fill="#fff">' + esc(txt) + '</text>';
    if (nag) {
      const w = txt.length * 40 + 24;
      s += insignia(BX + 4 + w + 8, yP + 32, nag, 0.95)
        + '<text x="' + (BX + 4 + w + 50) + '" y="' + (yP + 44) + '" font-size="32" font-weight="700" fill="' + NAG[nag].c + '">' + esc(NAG[nag].sub) + '</text>';
    }
    s += '<text x="' + (BX + S) + '" y="' + (yP + 50) + '" text-anchor="end" font-size="52" font-weight="800" fill="' + (evNum(eAct) >= 0 ? '#fff' : '#ff9d9d') + '">' + esc(evTexto(eAct)) + '</text>';
  }
  const by = yP + 70;
  s += '<rect x="' + BX + '" y="' + by + '" width="' + S + '" height="22" rx="11" fill="#1d2a40"/>'
    + '<clipPath id="ebar"><rect x="' + BX + '" y="' + by + '" width="' + S + '" height="22" rx="11"/></clipPath>'
    + '<rect x="' + BX + '" y="' + by + '" width="' + (S * wp / 100).toFixed(1) + '" height="22" fill="#f4f7fb" clip-path="url(#ebar)"/>'
    + '<rect x="' + (BX + S / 2 - 2) + '" y="' + (by - 4) + '" width="4" height="30" fill="' + COL.oro + '"/>';

  // 🧉 El Pupi con su globo (lo que dice el comentarista de la web en esa jugada)
  const pu = (p > 0 && P.pupi && P.pupi[p]) || (p === 0 ? { cara: 'habla' } : { cara: 'tranqui' });
  const yPu = by + 44, altoPu = 300;
  const tiempoPupi = est.fase === 'mov' ? Math.max(0, est.th + T_MOV) : 1;   // segundos desde que empezó la jugada
  const cara = CARAS[pu.cara] ? pu.cara : 'tranqui';
  const caraAntes = ((p > 1 && P.pupi && P.pupi[p - 1]) || { cara: 'tranqui' }).cara;   // sin saltito entre jugadas: sólo se sacude si cambia a una cara de susto
  const tiembla = (cara === 'horror' || cara === 'uff' || cara === 'escupe') && cara !== caraAntes && tiempoPupi < 0.9 ? Math.sin(tiempoPupi * 70) * 7 * (1 - tiempoPupi / 0.9) : 0;
  const px = BX + 8, pw = 290, ph = pw * 308 / 341, py = yPu + (altoPu - ph) / 2;
  s += '<g transform="translate(' + (px + pw / 2 + tiembla).toFixed(1) + ' ' + (py + ph).toFixed(1) + ')">'
    + '<image href="' + CARAS[cara] + '" x="' + (-pw / 2) + '" y="' + (-ph) + '" width="' + pw + '" height="' + ph + '"/></g>';
  if (pu.t || pu.b) {
    const gx = BX + 330, gw = S - 330, op = clamp(tiempoPupi / 0.25, 0, 1);
    const colT = nag === '??' ? '#ff9d9d' : nag === '!!' ? '#7df0d6' : '#fff';
    const cuerpoGrande = String(pu.b || '').length <= 48, tamB = cuerpoGrande ? 36 : 29, lhB = cuerpoGrande ? 46 : 37;
    const lineasT = envolver(pu.t || '', gw - 70, 34, 0.54).slice(0, 2), lineasB = envolver(pu.b || '', gw - 70, tamB, cuerpoGrande ? 0.52 : 0.5).slice(0, 5);
    const gh = Math.min(altoPu - 4, 40 + lineasT.length * 42 + (lineasT.length && lineasB.length ? 8 : 0) + lineasB.length * lhB), gy = yPu + (altoPu - gh) / 2;
    let y0 = gy + 20 + 34, texto = '';
    for (const l of lineasT) { texto += '<text x="' + (gx + 38) + '" y="' + y0 + '" font-size="34" font-weight="800" fill="' + colT + '">' + esc(l) + '</text>'; y0 += 42; }
    if (lineasT.length && lineasB.length) y0 += 8;
    const colB = /^(Mejor|Preferible|Resist)/.test(pu.b || '') ? COL.oro : COL.texto;
    for (const l of lineasB) { texto += '<text x="' + (gx + 38) + '" y="' + (y0 - (cuerpoGrande ? 0 : 4)) + '" font-size="' + tamB + '" font-weight="' + (cuerpoGrande ? 700 : 500) + '" fill="' + colB + '">' + esc(l) + '</text>'; y0 += lhB; }
    const yc = gy + gh / 2;
    s += '<g opacity="' + op.toFixed(2) + '"><path d="M ' + (gx + 14) + ' ' + (yc - 22) + ' l -34 22 l 34 22 z" fill="rgba(255,255,255,0.13)"/>'
      + '<rect x="' + gx + '" y="' + gy.toFixed(1) + '" width="' + gw + '" height="' + gh + '" rx="26" fill="rgba(255,255,255,0.13)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>' + texto + '</g>';
  }

  // Pie
  s += '<image href="' + LOGO + '" x="' + BX + '" y="1822" width="70" height="70"/>'
    + '<text x="' + (BX + 88) + '" y="1868" font-size="46" font-weight="800" fill="#fff">Chess<tspan fill="' + COL.oro + '">Argentino</tspan></text>'
    + '<text x="' + (BX + S) + '" y="1866" text-anchor="end" font-size="34" font-weight="700" fill="' + COL.gris + '">' + esc(P.link || 'chessargentino.ar') + '</text>';

  // Portada / cierre
  if (est.fase === 'intro') {
    const o = est.fa;
    s += '<g opacity="' + o.toFixed(2) + '"><rect x="' + BX + '" y="' + BY + '" width="' + S + '" height="' + S + '" rx="20" fill="rgba(8,14,26,0.93)"/>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 150) + '" text-anchor="middle" font-size="44" font-weight="800" letter-spacing="3" fill="' + COL.oro + '">PARTIDA HISTÓRICA</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 330) + '" text-anchor="middle" font-size="' + ajustar(P.blancas.nombre, 78, 880, 0.58) + '" font-weight="800" fill="#fff">' + esc(P.blancas.nombre) + '</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 380) + '" text-anchor="middle" font-size="36" font-weight="600" fill="' + COL.gris + '">' + esc(P.blancas.equipo + ' · ' + P.blancas.elo) + '</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 490) + '" text-anchor="middle" font-size="64" font-weight="900" fill="' + COL.oro + '">vs</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 610) + '" text-anchor="middle" font-size="' + ajustar(P.negras.nombre, 78, 880, 0.58) + '" font-weight="800" fill="#fff">' + esc(P.negras.nombre) + '</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 660) + '" text-anchor="middle" font-size="36" font-weight="600" fill="' + COL.gris + '">' + esc(P.negras.equipo + ' · ' + P.negras.elo) + '</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 800) + '" text-anchor="middle" font-size="' + ajustar(P.evento, 40, 880, 0.52) + '" font-weight="700" fill="#fff">' + esc(P.evento) + '</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 856) + '" text-anchor="middle" font-size="34" font-weight="600" fill="' + COL.gris + '">' + esc([P.ronda, P.eco].filter(Boolean).join(' · ')) + '</text></g>';
  } else if (est.fase === 'outro') {
    const o = est.fa, k = pop(est.th / 0.5);
    const res = P.resultado === '1-0' ? 'Ganó ' + P.blancas.nombre : P.resultado === '0-1' ? 'Ganó ' + P.negras.nombre : 'Tablas';
    s += '<g opacity="' + clamp(o, 0, 1).toFixed(2) + '"><rect x="' + BX + '" y="' + BY + '" width="' + S + '" height="' + S + '" rx="20" fill="rgba(8,14,26,0.80)"/>'
      + '<g transform="translate(' + (BX + S / 2) + ' ' + (BY + 380) + ') scale(' + Math.max(0.01, k).toFixed(3) + ')">'
      + '<text x="0" y="0" text-anchor="middle" font-size="' + ajustar(res, 84, 900, 0.58) + '" font-weight="900" fill="#fff">' + esc(res) + '</text>'
      + '<text x="0" y="150" text-anchor="middle" font-size="150" font-weight="900" fill="' + COL.oro + '">' + esc(P.resultado.replace('1/2-1/2', '½-½')) + '</text></g>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 740) + '" text-anchor="middle" font-size="42" font-weight="700" fill="' + COL.gris + '">Revivila jugada por jugada en</text>'
      + '<text x="' + (BX + S / 2) + '" y="' + (BY + 800) + '" text-anchor="middle" font-size="58" font-weight="800" fill="' + COL.oro + '">' + esc(P.link || 'chessargentino.ar') + '</text></g>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Segoe UI, Arial, sans-serif">' + s + '</svg>';
}

// ── línea de tiempo ──
const T_MOV = 0.28;
function pausaDe(P, i) {
  const [, nag, ev] = P.jugadas[i];
  const p = i + 1, pu = P.pupi && P.pupi[p];
  // segundos para leer el globo del Pupi
  const lectura = pu ? Math.min(5.5, (pu.t ? 0.9 : 0) + String(pu.t || '').length / 30 + String(pu.b || '').length / 28) : 0;
  let base = p <= 12 ? 0.3 : 0.35;
  if (!nag && !pu && Math.abs(evNum(ev)) > 450 && p > 12) base = 0.2;
  const efecto = { '!!': 2.8, '??': 1.6, '?': 1.2, '!': 0.8, '?!': 0.0 }[nag] || 0;   // el efecto corre mientras se lee
  const conFlecha = pu && /(Mejor|Preferible) era|Resistía un poco más con/.test(pu.b || '') ? 1.0 + 1.6 : 0;   // 1 s de cartel + 1,6 s mirando la flecha
  const t = Math.max(base, lectura * (pu && pu.chico ? 0.6 : 1), efecto, conFlecha);
  return p === P.jugadas.length ? Math.min(t, 1.5) : t;
}
function lineaDeTiempo(P) {
  const L = [];   // { fase, p, nFrames, a0..}
  L.push({ fase: 'intro', p: 0, frames: Math.round(3.2 * FPS) });
  for (let i = 0; i < P.jugadas.length; i++) L.push({ fase: 'mov', p: i + 1, frames: Math.round((T_MOV + pausaDe(P, i)) * FPS) });
  L.push({ fase: 'outro', p: P.jugadas.length, frames: Math.round(4.5 * FPS) });
  return L;
}
function estadoDe(seg, k) {
  const seg_s = k / FPS;
  if (seg.fase === 'intro') return { p: 0, a: 1, th: -1, fase: 'intro', fa: clamp(Math.min(seg_s / 0.35, (seg.frames / FPS - seg_s) / 0.35), 0, 1) };
  if (seg.fase === 'outro') return { p: seg.p, a: 1, th: 5 + seg_s, fase: 'outro', fa: clamp(seg_s / 0.4, 0, 1) };
  return { p: seg.p, a: clamp(seg_s / T_MOV, 0, 1), th: seg_s - T_MOV, fase: 'mov', fa: 0 };
}

const png = (svg) => new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: false, fontFiles: ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/seguisb.ttf', 'C:/Windows/Fonts/segoeuil.ttf', 'C:/Windows/Fonts/arialbd.ttf'], defaultFontFamily: 'Segoe UI' } }).render().asPng();

// ── principal ──
const [, , entrada, salida, ...flags] = isMainThread ? process.argv : ['', '', workerData.entrada];
const P = JSON.parse(fs.readFileSync(entrada, 'utf8'));
const G = prepararPartida(P);

if (!isMainThread) {
  // Obrero: dibuja los cuadros que le manda el principal.
  parentPort.on('message', (m) => { parentPort.postMessage({ i: m.i, buf: png(dibujar(P, G, m.est)) }); });
} else {
  if (!entrada || !salida) { console.log('Uso: node video-hoy.mjs partida.json salida/video.mp4   (o: salida --fotos)'); process.exit(1); }
  const L = lineaDeTiempo(P);
  const total = L.reduce((n, s) => n + s.frames, 0);
  console.log('Jugadas:', P.jugadas.length, '· cuadros:', total, '· duración:', (total / FPS).toFixed(1) + ' s');

  if (flags.includes('--fotos')) {
    fs.mkdirSync(salida, { recursive: true });
    const brillante = P.jugadas.findIndex((j) => j[1] === '!!') + 1, grave = P.jugadas.findIndex((j) => j[1] === '??') + 1;
    const fotos = [['intro', { p: 0, a: 1, th: -1, fase: 'intro', fa: 1 }], ['apertura', { p: 8, a: 0.5, th: -1, fase: 'mov', fa: 0 }],
      ['grave', { p: grave, a: 1, th: 1.7, fase: 'mov', fa: 0 }], ['brillante', { p: brillante, a: 1, th: 0.7, fase: 'mov', fa: 0 }],
      ['brillante-flash', { p: brillante, a: 1, th: 0.08, fase: 'mov', fa: 0 }], ['final', { p: 80, a: 1, th: 0.1, fase: 'mov', fa: 0 }],
      ['cierre', { p: P.jugadas.length, a: 1, th: 5.6, fase: 'outro', fa: 1 }]];
    for (const [n, e] of fotos) { fs.writeFileSync(path.join(salida, 'foto-' + n + '.png'), png(dibujar(P, G, e))); console.log('foto-' + n + '.png'); }
    process.exit(0);
  }

  const ffmpeg = buscarFfmpeg();
  if (!ffmpeg) { console.error('No encuentro ffmpeg. Instalalo con: winget install Gyan.FFmpeg'); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });

  // 1) Lista de cuadros. Los quietos (pausas sin efecto) son idénticos: se dibujan una vez y se repiten.
  const trabajos = [], orden = [];   // trabajos[j] = estado a dibujar · orden[f] = nº de trabajo del cuadro f
  let ultimaClave = null;
  for (const seg of L) for (let k = 0; k < seg.frames; k++) {
    const est = estadoDe(seg, k), nagP = seg.fase === 'mov' ? P.jugadas[seg.p - 1][1] : '';
    const quieto = seg.fase === 'mov' && est.a >= 1 && !['!!', '??', '?'].includes(nagP) && est.th > 0.95;
    const clave = quieto ? 'q' + seg.p : (seg.fase === 'intro' && est.fa >= 1) ? 'intro' : null;
    if (clave && clave === ultimaClave) { orden.push(trabajos.length - 1); continue; }
    ultimaClave = clave; trabajos.push(est); orden.push(trabajos.length - 1);
  }
  console.log('A dibujar:', trabajos.length, 'de', total, 'cuadros');

  // 1b) Audio: música tenue + sonidos del Pupi + clics de las piezas.
  let audioWav = null;
  if (!flags.includes('--sin-audio')) {
    const sonidos = cargarSonidosPupi(path.join(ASSETS, 'pupi', 'sonidos')), eventos = [];
    let acum = 0;
    for (const seg of L) {
      const t0 = acum / FPS; acum += seg.frames;
      if (seg.fase !== 'mov') continue;
      const p = seg.p, pu = P.pupi && P.pupi[p], nag = P.jugadas[p - 1][1], quita = G.anims[p] && G.anims[p].quita != null;
      eventos.push({ t: t0 + T_MOV * 0.85, muestras: quita ? sonidoClic.captura : sonidoClic.normal, vol: quita ? 0.5 : 0.35 });
      let voz = null;
      if (pu) {
        if (pu.cara === 'escupe') voz = 'escupe'; else if (pu.cara === 'atraganta') voz = 'tos';
        else if (nag === '!!') voz = 'jugadon'; else if (nag === '!') voz = 'tremendo';
        else if (/^Mmm/.test(pu.t || '')) voz = 'mmm';
        else if (pu.t === '*sorbo de mate*') voz = 'mate'; else if (/^\(cebando/.test(pu.t || '')) voz = 'termo';
      }
      if (voz && sonidos[voz]) eventos.push({ t: t0 + T_MOV + 0.05, muestras: sonidos[voz], vol: 0.9, voz: true });
    }
    const iMus = flags.indexOf('--musica');
    audioWav = armarAudio({ duracion: total / FPS, eventos, musicaArchivo: iMus >= 0 ? flags[iMus + 1] : null,
      salidaWav: path.join(path.dirname(path.resolve(salida)), 'audio-temporal.wav'), ffmpeg, spawnSync });
    console.log('Audio listo:', eventos.length, 'sonidos' + (iMus >= 0 ? ' + tu música' : ' + música propia'));
  }

  // 2) Varios obreros dibujan en paralelo; el principal los junta en orden y se los pasa a ffmpeg.
  const nObreros = Math.max(1, Math.min(os.cpus().length - 1, 8));
  const obreros = Array.from({ length: nObreros }, () => new Worker(new URL(import.meta.url), { workerData: { entrada } }));
  const listos = new Map(), VENTANA = nObreros * 3;
  let enviado = 0, escrito = 0, hecho = 0;
  const t0 = Date.now();
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', ...(audioWav ? ['-i', audioWav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-shortest'] : []), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', salida], { stdio: ['pipe', 'inherit', 'inherit'] });
  const cerrado = new Promise((res) => ff.on('close', res));
  const lastUso = new Array(trabajos.length).fill(0); orden.forEach((j, f) => { lastUso[j] = f; });
  await new Promise((resolver, rechazar) => {
    let escribiendo = false;
    // Manda trabajos a los obreros libres, sin adelantarse demasiado a lo que ya se escribió.
    const repartir = () => {
      for (const o of obreros) {
        if (!o._libre || enviado >= trabajos.length) continue;
        if (enviado - orden[Math.min(escrito, total - 1)] >= VENTANA) break;
        o._libre = false; o.postMessage({ i: enviado, est: trabajos[enviado] }); enviado++;
      }
    };
    const vaciar = async () => {
      if (escribiendo) return;
      escribiendo = true;
      try {
        while (escrito < total && listos.has(orden[escrito])) {
          const j = orden[escrito], buf = listos.get(j);
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
          if (lastUso[j] === escrito) listos.delete(j);
          escrito++;
          if (escrito % 300 === 0) console.log(escrito + '/' + total + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
          repartir();
        }
      } catch (e) { rechazar(e); return; }
      escribiendo = false;
      if (escrito >= total) resolver(); else repartir();
    };
    obreros.forEach((o) => {
      o._libre = true;
      o.on('error', rechazar);
      o.on('message', (m) => { listos.set(m.i, Buffer.from(m.buf)); hecho++; o._libre = true; repartir(); vaciar(); });
    });
    repartir();
  });
  ff.stdin.end();
  obreros.forEach((o) => o.terminate());
  const cod = await cerrado;
  if (audioWav) try { fs.unlinkSync(audioWav); } catch (e) { /* nada */ }
  console.log(cod === 0 ? '✅ Listo: ' + salida + ' (' + (fs.statSync(salida).size / 1e6).toFixed(1) + ' MB) en ' + Math.round((Date.now() - t0) / 1000) + ' s' : '❌ ffmpeg terminó con error ' + cod);
  process.exit(cod === 0 ? 0 : 1);
}
