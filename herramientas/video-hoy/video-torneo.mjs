// 🏆 VIDEO RESUMEN de un torneo (vertical 1080×1920, MP4) para Reels / TikTok / el canal.
// Portada con el flyer → por cada categoría: podio animado, lo mejor de la Radiografía y algún jugadón → cierre.
// Con varias categorías muestra una por una, con menos datos de la Radiografía y un jugadón por categoría.
// Los datos salen de torneo-datos.mjs (lo que ya publica la web); el dibujo, igual que video-hoy.mjs (resvg + ffmpeg).
//
// Uso (desde esta carpeta):
//   node video-torneo.mjs <torneoId> salida/torneo.mp4 [--musica musica.mp3]
//   node video-torneo.mjs <torneoId> salida/fotos --fotos          ← sólo unas fotos para mirar cómo queda
//   (en lugar del id puede ir un .json ya armado con torneo-datos.mjs)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Resvg } from '@resvg/resvg-js';
import { Chess } from 'chess.js';
import { armarAudio, cargarSonidosPupi, sonidoClic, sonidoFestejo, estiloDelDia, ESTILOS } from './audio.mjs';
import { datosTorneo } from './torneo-datos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(AQUI, '../../assets');
const W = 1080, H = 1920, FPS = 30, BX = 60, S = 960;
const COL = { fondo1: '#0b1220', fondo2: '#16233a', oro: '#ffc940', plata: '#c9d3de', bronce: '#d9925a', claro: '#dde8ef', oscuro: '#658da6', texto: '#e8eef6', gris: '#9fb3c8', verde: '#1fae92' };
const FUENTES = ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/seguisb.ttf', 'C:/Windows/Fonts/seguisym.ttf', 'C:/Windows/Fonts/arialbd.ttf'].filter((f) => fs.existsSync(f));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const pop = (t) => { t = clamp(t, 0, 1); const s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
const ajustar = (txt, max, ancho, factor = 0.56) => Math.min(max, Math.floor(ancho / (Math.max(1, String(txt).length) * factor)));
function envolver(txt, ancho, tam, factor) {
  const max = Math.max(6, Math.floor(ancho / (tam * factor))), out = [];
  let linea = '';
  for (const pal of String(txt || '').split(/\s+/).filter(Boolean)) {
    if ((linea + ' ' + pal).trim().length > max && linea) { out.push(linea); linea = pal; } else linea = (linea + ' ' + pal).trim();
  }
  if (linea) out.push(linea);
  return out;
}
const png = (svg, ancho) => new Resvg(svg, { fitTo: { mode: 'width', value: ancho || W }, font: { loadSystemFonts: false, fontFiles: FUENTES, defaultFontFamily: 'Segoe UI' } }).render().asPng();
const uri = (buf) => 'data:image/png;base64,' + Buffer.from(buf).toString('base64');

// Una imagen (jpg/png/svg) recortada a w×h ("slice" = cubre todo, como object-fit: cover) y pasada a PNG UNA vez:
// así cada cuadro no tiene que volver a decodificar el flyer o las fotos grandes.
const _img = new Map();
function imagen(file, w, h, modo = 'xMidYMid slice') {
  const k = file + '|' + w + '|' + h + '|' + modo;
  if (_img.has(k)) return _img.get(k);
  let href;
  if (/\.svg$/i.test(file)) href = 'data:image/svg+xml;base64,' + fs.readFileSync(file).toString('base64');
  else href = 'data:image/' + (/\.png$/i.test(file) ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(file).toString('base64');
  const v = uri(png('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><image href="' + href + '" width="' + w + '" height="' + h + '" preserveAspectRatio="' + modo + '"/></svg>', w));
  _img.set(k, v);
  return v;
}

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

// ── piezas y caras ──
const PIEZAS = {};
for (const c of ['w', 'b']) for (const t of ['K', 'Q', 'R', 'B', 'N', 'P']) {
  PIEZAS[c + t] = fs.readFileSync(path.join(ASSETS, 'piezas', c + t + '.svg'), 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
const cara = (n) => { const f = path.join(AQUI, 'caras-png', n + '.png'); return fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null; };
const CARAS = { contento: cara('contento'), asombro: cara('asombro'), chau: cara('chau'), explica: cara('explica'), contento3: cara('contento3') };
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, 'logo.png')).toString('base64');
const esp = (san) => String(san).replace(/^[KQRBN]/, (m) => ({ K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' })[m]).replace(/=([QRBN])/, (m, x) => '=' + ({ Q: 'D', R: 'T', B: 'A', N: 'C' })[x]);

// ── piezas sueltas del dibujo ──
const DEFS = '<defs><linearGradient id="fondo" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="' + COL.fondo2 + '"/><stop offset="1" stop-color="' + COL.fondo1 + '"/></linearGradient>'
  + '<linearGradient id="oroG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f2a900"/></linearGradient>'
  + '<linearGradient id="plataG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef3f8"/><stop offset="1" stop-color="#9eabb9"/></linearGradient>'
  + '<linearGradient id="bronceG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0b483"/><stop offset="1" stop-color="#a8622d"/></linearGradient>'
  + '<linearGradient id="sombraAbajo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1220" stop-opacity="0"/><stop offset="1" stop-color="#0b1220" stop-opacity="1"/></linearGradient>'
  + '<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient></defs>';
const marco = (s) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Segoe UI, Segoe UI Symbol, Arial, sans-serif">'
  + DEFS + '<rect width="' + W + '" height="' + H + '" fill="url(#fondo)"/>' + s + '</svg>';
function pildora(x, y, txt, color) {
  const t = String(txt).toUpperCase(), tam = Math.min(31, Math.floor(820 / (t.length * 0.72))), ancho = Math.min(S, Math.round(44 + t.length * tam * 0.72 + 28));
  return '<rect x="' + x + '" y="' + y + '" width="' + ancho + '" height="56" rx="28" fill="' + (color || COL.oro) + '"/>'
    + '<text x="' + (x + 28) + '" y="' + (y + 28 + tam * 0.36).toFixed(0) + '" font-size="' + tam + '" font-weight="800" letter-spacing="2" fill="#0b1220">' + esc(t) + '</text>';
}
function pie() {
  return '<image href="' + LOGO + '" x="' + BX + '" y="1822" width="70" height="70"/>'
    + '<text x="' + (BX + 88) + '" y="1868" font-size="46" font-weight="800" fill="#fff">Chess<tspan fill="' + COL.oro + '">Argentino</tspan></text>'
    + '<text x="' + (BX + S) + '" y="1866" text-anchor="end" font-size="34" font-weight="700" fill="' + COL.gris + '">chessargentino.ar</text>';
}
const iniciales = (n) => { const p = String(n || '?').split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
let _idAv = 0;
// Un círculo con la foto (o la bandera, para los países) o, si no hay, las iniciales.
function avatar(cx, cy, r, P, borde, equipos) {
  const id = 'av' + (_idAv++);
  let s = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 6) + '" fill="' + (borde || '#fff') + '"/>';
  if (P && P.icono) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#26364f"/><text x="' + cx + '" y="' + (cy + r * 0.38).toFixed(0) + '" text-anchor="middle" font-size="' + Math.round(r * 1.15) + '" fill="' + COL.oro + '">' + esc(P.icono) + '</text>';
  else if (P && P.foto) s += '<clipPath id="' + id + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/></clipPath><image href="' + imagen(P.foto, 2 * r, 2 * r) + '" x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" clip-path="url(#' + id + ')"/>';
  else if (equipos && P && P.bandera) s += '<clipPath id="' + id + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/></clipPath><image href="' + imagen(P.bandera, Math.round(3 * r), 2 * r) + '" x="' + (cx - 1.5 * r) + '" y="' + (cy - r) + '" width="' + 3 * r + '" height="' + 2 * r + '" clip-path="url(#' + id + ')"/>';
  else s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#26364f"/><text x="' + cx + '" y="' + (cy + r * 0.3).toFixed(0) + '" text-anchor="middle" font-size="' + Math.round(r * 0.85) + '" font-weight="800" fill="' + COL.gris + '">' + esc(iniciales(P && P.nombre)) + '</text>';
  return s;
}
const bandera = (P, x, y, alto) => (P && P.bandera ? '<image href="' + imagen(P.bandera, Math.round(alto * 1.5), alto) + '" x="' + x + '" y="' + y + '" width="' + Math.round(alto * 1.5) + '" height="' + alto + '"/>' : '');
function estrella(cx, cy, r, rot, op, col) {
  const p = []; for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.28 : r; const an = rot + k * Math.PI / 4; p.push((cx + Math.cos(an) * rr).toFixed(1) + ',' + (cy + Math.sin(an) * rr).toFixed(1)); }
  return '<polygon points="' + p.join(' ') + '" fill="' + col + '" opacity="' + op.toFixed(2) + '"/>';
}
// Encabezado común de las escenas de una categoría: píldora + nombre del torneo + categoría.
function encabezado(D, cat, pild, t) {
  const op = clamp(t / 0.3, 0, 1).toFixed(2);
  let s = '<g opacity="' + op + '">' + pildora(BX, 40, pild);
  const nom = D.nombre;
  s += '<text x="' + BX + '" y="150" font-size="' + ajustar(nom, 46, 960, 0.55) + '" font-weight="800" fill="#fff">' + esc(nom) + '</text>';
  if (cat && cat.nombre) s += '<text x="' + BX + '" y="205" font-size="40" font-weight="700" fill="' + COL.oro + '">' + esc(cat.nombre) + '</text>';
  return s + '</g>';
}

// ── ESCENAS ── cada una: { dur, dibujar(t), quieto(t) → true cuando ya no se mueve nada (se repite el cuadro), sonidos: [{t, voz|clic}] }

function escenaPortada(D) {
  const tieneFlyer = !!D.flyer, fh = 900;
  const fly = tieneFlyer ? imagen(D.flyer, S, fh) : null;
  const lineas = envolver(D.nombre, S, 72, 0.55).slice(0, 3), tam = lineas.length > 2 ? 62 : 72;
  const datos = [D.jugadores ? D.jugadores + (D.categorias.every((c) => c.equipos) ? ' equipos' : ' jugadores') : '', D.rondas ? D.rondas + ' rondas' : '', D.categorias.length > 1 ? D.categorias.length + ' categorías' : '', D.paises > 1 ? D.paises + ' países' : ''].filter(Boolean);
  return { dur: 4.2, quieto: (t) => t > 1.6, dibujar(t) {
    let s = pildora(BX, 40, 'Resumen del torneo');
    const y0 = 130;
    if (fly) {
      const k = 1 + 0.04 * ease(t / 4), o = ease(t / 0.5);
      s += '<clipPath id="fl"><rect x="' + BX + '" y="' + y0 + '" width="' + S + '" height="' + fh + '" rx="26"/></clipPath>'
        + '<g clip-path="url(#fl)" opacity="' + o.toFixed(2) + '"><image href="' + fly + '" x="' + (BX + S / 2 - S * k / 2).toFixed(1) + '" y="' + (y0 + fh / 2 - fh * k / 2).toFixed(1) + '" width="' + (S * k).toFixed(1) + '" height="' + (fh * k).toFixed(1) + '"/>'
        + '<rect x="' + BX + '" y="' + (y0 + fh - 260) + '" width="' + S + '" height="260" fill="url(#sombraAbajo)"/></g>';
    } else {
      const k = pop(t / 0.6);
      s += '<g transform="translate(' + (W / 2) + ' ' + (y0 + 420) + ') scale(' + Math.max(0.01, k).toFixed(3) + ')"><circle r="300" fill="#1a2942"/><circle r="250" fill="url(#oroG)"/>'
        + '<text y="110" text-anchor="middle" font-size="330" fill="#3a2600">♚</text></g>';
    }
    const yT = y0 + fh + 110, o2 = clamp((t - 0.35) / 0.4, 0, 1), dy = (1 - ease((t - 0.35) / 0.5)) * 40;
    s += '<g opacity="' + o2.toFixed(2) + '" transform="translate(0 ' + dy.toFixed(1) + ')">';
    lineas.forEach((l, i) => { s += '<text x="' + BX + '" y="' + (yT + i * (tam + 10)) + '" font-size="' + tam + '" font-weight="900" fill="#fff">' + esc(l) + '</text>'; });
    let y = yT + lineas.length * (tam + 10) + 20;
    const lugar = [D.sede, D.fechas].filter(Boolean).join(' · ');
    if (lugar) { s += '<text x="' + BX + '" y="' + y + '" font-size="' + ajustar(lugar, 40, 960, 0.5) + '" font-weight="600" fill="' + COL.gris + '">' + esc(lugar) + '</text>'; y += 80; }
    s += '</g>';
    let x = BX;
    datos.forEach((d, i) => {
      const o3 = clamp((t - 0.8 - i * 0.15) / 0.3, 0, 1), ancho = d.length * 19 + 50;
      if (x + ancho > BX + S) return;
      s += '<g opacity="' + o3.toFixed(2) + '"><rect x="' + x + '" y="' + (y - 44) + '" width="' + ancho + '" height="62" rx="31" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>'
        + '<text x="' + (x + ancho / 2) + '" y="' + (y - 2) + '" text-anchor="middle" font-size="32" font-weight="700" fill="' + COL.texto + '">' + esc(d) + '</text></g>';
      x += ancho + 16;
    });
    return marco(s + pie());
  } };
}

function escenaCategoria(D, cat, n, total) {
  return { dur: 1.7, quieto: (t) => t > 0.7, dibujar(t) {
    const k = ease(t / 0.45), x = BX + (1 - k) * 200;
    const tam = ajustar(cat.nombre, 150, 960, 0.6);
    let s = '<g opacity="' + k.toFixed(2) + '">'
      + '<text x="' + x + '" y="820" font-size="52" font-weight="800" letter-spacing="6" fill="' + COL.oro + '">CATEGORÍA</text>'
      + '<text x="' + x + '" y="' + (830 + tam) + '" font-size="' + tam + '" font-weight="900" fill="#fff">' + esc(cat.nombre) + '</text>'
      + '<rect x="' + x + '" y="' + (880 + tam) + '" width="' + (180 * k).toFixed(0) + '" height="10" rx="5" fill="' + COL.oro + '"/>'
      + '<text x="' + x + '" y="' + (960 + tam) + '" font-size="36" font-weight="600" fill="' + COL.gris + '">' + n + ' de ' + total + (cat.jugadores ? ' · ' + cat.jugadores + (cat.equipos ? ' equipos' : ' jugadores') : '') + '</text></g>';
    return marco(pildora(BX, 40, 'Resumen del torneo') + '<text x="' + BX + '" y="150" font-size="' + ajustar(D.nombre, 46, 960, 0.55) + '" font-weight="800" fill="#fff">' + esc(D.nombre) + '</text>' + s + pie());
  } };
}

function escenaPodio(D, cat, varias) {
  const P = cat.podio, base = 1560 - 120;
  const col = [{ i: 1, x: 220, h: 300, g: 'plataG', c: COL.plata }, { i: 0, x: 540, h: 430, g: 'oroG', c: COL.oro }, { i: 2, x: 860, h: 220, g: 'bronceG', c: COL.bronce }];
  const sube = { 2: 0.25, 1: 0.85, 0: 1.45 };   // el 3.º primero, el campeón al final
  const dur = varias ? 5.0 : 6.0;
  return { dur, quieto: (t) => t > 3.6, sonidos: [{ t: 1.6, festejo: true }], dibujar(t) {
    let s = encabezado(D, cat, cat.equipos ? 'Podio por equipos' : 'El podio', t);
    for (const c of col) {
      const p = P[c.i]; if (!p) continue;
      const k = ease((t - sube[c.i]) / 0.55); if (k <= 0) continue;
      const h = c.h * k, ancho = c.i === 0 ? 300 : 280, x0 = c.x - ancho / 2, top = base - h;
      s += '<rect x="' + x0 + '" y="' + top.toFixed(1) + '" width="' + ancho + '" height="' + h.toFixed(1) + '" rx="18" fill="url(#' + c.g + ')"/>'
        + '<rect x="' + x0 + '" y="' + top.toFixed(1) + '" width="' + ancho + '" height="16" rx="8" fill="#fff" opacity="0.35"/>'
        + '<text x="' + c.x + '" y="' + (top + 150).toFixed(1) + '" text-anchor="middle" font-size="140" font-weight="900" fill="#0b1220" opacity="' + (0.55 * k).toFixed(2) + '">' + (c.i + 1) + '</text>';
      // la persona arriba del escalón
      const kp = pop((t - sube[c.i] - 0.3) / 0.45); if (kp <= 0.01) continue;
      const r = c.i === 0 ? 120 : 100, cy = top - r - 40;
      s += '<g transform="translate(' + c.x + ' ' + cy.toFixed(1) + ') scale(' + kp.toFixed(3) + ') translate(' + (-c.x) + ' ' + (-cy).toFixed(1) + ')">' + avatar(c.x, cy, r, p, c.c, cat.equipos);
      if (c.i === 0) s += '<text x="' + c.x + '" y="' + (cy - r - 20).toFixed(1) + '" text-anchor="middle" font-size="110" fill="' + COL.oro + '">♚</text>';
      s += '</g>';
      // bandera adentro del escalón (debajo del número); nombre y puntos ABAJO del podio (el 3.º es bajito: adentro no entran)
      const on = clamp((t - sube[c.i] - 0.5) / 0.3, 0, 1);
      s += '<g opacity="' + on.toFixed(2) + '">';
      if (p.bandera && !cat.equipos && h > 190) s += bandera(p, c.x - 30, top + 168, 40);
      const lineas = envolver(p.nombre, 290, 36, 0.52).slice(0, 3), tamN = lineas.length > 2 ? 30 : 36;
      let yN = base + 52;
      lineas.forEach((l) => { s += '<text x="' + c.x + '" y="' + yN + '" text-anchor="middle" font-size="' + tamN + '" font-weight="800" fill="#fff">' + esc(l) + '</text>'; yN += tamN + 6; });
      if (p.puntos) s += '<text x="' + c.x + '" y="' + (yN + 8) + '" text-anchor="middle" font-size="34" font-weight="800" fill="' + c.c + '">' + esc(p.puntos) + ' pts' + '</text>';
      s += '</g>';
    }
    // título del campeón + cómo se definió
    const oc = clamp((t - 2.0) / 0.4, 0, 1);
    if (P[0]) s += '<g opacity="' + oc.toFixed(2) + '"><text x="' + (W / 2) + '" y="345" text-anchor="middle" font-size="' + ajustar('Campeón: ' + P[0].nombre, 58, 960, 0.56) + '" font-weight="900" fill="#fff">' + esc('Campeón: ' + (P[0].titulo ? P[0].titulo + ' ' : '') + P[0].nombre) + '</text>'
      + (cat.definicion ? '<text x="' + (W / 2) + '" y="405" text-anchor="middle" font-size="36" font-weight="600" fill="' + COL.oro + '">' + esc(cat.definicion) + '</text>' : '') + '</g>';
    // papelitos
    if (t > 1.9 && t < 3.6) {
      const tt = t - 1.9;
      for (let k = 0; k < 40; k++) {
        const x = (k * 263) % W, vel = 380 + (k * 97) % 300, y = -40 + tt * vel - ((k * 53) % 200);
        if (y < -20 || y > base) continue;
        const colr = [COL.oro, '#fff', '#4f8fd6', COL.verde, '#e0607e'][k % 5], rot = (tt * 300 + k * 40) % 360;
        s += '<rect x="' + (x + Math.sin(tt * 3 + k) * 30).toFixed(1) + '" y="' + y.toFixed(1) + '" width="16" height="26" fill="' + colr + '" opacity="0.9" transform="rotate(' + rot.toFixed(0) + ' ' + x + ' ' + y.toFixed(1) + ')"/>';
      }
    }
    return marco(s + pie());
  } };
}

// Una pantalla de la Radiografía (un ranking top 3, o los destacados): título grande y las filas entrando DE A UNA,
// con una pausa entre cada una para que se lleguen a leer.
const PAUSA_FILA = 1.7, QUEDA = 3.2;
function escenaPantalla(D, cat, P) {
  const filas = P.filas, n = filas.length;
  const alto = n > 3 ? 238 : 262, sep = n > 3 ? 22 : 34, y0 = 400 + Math.max(0, (3 - n)) * (alto + sep) / 2;
  const llegada = (i) => 0.9 + i * PAUSA_FILA;
  return { dur: llegada(n - 1) + QUEDA, quieto: (t) => t > llegada(n - 1) + 0.6, sonidos: filas.map((f, i) => ({ t: llegada(i) + 0.1, clic: false })), dibujar(t) {
    let s = encabezado(D, cat, 'Radiografía', t);
    const kt = ease((t - 0.15) / 0.5);
    s += '<text x="' + (BX + (1 - kt) * -80).toFixed(1) + '" y="' + (cat && cat.nombre ? 330 : 300) + '" font-size="' + ajustar(P.titulo, 64, 960, 0.55) + '" font-weight="900" fill="#fff" opacity="' + kt.toFixed(2) + '">' + esc(P.titulo) + '</text>';
    filas.forEach((it, i) => {
      const k = ease((t - llegada(i)) / 0.5); if (k <= 0) return;
      const y = y0 + i * (alto + sep) + (cat && cat.nombre ? 20 : 0), x = BX + (1 - k) * 700;
      s += '<g opacity="' + k.toFixed(2) + '"><rect x="' + x + '" y="' + y + '" width="' + S + '" height="' + alto + '" rx="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>'
        + '<rect x="' + x + '" y="' + y + '" width="10" height="' + alto + '" rx="5" fill="' + COL.oro + '"/>'
        + avatar(x + 115, y + alto / 2, 78, it, COL.oro, cat.equipos)
        + '<text x="' + (x + 230) + '" y="' + (y + 60) + '" font-size="29" font-weight="800" letter-spacing="2" fill="' + COL.oro + '">' + esc(String(it.etiqueta || '').toUpperCase()) + '</text>';
      const nl = envolver(it.nombre, 480, 42, 0.53).slice(0, 2);
      nl.forEach((l, j) => { s += '<text x="' + (x + 230) + '" y="' + (y + 112 + j * 46) + '" font-size="42" font-weight="800" fill="#fff">' + esc(l) + '</text>'; });
      if (it.detalle) {
        const dl = envolver(it.detalle, 470, 28, 0.5).slice(0, 2);
        dl.forEach((l, j) => { s += '<text x="' + (x + 230) + '" y="' + (y + 112 + nl.length * 46 + 8 + j * 34) + '" font-size="28" font-weight="600" fill="' + COL.gris + '">' + esc(l) + '</text>'; });
      }
      s += '<text x="' + (x + S - 34) + '" y="' + (y + alto / 2 + 18) + '" text-anchor="end" font-size="' + ajustar(it.dato, 74, 220, 0.6) + '" font-weight="900" fill="' + COL.oro + '">' + esc(it.dato) + '</text>'
        + (it.sub ? '<text x="' + (x + S - 34) + '" y="' + (y + alto / 2 + 60) + '" text-anchor="end" font-size="25" font-weight="600" fill="' + COL.gris + '">' + esc(it.sub) + '</text>' : '') + '</g>';
    });
    return marco(s + pie());
  } };
}

// Cartel antes de los jugadones ("Algunos jugadones del torneo").
function escenaCartelJugadones(D, cat, varias, n) {
  const titulo = varias ? (n > 1 ? 'Algunos jugadones de ' : 'Un jugadón de ') + cat.nombre : n > 1 ? 'Algunos jugadones del torneo' : 'Un jugadón del torneo';
  return { dur: 2.2, quieto: (t) => t > 1.2, dibujar(t) {
    const k = pop(t / 0.5), lineas = envolver(titulo, 900, 92, 0.55).slice(0, 3);
    let s = encabezado(D, null, 'Jugadones', t) + '<g transform="translate(' + (W / 2) + ' 860) scale(' + Math.max(0.01, k).toFixed(3) + ')">';
    for (let i = 0; i < 6; i++) s += estrella(Math.cos(i * 1.05 + t) * 380, -260 + Math.sin(i * 1.05 + t) * 120, 26, t * 0.8 + i, 0.8, i % 2 ? '#fff6c2' : '#ffd34d');
    lineas.forEach((l, i) => { s += '<text x="0" y="' + ((i - (lineas.length - 1) / 2) * 104 + 30).toFixed(0) + '" text-anchor="middle" font-size="92" font-weight="900" fill="' + (i === lineas.length - 1 ? COL.oro : '#fff') + '">' + esc(l) + '</text>'; });
    s += '</g>';
    if (CARAS.contento3) s += '<image href="' + CARAS.contento3 + '" x="' + (W / 2 - 160) + '" y="1260" width="320" height="' + (320 * 308 / 341).toFixed(0) + '" opacity="' + clamp(t / 0.5, 0, 1).toFixed(2) + '"/>';
    return marco(s + pie());
  } };
}

// El jugadón: la jugada anterior, "¿qué jugó?" y el jugadón con efectos.
function escenaJugadon(D, cat, J, n) {
  const tremendo = n % 2 === 1;   // uno sí y uno no: si no, el mismo "¡Qué jugadón!" se repite
  const BY = 420, C = S / 8, voltear = !J.blancas;
  const sq = (q) => { let f = 'abcdefgh'.indexOf(q[0]), r = 8 - +q[1]; if (voltear) { f = 7 - f; r = 7 - r; } return { x: BX + f * C, y: BY + r * C }; };
  // posiciones: antes, después de la jugada del rival, después del jugadón
  const ch = new Chess(J.fenAntes);
  const tablero = () => { const L = []; for (const fila of ch.board()) for (const p of fila) if (p) L.push({ c: p.color, t: p.type.toUpperCase(), sq: p.square }); return L; };
  const mov = (uci) => { const m = ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); return m; };
  const P0 = tablero(), m1 = mov(J.jug), P1 = tablero(), m2 = mov(J.sol), P2 = tablero();
  const num = +J.fen.split(' ')[5] || 1, sanTxt = num + (J.blancas ? '. ' : '… ') + esp(m2 ? m2.san : J.solSan);
  const T1 = 0.7, T2 = 2.3, TM = 0.45;   // cuándo arranca cada jugada
  const cuadros = (P, m, a) => {
    // P = posición de antes de m; a = avance 0..1
    let s1 = '', s2 = '';
    const capSq = m && m.captured ? (m.flags.includes('e') ? m.to[0] + m.from[1] : m.to) : null;
    const torre = m && (m.flags.includes('k') || m.flags.includes('q')) ? { de: (m.flags.includes('k') ? 'h' : 'a') + m.from[1], a: (m.flags.includes('k') ? 'f' : 'd') + m.from[1] } : null;
    for (const p of P) {
      const pz = (x, y, op, k, t2) => '<svg x="' + (x + C * (1 - k) / 2).toFixed(1) + '" y="' + (y + C * (1 - k) / 2).toFixed(1) + '" width="' + (C * k).toFixed(1) + '" height="' + (C * k).toFixed(1) + '" viewBox="0 0 45 45" opacity="' + op.toFixed(2) + '">' + PIEZAS[p.c + (t2 || p.t)] + '</svg>';
      if (m && p.sq === m.from) { const A = sq(m.from), B = sq(m.to), e = ease(a); s2 += pz(A.x + (B.x - A.x) * e, A.y + (B.y - A.y) * e, 1, 1 + 0.1 * Math.sin(Math.PI * a), m.promotion && a > 0.6 ? m.promotion.toUpperCase() : null); }
      else if (torre && p.sq === torre.de) { const A = sq(torre.de), B = sq(torre.a), e = ease(a); s2 += pz(A.x + (B.x - A.x) * e, A.y + (B.y - A.y) * e, 1, 1); }
      else if (capSq && p.sq === capSq) { const q = sq(p.sq); s1 += pz(q.x, q.y, clamp(1 - (a - 0.45) / 0.4, 0, 1), 1 - 0.25 * ease((a - 0.45) / 0.4)); }
      else { const q = sq(p.sq); s1 += pz(q.x, q.y, 1, 1); }
    }
    return s1 + s2;
  };
  const casillas = (marcadas, colorMarca) => {
    let s = '';
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const clara = (r + f) % 2 === 0, file = voltear ? 'hgfedcba'[f] : 'abcdefgh'[f], rank = voltear ? r + 1 : 8 - r, nom = file + rank;
      const marc = marcadas.includes(nom);
      s += '<rect x="' + (BX + f * C) + '" y="' + (BY + r * C) + '" width="' + (C + 0.5) + '" height="' + (C + 0.5) + '" fill="' + (marc ? (clara ? colorMarca[0] : colorMarca[1]) : clara ? COL.claro : COL.oscuro) + '"/>';
      const tinta = clara ? '#5d7790' : '#e8edf2';
      if (r === 7) s += '<text x="' + (BX + (f + 1) * C - 8) + '" y="' + (BY + S - 9) + '" text-anchor="end" font-size="22" font-weight="700" fill="' + tinta + '">' + file + '</text>';
      if (f === 0) s += '<text x="' + (BX + 8) + '" y="' + (BY + r * C + 26) + '" font-size="22" font-weight="700" fill="' + tinta + '">' + rank + '</text>';
    }
    return s;
  };
  return { dur: 7.2, quieto: (t) => t > 5.6, sonidos: [{ t: T1 + TM * 0.85, clic: m1 && m1.captured }, { t: T2 + TM * 0.85, clic: m2 && m2.captured }, { t: T2 + TM + 0.05, voz: tremendo ? 'tremendo' : 'jugadon' }], dibujar(t) {
    let s = encabezado(D, cat, 'Jugadón', t);
    s += '<text x="' + BX + '' + '" y="' + (cat && cat.nombre ? 262 : 222) + '" font-size="34" font-weight="600" fill="' + COL.gris + '">' + esc('Ronda ' + J.ronda + (J.mesa && !cat.equipos ? ' · mesa ' + J.mesa : '')) + '</text>';
    // barra del que juega (arriba del tablero)
    const contra = (J.quienElo ? J.quienElo + ' · ' : '') + 'contra ' + J.rival + (J.rivalElo ? ' (' + J.rivalElo + ')' : '');
    s += '<rect x="' + BX + '" y="290" width="' + S + '" height="114" rx="20" fill="rgba(255,255,255,0.08)"/>' + avatar(BX + 62, 347, 42, { nombre: J.quien, foto: J.foto }, J.blancas ? '#fff' : '#111')
      + '<text x="' + (BX + 125) + '" y="338" font-size="' + ajustar(J.quien, 40, 800, 0.55) + '" font-weight="800" fill="#fff">' + esc(J.quien) + '</text>'
      + '<text x="' + (BX + 125) + '" y="384" font-size="' + ajustar(contra, 29, 800, 0.5) + '" font-weight="600" fill="' + COL.gris + '">' + esc(contra) + '</text>';
    // tablero
    s += '<rect x="' + (BX - 4) + '" y="' + (BY + 6) + '" width="' + (S + 8) + '" height="' + (S + 8) + '" rx="24" fill="#000" opacity="0.35"/><clipPath id="tab"><rect x="' + BX + '" y="' + BY + '" width="' + S + '" height="' + S + '" rx="20"/></clipPath><g clip-path="url(#tab)">';
    let fase;
    if (t < T1) { s += casillas([], []) + cuadros(P0, null, 0); fase = 0; }
    else if (t < T2) { const a = clamp((t - T1) / TM, 0, 1); s += casillas(a >= 1 ? [m1.from, m1.to] : [], ['#f6f669', '#cdd16a']) + cuadros(P0, m1, a); fase = 1; }
    else { const a = clamp((t - T2) / TM, 0, 1); s += casillas(a >= 1 ? [m2.from, m2.to] : [], ['#9be7c9', '#5fc7a4']) + cuadros(P1, m2, a); fase = a >= 1 ? 3 : 2; }
    const th = t - T2 - TM;
    if (fase === 3) {
      const D2 = sq(m2.to), cx = D2.x + C / 2, cy = D2.y + C / 2;
      s += '<rect x="' + BX + '" y="' + BY + '" width="' + S + '" height="' + S + '" fill="url(#vig)" opacity="' + clamp(th / 0.4, 0, 1).toFixed(2) + '"/>';
      if (th < 2.6) for (let k = 0; k < 3; k++) { const ph = ((th * 1.25) + k / 3) % 1; s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (50 + ph * 230).toFixed(1) + '" fill="none" stroke="#ffd34d" stroke-width="' + (12 * (1 - ph) + 2).toFixed(1) + '" opacity="' + (0.95 * (1 - ph) * clamp((2.6 - th) / 0.4, 0, 1)).toFixed(2) + '"/>'; }
      const ptos = [[-1.9, -1.3], [1.8, -1.6], [-2.4, 0.9], [2.3, 1.2], [0.2, -2.3], [-0.7, 2.2], [1.1, 2.0], [-1.6, -2.1]];
      ptos.forEach(([dx, dy], k) => {
        const tw = th < 2.6 ? Math.max(0, Math.sin(th * 6 + k * 1.7)) : 0.6, px = clamp(cx + dx * C * 0.8, BX + 20, BX + S - 20), py = clamp(cy + dy * C * 0.8, BY + 20, BY + S - 20);
        if (th > 0.12 + k * 0.03) s += estrella(px, py, 14 + 16 * tw, (th < 2.6 ? th : 2.6) * 0.8 + k, 0.35 + 0.65 * tw, k % 2 ? '#fff6c2' : '#ffd34d');
      });
      const kc = pop(th / 0.4), yCartel = cy < BY + S / 2 ? BY + S - 150 : BY + 150;   // lejos de la casilla del jugadón
      s += '<g transform="translate(' + (BX + S / 2) + ' ' + yCartel + ') scale(' + Math.max(0.01, kc).toFixed(3) + ') rotate(-4)"><rect x="-320" y="-56" width="640" height="112" rx="30" fill="url(#oroG)" stroke="#fff" stroke-width="6"/>'
        + '<text x="0" y="26" text-anchor="middle" font-size="76" font-weight="900" fill="#3a2600">¡JUGADÓN!</text></g>';
    }
    s += '</g>';
    if (fase === 3 && th < 0.3) s += '<rect width="' + W + '" height="' + H + '" fill="#fff" opacity="' + (0.5 * (1 - th / 0.3)).toFixed(2) + '"/>';
    // abajo: la jugada + el Pupi
    const yP = BY + S + 40;
    if (fase >= 1 && fase < 3) s += '<text x="' + BX + '" y="' + (yP + 60) + '" font-size="52" font-weight="800" fill="#fff">' + esc(fase === 1 && t > T1 + TM + 0.2 ? '¿Qué jugó ' + J.quien.split(' ')[0] + '?' : '') + '</text>';
    if (fase === 3) s += '<text x="' + BX + '" y="' + (yP + 66) + '" font-size="76" font-weight="900" fill="' + COL.oro + '">' + esc(sanTxt) + '</text>';
    const caraPupi = fase === 3 ? (CARAS.contento3 || CARAS.contento) : (CARAS.explica || CARAS.contento);
    if (caraPupi) s += '<image href="' + caraPupi + '" x="' + (BX + 10) + '" y="' + (yP + 110) + '" width="250" height="' + (250 * 308 / 341).toFixed(0) + '"/>';
    const globo = fase === 3 ? (tremendo ? '¡Tremendooo, ' + J.quien.split(' ')[0] + '!' : '¡Qué jugadón de ' + J.quien.split(' ')[0] + '!') : fase >= 1 ? 'Atenti a esta posición…' : '';
    if (globo) {
      const gx = BX + 290, gy = yP + 150, gw = S - 290;
      s += '<path d="M ' + (gx + 14) + ' ' + (gy + 48) + ' l -34 22 l 34 22 z" fill="rgba(255,255,255,0.13)"/><rect x="' + gx + '" y="' + gy + '" width="' + gw + '" height="120" rx="26" fill="rgba(255,255,255,0.13)" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>'
        + '<text x="' + (gx + 34) + '" y="' + (gy + 74) + '" font-size="' + ajustar(globo, 40, gw - 60, 0.52) + '" font-weight="800" fill="' + (fase === 3 ? '#7df0d6' : '#fff') + '">' + esc(globo) + '</text>';
    }
    return marco(s + pie());
  } };
}

function escenaCierre(D) {
  return { dur: 4.5, quieto: (t) => t > 1.0, dibujar(t) {
    const k = pop(t / 0.5), o = clamp(t / 0.4, 0, 1);
    let s = pildora(BX, 40, 'Resumen del torneo');
    s += '<g opacity="' + o.toFixed(2) + '">';
    const lineas = envolver(D.nombre, S, 56, 0.55).slice(0, 3);
    lineas.forEach((l, i) => { s += '<text x="' + (W / 2) + '" y="' + (330 + i * 66) + '" text-anchor="middle" font-size="56" font-weight="900" fill="#fff">' + esc(l) + '</text>'; });
    s += '<g transform="translate(' + (W / 2) + ' 860) scale(' + Math.max(0.01, k).toFixed(3) + ')"><image href="' + LOGO + '" x="-170" y="-170" width="340" height="340"/></g>'
      + '<text x="' + (W / 2) + '" y="1180" text-anchor="middle" font-size="42" font-weight="700" fill="' + COL.gris + '">Todas las partidas, la Radiografía</text>'
      + '<text x="' + (W / 2) + '" y="1236" text-anchor="middle" font-size="42" font-weight="700" fill="' + COL.gris + '">completa y el análisis con el motor en</text>'
      + '<text x="' + (W / 2) + '" y="1330" text-anchor="middle" font-size="72" font-weight="900" fill="' + COL.oro + '">chessargentino.ar</text>';
    if (CARAS.chau) s += '<image href="' + CARAS.chau + '" x="' + (W / 2 - 150) + '" y="1440" width="300" height="' + (300 * 308 / 341).toFixed(0) + '"/>';
    return marco(s + '</g>');
  } };
}

// El guion entero del video.
function guion(D) {
  const varias = D.categorias.length > 1, E = [escenaPortada(D)];
  let nJug = 0;   // los jugadones alternan "¡Qué jugadón!" y "¡Tremendooo!" (audio y globo del Pupi)
  D.categorias.forEach((c, i) => {
    if (varias) E.push(escenaCategoria(D, c, i + 1, D.categorias.length));
    E.push(escenaPodio(D, c, varias));
    for (const p of c.pantallas || []) E.push(escenaPantalla(D, c, p));
    const jugs = [];
    for (const j of c.jugadones.slice(0, varias ? 1 : 3)) { try { jugs.push(escenaJugadon(D, c, j, nJug)); nJug++; } catch (e) { /* jugadón que no se puede reproducir: se saltea */ } }
    if (jugs.length) E.push(escenaCartelJugadones(D, c, varias, jugs.length), ...jugs);
  });
  E.push(escenaCierre(D));
  return E;
}

// ── principal ──
const [, , entrada, salida, ...flags] = isMainThread ? process.argv : ['', '', workerData.entrada];
const cargar = (x) => (/\.json$/i.test(x) && fs.existsSync(x) ? JSON.parse(fs.readFileSync(x, 'utf8')) : datosTorneo(x));

if (!isMainThread) {
  const E = guion(cargar(entrada));
  parentPort.on('message', (m) => { parentPort.postMessage({ i: m.i, buf: png(E[m.e].dibujar(m.t)) }); });
} else {
  if (!entrada || !salida) { console.log('Uso: node video-torneo.mjs <torneoId|datos.json> salida/video.mp4 [--musica m.mp3]   (o: salida --fotos)'); process.exit(1); }
  const D = cargar(entrada);
  // Los obreros reciben los datos ya armados (no vuelven a leer el manifest de 4 MB cada uno).
  const datosJson = path.join(os.tmpdir(), 'video-torneo-' + process.pid + '.json');
  fs.writeFileSync(datosJson, JSON.stringify(D));
  const E = guion(D);
  const cuadrosDe = (e) => Math.round(e.dur * FPS);
  const total = E.reduce((n, e) => n + cuadrosDe(e), 0);
  console.log(D.nombre, '·', D.categorias.length, 'categoría(s) ·', E.length, 'escenas · cuadros:', total, '· duración:', (total / FPS).toFixed(1) + ' s');

  if (flags.includes('--fotos')) {
    fs.mkdirSync(salida, { recursive: true });
    E.forEach((e, i) => { const f = path.join(salida, 'escena-' + String(i + 1).padStart(2, '0') + '.png'); fs.writeFileSync(f, png(e.dibujar(Math.min(e.dur - 0.05, e.dur * 0.8)), 540)); });
    console.log('Fotos en', salida); fs.unlinkSync(datosJson); process.exit(0);
  }
  const ffmpeg = buscarFfmpeg();
  if (!ffmpeg) { console.error('No encuentro ffmpeg. Instalalo con: winget install Gyan.FFmpeg'); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });

  // 1) Lista de cuadros: los quietos se dibujan una vez y se repiten.
  const trabajos = [], orden = [];
  let acum = 0;
  const sonidos = cargarSonidosPupi(path.join(ASSETS, 'pupi', 'sonidos')), eventos = [];
  E.forEach((e, ei) => {
    const n = cuadrosDe(e), t0 = acum / FPS; acum += n;
    for (const so of e.sonidos || []) {
      if (so.festejo) eventos.push({ t: t0 + so.t, muestras: sonidoFestejo, vol: 0.85, voz: true });
      else if (so.voz && sonidos[so.voz]) eventos.push({ t: t0 + so.t, muestras: sonidos[so.voz], vol: 0.9, voz: true });
      else if ('clic' in so) eventos.push({ t: t0 + so.t, muestras: so.clic ? sonidoClic.captura : sonidoClic.normal, vol: so.clic ? 0.5 : 0.35 });
    }
    let quietoYa = false;
    for (let k = 0; k < n; k++) {
      const t = k / FPS;
      if (quietoYa) { orden.push(trabajos.length - 1); continue; }
      trabajos.push({ e: ei, t }); orden.push(trabajos.length - 1);
      if (e.quieto && e.quieto(t)) quietoYa = true;
    }
  });
  console.log('A dibujar:', trabajos.length, 'de', total, 'cuadros');

  // 1b) Audio: música + los sonidos de las escenas.
  let audioWav = null;
  if (!flags.includes('--sin-audio')) {
    const iMus = flags.indexOf('--musica');
    audioWav = armarAudio({ duracion: total / FPS, eventos, musicaArchivo: iMus >= 0 ? flags[iMus + 1] : null, estilo: estiloDelDia(),
      salidaWav: path.join(path.dirname(path.resolve(salida)), 'audio-torneo-temporal.wav'), ffmpeg, spawnSync });
    console.log('Audio listo:', eventos.length, 'sonidos' + (iMus >= 0 ? ' + tu música' : ' + música: ' + ESTILOS[estiloDelDia()]));
  }

  // 2) Varios obreros dibujan en paralelo; el principal los junta en orden y se los pasa a ffmpeg.
  const nObreros = Math.max(1, Math.min(os.cpus().length - 1, 8));
  const obreros = Array.from({ length: nObreros }, () => new Worker(new URL(import.meta.url), { workerData: { entrada: datosJson } }));
  const listos = new Map(), VENTANA = nObreros * 3;
  let enviado = 0, escrito = 0;
  const t0 = Date.now();
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', ...(audioWav ? ['-i', audioWav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-shortest'] : []), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', salida], { stdio: ['pipe', 'inherit', 'inherit'] });
  const cerrado = new Promise((res) => ff.on('close', res));
  const lastUso = new Array(trabajos.length).fill(0); orden.forEach((j, f) => { lastUso[j] = f; });
  await new Promise((resolver, rechazar) => {
    let escribiendo = false;
    const repartir = () => {
      for (const o of obreros) {
        if (!o._libre || enviado >= trabajos.length) continue;
        if (enviado - orden[Math.min(escrito, total - 1)] >= VENTANA) break;
        o._libre = false; o.postMessage({ i: enviado, e: trabajos[enviado].e, t: trabajos[enviado].t }); enviado++;
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
      o.on('message', (m) => { listos.set(m.i, Buffer.from(m.buf)); o._libre = true; repartir(); vaciar(); });
    });
    repartir();
  });
  ff.stdin.end();
  obreros.forEach((o) => o.terminate());
  const cod = await cerrado;
  for (const f of [audioWav, datosJson]) if (f) try { fs.unlinkSync(f); } catch (e) { /* nada */ }
  console.log(cod === 0 ? '✅ Listo: ' + salida + ' (' + (fs.statSync(salida).size / 1e6).toFixed(1) + ' MB) en ' + Math.round((Date.now() - t0) / 1000) + ' s' : '❌ ffmpeg terminó con error ' + cod);
  process.exit(cod === 0 ? 0 : 1);
}
