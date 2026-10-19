// 🎵 Audio del video "Un día como hoy": música tenue + sonidos del Pupi + clics de las piezas.
// La música se SINTETIZA (ver musica.mjs: 6 estilos que rotan por día, sin samples de nadie): es original, sin derechos de autor.
// Los sonidos del Pupi son los de la web (assets/pupi/sonidos). Todo se mezcla en un .wav estéreo de 44,1 kHz.
//
// Música propia en vez de la sintetizada:  node video-hoy.mjs partida.json salida.mp4 --musica mi-cancion.mp3
import fs from 'node:fs';
import path from 'node:path';
import { musicaEstilo, estiloDelDia, ESTILOS } from './musica.mjs';
export { estiloDelDia, ESTILOS };

const SR = 44100;

// ── WAV mono 16 bits (los del Pupi) → Float32 a 44,1 kHz ──
function leerWav(ruta) {
  const b = fs.readFileSync(ruta);
  let pos = 12, fmt = null, datos = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4), n = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { canales: b.readUInt16LE(pos + 10), hz: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    if (id === 'data') datos = b.subarray(pos + 8, pos + 8 + n);
    pos += 8 + n + (n % 2);
  }
  if (!fmt || !datos || fmt.bits !== 16) throw new Error('WAV no soportado: ' + ruta);
  const total = Math.floor(datos.length / 2 / fmt.canales), mono = new Float32Array(total);
  for (let i = 0; i < total; i++) { let acc = 0; for (let c = 0; c < fmt.canales; c++) acc += datos.readInt16LE((i * fmt.canales + c) * 2) / 32768; mono[i] = acc / fmt.canales; }
  if (fmt.hz === SR) return mono;
  const k = SR / fmt.hz, out = new Float32Array(Math.floor(total * k));
  for (let i = 0; i < out.length; i++) { const x = i / k, i0 = Math.floor(x), f = x - i0; out[i] = mono[i0] * (1 - f) + (mono[Math.min(total - 1, i0 + 1)] * f); }
  return out;
}

// ── clics de las piezas (sintetizados) ──
function clic(captura) {
  const dur = captura ? 0.11 : 0.07, n = Math.floor(dur * SR), out = new Float32Array(n);
  let ruido = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = Math.exp(-t * (captura ? 38 : 70));
    ruido = Math.sin(i * 12.9898) * 43758.5453; ruido -= Math.floor(ruido); ruido = ruido * 2 - 1;
    y += 0.35 * (ruido - y);   // pasabajos suave: sonido de madera
    out[i] = (y * 0.8 + Math.sin(2 * Math.PI * (captura ? 170 : 260) * t) * 0.6) * e;
  }
  return out;
}

// ── mezcla ──
// eventos: [{ t, muestras: Float32Array, vol, voz: bool }]
export function armarAudio({ duracion, eventos, musicaArchivo, estilo, salidaWav, ffmpeg, spawnSync }) {
  const N = Math.ceil(duracion * SR);
  let mL, mR;
  if (musicaArchivo) {
    // música del autor: se decodifica con ffmpeg a PCM estéreo 44,1 kHz y se ajusta al largo del video (en bucle si es corta)
    const tmp = salidaWav + '.musica.raw';
    const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-stream_loop', '-1', '-i', musicaArchivo, '-t', String(duracion), '-f', 's16le', '-ac', '2', '-ar', String(SR), tmp]);
    if (r.status !== 0) throw new Error('No pude leer la música: ' + musicaArchivo);
    const raw = fs.readFileSync(tmp); fs.unlinkSync(tmp);
    mL = new Float32Array(N); mR = new Float32Array(N);
    for (let i = 0; i < N && i * 4 + 3 < raw.length; i++) { const f = Math.min(1, (i / SR) / 2) * Math.min(1, (duracion - i / SR) / 3); mL[i] = raw.readInt16LE(i * 4) / 32768 * f * 0.6; mR[i] = raw.readInt16LE(i * 4 + 2) / 32768 * f * 0.6; }
  } else [mL, mR] = musicaEstilo(duracion, estilo == null ? estiloDelDia() : estilo);

  // la música baja mientras habla el Pupi
  const duck = new Float32Array(N).fill(1);
  for (const e of eventos) if (e.voz) {
    const i0 = Math.floor(e.t * SR), i1 = Math.min(N, i0 + e.muestras.length), rampa = Math.floor(0.12 * SR);
    for (let i = Math.max(0, i0 - rampa); i < Math.min(N, i1 + rampa * 3); i++) {
      const d = i < i0 ? (i0 - i) / rampa : i > i1 ? (i - i1) / (rampa * 3) : 0;
      duck[i] = Math.min(duck[i], 0.35 + 0.65 * clampN(d));
    }
  }
  const MUSICA = 0.16;   // bien tenue
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) { L[i] = mL[i] * MUSICA * duck[i]; R[i] = mR[i] * MUSICA * duck[i]; }
  for (const e of eventos) {
    const i0 = Math.floor(e.t * SR);
    for (let k = 0; k < e.muestras.length && i0 + k < N; k++) { const v = e.muestras[k] * e.vol; L[i0 + k] += v; R[i0 + k] += v; }
  }
  // WAV estéreo 16 bits, con un limitador suave
  const out = Buffer.alloc(44 + N * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(Math.tanh(L[i]) * 32000), 44 + i * 4); out.writeInt16LE(Math.round(Math.tanh(R[i]) * 32000), 46 + i * 4); }
  fs.writeFileSync(salidaWav, out);
  return salidaWav;
}
const clampN = (x) => Math.min(1, Math.max(0, x));

export function cargarSonidosPupi(dir) {
  const S = {};
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.wav')) S[f.replace(/\d*\.wav$/, '')] = leerWav(path.join(dir, f));
  return S;
}
export const sonidoClic = { normal: clic(false), captura: clic(true) };
