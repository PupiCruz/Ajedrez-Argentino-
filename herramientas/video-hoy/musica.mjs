// 🎵 Músicas de fondo del video "Un día como hoy": 6 estilos SINTETIZADOS acá mismo (original, sin samples ni temas
// de nadie → sin derechos de autor). El estilo rota solo según el día del año, así los videos no suenan siempre igual.
//   0 Arpegio sereno · 1 Milonga · 2 Lo-fi · 3 Cuerdas de cine · 4 Zamba · 5 Piano de salón
// Para forzar uno:  node video-hoy.mjs partida.json salida.mp4 --estilo 2
const SR = 44100;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const TAU = Math.PI * 2;
const rngDe = (semilla) => () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);

export const ESTILOS = ['Arpegio sereno', 'Milonga', 'Lo-fi', 'Cuerdas de cine', 'Zamba', 'Piano de salón'];

// Qué estilo toca hoy (hora argentina, UTC-3): uno por día, dando la vuelta.
export function estiloDelDia(ahora = Date.now()) {
  const d = new Date(ahora - 3 * 3600e3);
  const dia = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5);
  return dia % ESTILOS.length;
}

// ── el "estudio": buffers estéreo + voces ──
function estudio(seg) {
  const N = Math.ceil(seg * SR), L = new Float32Array(N), R = new Float32Array(N);
  const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
  const poner = (t0, muestra, amp, p = 0) => {   // muestra(t) o Float32Array
    const [gl, gr] = pan(p), i0 = Math.floor(t0 * SR);
    if (i0 >= N) return;
    const n = muestra.length;
    for (let i = 0; i < n && i0 + i < N; i++) { const v = muestra[i] * amp; L[i0 + i] += v * gl; R[i0 + i] += v * gr; }
  };
  // Una nota con forma de onda según el timbre. Devuelve las muestras (ya con su envolvente).
  const timbre = (tipo, f, dur) => {
    const n = Math.floor(dur * SR), o = new Float32Array(n), w = TAU * f;
    for (let i = 0; i < n; i++) {
      const t = i / SR; let e = 1, v = 0;
      switch (tipo) {
        case 'pluck': e = Math.exp(-t * 4.2) * Math.min(1, t / 0.004); v = Math.sin(w * t) + 0.32 * Math.sin(2 * w * t) * Math.exp(-t * 3) + 0.1 * Math.sin(3 * w * t) * Math.exp(-t * 6); break;
        case 'bajo': e = Math.exp(-t * 0.9) * Math.min(1, t / 0.05); v = Math.sin(w * t) + 0.15 * Math.sin(2 * w * t); break;
        case 'bajoCorto': e = Math.exp(-t * 5) * Math.min(1, t / 0.01); v = Math.sin(w * t) + 0.3 * Math.sin(2 * w * t); break;
        case 'pad': { const a = Math.min(1, t / 0.9), r = Math.min(1, (dur - t) / 0.9); e = Math.sin(a * Math.PI / 2) ** 2 * Math.sin(r * Math.PI / 2) ** 2; v = Math.sin(w * t) + 0.8 * Math.sin(w * 1.003 * t) + 0.2 * Math.sin(2 * w * t + 1); break; }
        case 'rhodes': e = Math.exp(-t * 2.1) * Math.min(1, t / 0.004); v = Math.sin(w * t + 1.4 * Math.exp(-t * 4) * Math.sin(2 * w * t)) + 0.12 * Math.sin(7 * w * t) * Math.exp(-t * 14); break;
        case 'piano': e = Math.min(1, t / 0.003) * Math.min(1, (dur - t) / 0.25); v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(h * w * t + h) * Math.exp(-t * (1.1 + 0.55 * h)) / h; v *= 1.2; break;
        case 'cuerdas': { const a = Math.min(1, t / 1.0), r = Math.min(1, (dur - t) / 1.3), vib = 1 + 0.0035 * Math.sin(TAU * 5.1 * t) * Math.min(1, t / 1.5);
          e = Math.sin(a * Math.PI / 2) ** 2 * Math.sin(r * Math.PI / 2) ** 2; v = 0;
          for (let h = 1; h <= 6; h++) v += (Math.sin(h * w * vib * t) + Math.sin(h * w * 1.004 * vib * t + 0.7) * 0.9) / h; v *= 0.5; break; }
        case 'fuelle': { const a = Math.min(1, t / 0.14), r = Math.min(1, (dur - t) / 0.3), vib = 1 + 0.0045 * Math.sin(TAU * 5.3 * t) * Math.min(1, t / 0.5);
          e = a * r * (0.85 + 0.15 * Math.sin(TAU * 0.9 * t)); v = 0;
          for (let h = 1; h <= 9; h++) v += Math.sin(h * w * vib * t) * (h % 2 ? 1 : 0.45) / h; v *= 0.75; break; }
        case 'flauta': { const a = Math.min(1, t / 0.08), r = Math.min(1, (dur - t) / 0.18), vib = 1 + 0.005 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.4);
          e = a * r; v = Math.sin(w * vib * t) + 0.12 * Math.sin(2 * w * vib * t); break; }
        default: v = Math.sin(w * t);
      }
      o[i] = v * e;
    }
    return o;
  };
  // Cuerda de guitarra (Karplus-Strong): suena a nailon.
  const guitarra = (f, dur, semilla) => {
    const n = Math.floor(dur * SR), len = Math.max(2, Math.round(SR / f)), buf = new Float32Array(len), o = new Float32Array(n), r = rngDe(semilla);
    for (let i = 0; i < len; i++) buf[i] = r() * 2 - 1;
    let k = 0;
    for (let i = 0; i < n; i++) { const a = buf[k], b = buf[(k + 1) % len]; buf[k] = (a + b) * 0.5 * 0.9965; o[i] = a; k = (k + 1) % len; }
    const salida = new Float32Array(n);
    let y = 0; for (let i = 0; i < n; i++) { y += 0.55 * (o[i] - y); salida[i] = y * Math.min(1, (n - i) / (0.15 * SR)); }   // pasabajos suave
    return salida;
  };
  // Percusión
  const bombo = () => { const n = Math.floor(0.28 * SR), o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * (45 + 90 * Math.exp(-t * 28)) / SR; o[i] = Math.sin(ph) * Math.exp(-t * 11); } return o; };
  const hat = (largo = 0.05) => { const n = Math.floor(largo * SR), o = new Float32Array(n), r = rngDe(7); let ant = 0; for (let i = 0; i < n; i++) { const x = r() * 2 - 1; o[i] = (x - ant) * Math.exp(-i / SR * (1 / largo * 5)); ant = x; } return o; };
  const caja = () => { const n = Math.floor(0.16 * SR), o = new Float32Array(n), r = rngDe(11); let y = 0; for (let i = 0; i < n; i++) { const t = i / SR; y += 0.6 * ((r() * 2 - 1) - y); o[i] = (y * 0.8 + Math.sin(TAU * 190 * t) * 0.4) * Math.exp(-t * 24); } return o; };
  const timbal = () => { const n = Math.floor(1.4 * SR), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (Math.sin(TAU * 78 * t * (1 + 0.15 * Math.exp(-t * 8))) + 0.4 * Math.sin(TAU * 117 * t)) * Math.exp(-t * 3.2) * Math.min(1, t / 0.006); } return o; };
  const nota = (t0, dur, midiNota, amp, tipo, p = 0) => poner(t0, timbre(tipo, midi(midiNota), dur), amp, p);

  // Reverb sencilla (peines con realimentación, distintos a izquierda y derecha) y cierre: pico a 0,6 + fundidos.
  const terminar = (mojado = 0.2) => {
    // Ecos cortos y distintos a cada lado: dan "sala" sin que se embarre.
    const wl = new Float32Array(N), wr = new Float32Array(N);
    const eco = (src, dst, retardos, g) => { for (const d of retardos) for (let i = d; i < N; i++) dst[i] += src[i - d] * g; };
    eco(L, wl, [1557, 2111, 2803, 3517, 4421, 5683, 7919, 10007], 0.16); eco(R, wr, [1617, 2237, 2909, 3671, 4567, 5821, 8089, 10211], 0.16);
    for (let i = 0; i < N; i++) { L[i] += wl[i] * mojado * 2; R[i] += wr[i] * mojado * 2; }
    let pico = 0; for (let i = 0; i < N; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
    const g = 0.6 / (pico || 1);
    for (let i = 0; i < N; i++) { const t = i / SR, f = Math.min(1, t / 2) * Math.min(1, (seg - t) / 3.5); L[i] *= g * f; R[i] *= g * f; }
    return [L, R];
  };
  return { N, poner, nota, timbre, guitarra, bombo, hat, caja, timbal, terminar };
}

// ── 0 · Arpegio sereno (La menor 7 · Fa mayor 7 · Do mayor 7 · Sol 6) ──
function arpegioSereno(seg) {
  const E = estudio(seg), beat = 60 / 72, compas = 4 * beat, total = Math.ceil(seg / compas) + 1;
  const ACORDES = [{ bajo: 45, notas: [57, 60, 64, 67] }, { bajo: 41, notas: [53, 57, 60, 64] }, { bajo: 48, notas: [60, 64, 67, 71] }, { bajo: 43, notas: [55, 59, 62, 64] }];
  const patron = [0, 2, 1, 3, 2, 1, 3, 2];
  for (let c = 0; c < total; c++) {
    const ac = ACORDES[c % 4], t0 = c * compas;
    E.nota(t0, compas + 0.9, ac.bajo, 0.34, 'bajo');
    ac.notas.slice(0, 3).forEach((n, k) => E.nota(t0 - 0.4, compas + 0.9, n, 0.085, 'pad', k - 1 ? 0.3 : -0.3));
    for (let k = 0; k < 8; k++) E.nota(t0 + k * beat / 2 + (k % 2 ? 0.012 : 0), 1.6, ac.notas[patron[k]] + 12, 0.16 * (k % 4 === 0 ? 1 : 0.7), 'pluck', (k % 4 - 1.5) * 0.25);
  }
  return E.terminar(0.35);
}

// ── 1 · Milonga (2/4, habanera en el bajo, bandoneón en re menor) ──
function milonga(seg) {
  const E = estudio(seg), beat = 60 / 88, compas = 2 * beat, total = Math.ceil(seg / compas) + 2;
  // Dm Dm Gm Gm A7 A7 Dm A7  (raíz del bajo, quinta, notas del acorde)
  const A = [[38, 45, [57, 62, 65]], [38, 45, [57, 62, 65]], [43, 50, [58, 62, 67]], [43, 50, [58, 62, 67]], [45, 52, [55, 61, 64]], [45, 52, [55, 61, 64]], [38, 45, [57, 62, 65]], [45, 52, [55, 61, 64]]];
  const melodia = [[[69, 0, 1.5], [65, 1.5, 0.5]], [[74, 0, 2]], [[70, 0, 1], [69, 1, 1]], [[67, 0, 2]], [[69, 0, 0.75], [73, 0.75, 0.25], [76, 1, 1]], [[74, 0, 1.5], [73, 1.5, 0.5]], [[74, 0, 1], [77, 1, 1]], [[76, 0, 1], [73, 1, 1]]];
  for (let c = 0; c < total; c++) {
    const [raiz, quinta, acorde] = A[c % 8], t0 = c * compas;
    // habanera: 0 · 0,75 · 1 · 1,5 (en la 1.ª y la 3.ª, raíz; en las otras, quinta)
    [[0, raiz], [0.75, quinta], [1, raiz], [1.5, quinta]].forEach(([b, n]) => E.nota(t0 + b * beat, 0.55, n, 0.3, 'bajoCorto'));
    // rasguido del acorde en 0,5 y 1,25 (cuerda corta)
    [0.5, 1.25].forEach((b) => acorde.forEach((n, k) => E.nota(t0 + b * beat + k * 0.012, 0.5, n, 0.075, 'pluck', k - 1 ? 0.35 : -0.35)));
    if (c % 8 === 0) acorde.forEach((n) => E.nota(t0, compas * 8 + 0.6, n - 12, 0.05, 'pad'));
    for (const [n, b, d] of melodia[c % 8]) E.nota(t0 + b * beat, d * beat * 0.97 + 0.1, n, 0.2, 'fuelle', 0.15);
  }
  return E.terminar(0.3);
}

// ── 2 · Lo-fi (80 bpm: piano eléctrico, bombo, hi-hat con swing) ──
function lofi(seg) {
  const E = estudio(seg), beat = 60 / 80, compas = 4 * beat, total = Math.ceil(seg / compas) + 1, r = rngDe(2026);
  const A = [[38, [53, 57, 60, 64]], [43, [53, 59, 62, 65]], [36, [52, 55, 59, 62]], [45, [52, 55, 60, 64]]];   // Dm9 · G7 · Cmaj7 · Am7
  const pentatonica = [62, 65, 67, 69, 72, 74, 77];
  const kick = E.bombo(), h = E.hat(0.045), sn = E.caja();
  for (let c = 0; c < total; c++) {
    const [raiz, acorde] = A[c % 4], t0 = c * compas;
    E.nota(t0, compas * 0.95, raiz, 0.3, 'bajo');
    [0, 2.5].forEach((b) => acorde.forEach((n, k) => E.nota(t0 + b * beat + k * 0.018, 1.8, n, 0.09, 'rhodes', k % 2 ? 0.25 : -0.25)));
    E.poner(t0, kick, 0.5); E.poner(t0 + 2.5 * beat, kick, 0.38);
    E.poner(t0 + beat, sn, 0.18); E.poner(t0 + 3 * beat, sn, 0.18);
    for (let k = 0; k < 8; k++) E.poner(t0 + (k + (k % 2 ? 0.16 : 0)) * beat / 2, h, k % 2 ? 0.07 : 0.11, 0.2);
    // melodia suelta
    for (const b of [0.5, 1.5, 2, 3, 3.5]) if (r() < 0.42) E.nota(t0 + b * beat, 1.2, pentatonica[Math.floor(r() * pentatonica.length)], 0.11, 'rhodes', 0.3);
  }
  return E.terminar(0.25);
}

// ── 3 · Cuerdas de cine (56 bpm: Do menor · La bemol · Mi bemol · Si bemol) ──
function cuerdasDeCine(seg) {
  const E = estudio(seg), beat = 60 / 56, compas = 4 * beat, total = Math.ceil(seg / compas) + 2;
  const A = [[36, [60, 63, 67]], [32, [60, 63, 68]], [39, [58, 63, 67]], [34, [58, 62, 65]]];
  const mel = [67, 68, 70, 67, 63, 65, 67, 62];   // una nota larga cada dos compases... sube y baja
  const timp = E.timbal();
  for (let c = 0; c < total; c++) {
    const [raiz, acorde] = A[c % 4], t0 = c * compas;
    E.nota(t0 - 0.2, compas + 1.2, raiz, 0.3, 'cuerdas', -0.2);
    E.nota(t0 - 0.3, compas + 1.3, raiz + 12, 0.14, 'cuerdas', 0.2);
    acorde.forEach((n, k) => E.nota(t0 - 0.4, compas + 1.4, n, 0.1, 'cuerdas', (k - 1) * 0.45));
    if (c % 2 === 0) { E.nota(t0 + 0.2, compas * 2 - 0.4, mel[(c / 2) % mel.length] + 12, 0.16, 'cuerdas', 0.1); E.poner(t0, timp, 0.32); }
    [1, 2, 3].forEach((b) => E.nota(t0 + b * beat, 2.4, acorde[b - 1] + 24, 0.06, 'pluck', 0.5));   // arpa, muy suave
  }
  return E.terminar(0.4);
}

// ── 4 · Zamba (6/8, guitarra de nailon y flauta, sol mayor) ──
function zamba(seg) {
  const E = estudio(seg), corchea = 0.19, compas = 6 * corchea, total = Math.ceil(seg / compas) + 2;
  // G · Em · C · D · G · Em · Am · D   (bajo, quinta, acorde)
  const A = [[43, 50, [59, 62, 67]], [40, 47, [59, 64, 67]], [36, 43, [60, 64, 67]], [38, 45, [57, 62, 66]], [43, 50, [59, 62, 67]], [40, 47, [59, 64, 67]], [45, 52, [57, 60, 64]], [38, 45, [57, 62, 66]]];
  const mel = [[[71, 0, 3], [74, 3, 3]], [[76, 0, 3], [71, 3, 3]], [[72, 0, 3], [76, 3, 3]], [[74, 0, 6]], [[79, 0, 3], [76, 3, 3]], [[74, 0, 3], [71, 3, 3]], [[72, 0, 3], [69, 3, 3]], [[74, 0, 6]]];
  let sem = 5;
  for (let c = 0; c < total; c++) {
    const [raiz, quinta, acorde] = A[c % 8], t0 = c * compas;
    E.poner(t0, E.guitarra(midi(raiz), 1.2, sem++), 0.45, -0.2);
    E.poner(t0 + 3 * corchea, E.guitarra(midi(quinta), 1.0, sem++), 0.36, -0.2);
    [2, 5].forEach((b) => acorde.forEach((n, k) => E.poner(t0 + b * corchea + k * 0.02, E.guitarra(midi(n), 0.6, sem++), 0.2, 0.15 + k * 0.1)));
    for (const [n, b, d] of mel[c % 8]) E.nota(t0 + b * corchea, d * corchea * 0.95 + 0.08, n, 0.13, 'flauta', 0.3);
  }
  return E.terminar(0.28);
}

// ── 5 · Piano de salón (3/4, do mayor, melodía que camina por las notas del acorde) ──
function pianoDeSalon(seg) {
  const E = estudio(seg), beat = 60 / 72, compas = 3 * beat, total = Math.ceil(seg / compas) + 2, r = rngDe(77);
  // C · Am · F · G · C · Em · Dm · G
  const A = [[36, [55, 60, 64], [72, 76, 79, 84]], [33, [57, 60, 64], [69, 72, 76, 81]], [29, [53, 57, 60], [69, 72, 77, 81]], [31, [55, 59, 62], [71, 74, 79, 83]],
    [36, [55, 60, 64], [72, 76, 79, 84]], [40, [55, 59, 64], [71, 76, 79, 83]], [38, [53, 57, 62], [69, 74, 77, 81]], [31, [55, 59, 62], [71, 74, 79, 83]]];
  let idx = 1;
  for (let c = 0; c < total; c++) {
    const [raiz, acorde, arriba] = A[c % 8], t0 = c * compas;
    E.nota(t0, compas * 1.1, raiz, 0.34, 'piano', -0.2);
    [1, 2].forEach((b) => acorde.forEach((n, k) => E.nota(t0 + b * beat + k * 0.01, 1.4, n, 0.085, 'piano', -0.05 + k * 0.05)));
    for (let b = 0; b < 3; b++) {
      if (r() < 0.2) continue;   // un respiro
      idx = Math.max(0, Math.min(arriba.length - 1, idx + Math.floor(r() * 3) - 1));
      E.nota(t0 + b * beat, 2.2, arriba[idx], b === 0 ? 0.2 : 0.14, 'piano', 0.25);
    }
  }
  return E.terminar(0.3);
}

const GENERADORES = [arpegioSereno, milonga, lofi, cuerdasDeCine, zamba, pianoDeSalon];
export function musicaEstilo(seg, estilo) { return GENERADORES[((estilo % GENERADORES.length) + GENERADORES.length) % GENERADORES.length](seg); }
