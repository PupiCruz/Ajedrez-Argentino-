// 🎬 El armador de videos ("Un día como hoy", partidas elegidas con /video y resúmenes de torneo): queda abierto en esta PC, le pregunta al bot cada 15 segundos si hay un
// video pedido (botón 🎬 Video de /hoy), lo arma y se lo entrega al bot, que te lo manda por Telegram.
// Se abre con "armar-videos.cmd" (en la carpeta ajedrez-argentino).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cosechar } from './cosechar.mjs';
import { datosTorneo } from './torneo-datos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PUPI_WORKER || 'https://ajedrez-vivo.mmatiasscruz.workers.dev';
const SALIDA = path.join(AQUI, 'salida');
const hora = () => new Date().toLocaleTimeString('es-AR');
const log = (m) => console.log('[' + hora() + '] ' + m);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// La clave es la misma que usa el bot para publicar (vivo-worker/.dev.vars o la variable PUBLICAR_CLAVE).
function leerClave() {
  if (process.env.PUBLICAR_CLAVE) return process.env.PUBLICAR_CLAVE.trim();
  const f = path.resolve(AQUI, '../../../vivo-worker/.dev.vars');
  try { const m = /^PUBLICAR_CLAVE\s*=\s*"?([^"\r\n]+)"?/m.exec(fs.readFileSync(f, 'utf8')); if (m) return m[1].trim(); } catch (e) { /* abajo */ }
  return null;
}
const CLAVE = leerClave();
if (!CLAVE) { console.error('No encuentro la clave del bot (PUBLICAR_CLAVE). Tiene que estar en vivo-worker\\.dev.vars'); process.exit(1); }

async function api(ruta, cuerpo) {
  const r = await fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ clave: CLAVE }, cuerpo || {})) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !j.ok) throw new Error((j && j.error) || 'HTTP ' + r.status);
  return j;
}
const avisar = (id, texto, error) => api('/tg/hoyvideo/estado', { id, texto, error: !!error }).catch((e) => log('(no pude avisar: ' + e.message + ')'));

function correr(args, etiqueta) {
  return new Promise((resolver, rechazar) => {
    const p = spawn(process.execPath, args, { cwd: AQUI, stdio: ['ignore', 'pipe', 'pipe'] });
    let ult = '';
    p.stdout.on('data', (d) => { ult = String(d).trim().split('\n').pop(); if (/^\d+\/\d+/.test(ult) || /Listo|Audio|A dibujar/.test(ult)) log(etiqueta + ': ' + ult); });
    p.stderr.on('data', (d) => { ult = String(d).trim().split('\n').pop(); });
    p.on('close', (c) => (c === 0 ? resolver() : rechazar(new Error(etiqueta + ' terminó con error ' + c + ': ' + ult))));
  });
}

// 🎵 La música: cualquier archivo de esta carpeta que empiece con "musica" (musica.mp3, musica1.mp3, musica2.m4a…).
// Se elige uno al azar en cada video, sin repetir el del video anterior (si hay más de uno). Sin ninguno, va la sintetizada.
let ultimaMusica = null;
function elegirMusica() {
  const temas = fs.readdirSync(AQUI).filter((f) => /^musica.*.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f)).map((f) => path.join(AQUI, f));
  if (!temas.length) return null;
  const otros = temas.length > 1 ? temas.filter((f) => f !== ultimaMusica) : temas;
  ultimaMusica = otros[Math.floor(Math.random() * otros.length)];
  return ultimaMusica;
}

async function procesar(job) {
  const titulo = job.titulo || job.id;
  log('Pedido: ' + titulo + ' (' + job.id + ')');
  const tmp = path.join(SALIDA, 'pedido-' + job.id.replace(/[^0-9a-z]+/gi, '_'));
  fs.mkdirSync(SALIDA, { recursive: true });
  const musica = elegirMusica();
  if (musica) log('Música: ' + path.basename(musica));
  if (job.tipo === 'torneo') {
    // 🏆 Resumen del torneo: sale de los datos guardados en esta carpeta (podio, Radiografía, jugadones), sin analizar nada.
    let D;
    try { D = datosTorneo(job.t); }
    catch (e) { throw new Error(e.message + '\n\nSi recién lo marcaste terminado: tocá 💾 Guardar datos en mi carpeta y pedilo de nuevo.'); }
    fs.writeFileSync(tmp + '.json', JSON.stringify(D));
    await avisar(job.id, '⚙️ Armo el resumen de ' + D.nombre + ' (' + D.categorias.length + (D.categorias.length > 1 ? ' categorías' : ' categoría') + ', unos 3 a 6 minutos).');
    const args = ['video-torneo.mjs', tmp + '.json', tmp + '.mp4'];
    if (musica) args.push('--musica', musica);
    await correr(args, 'Video');
  } else {
    await avisar(job.id, '⚙️ Empecé el video de ' + titulo + '.\nPaso 1 de 2: analizo la partida con el Pupi (unos 3 minutos).');
    const partida = await cosechar({ t: job.t, gi: +job.gi }, { log });
    if (job.etiqueta) partida.etiqueta = job.etiqueta;   // partida elegida con /video: su título en lugar de "Un día como hoy"
    fs.writeFileSync(tmp + '.json', JSON.stringify(partida, null, 1));
    await avisar(job.id, '🎬 Paso 2 de 2: dibujo el video (' + partida.jugadas.length + ' jugadas, unos 5 minutos).');
    const args = ['video-hoy.mjs', tmp + '.json', tmp + '.mp4'];
    if (musica) args.push('--musica', musica);
    await correr(args, 'Video');
  }
  const mp4 = fs.readFileSync(tmp + '.mp4');
  log('Entrego el video (' + (mp4.length / 1e6).toFixed(1) + ' MB)…');
  // La clave va en el encabezado X-Clave, no en la dirección (quedaba en los registros de Cloudflare; auditoría
  // 22/10). Si el bot todavía es el de antes (contesta 403), una vez más con la clave en la dirección.
  let r = await fetch(BASE + '/tg/hoyvideo/subir?id=' + encodeURIComponent(job.id), { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Clave': CLAVE }, body: mp4 });
  if (r.status === 403) r = await fetch(BASE + '/tg/hoyvideo/subir?clave=' + encodeURIComponent(CLAVE) + '&id=' + encodeURIComponent(job.id), { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: mp4 });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error('No se pudo entregar: ' + (j.error || 'HTTP ' + r.status));
  log('✅ Entregado: ' + titulo);
  for (const e of ['.json', '.mp4']) try { fs.unlinkSync(tmp + e); } catch (x) { /* nada */ }
}

log('🎬 Armador de videos encendido. Espero pedidos del bot (botón "🎬 Video" de /hoy). Cerrá esta ventana para apagarlo.');
for (;;) {
  try {
    const r = await api('/tg/hoyvideo/tomar');
    if (r.job) {
      try { await procesar(r.job); }
      catch (e) { log('❌ ' + e.message); await avisar(r.job.id, '⚠️ No pude armar el video de ' + (r.job.titulo || r.job.id) + ':\n' + String(e.message).slice(0, 400) + '\n\nLo vuelvo a intentar una vez más.', true); }
      continue;
    }
  } catch (e) { log('(sin conexión con el bot: ' + e.message + ')'); }
  await esperar(15000);
}
