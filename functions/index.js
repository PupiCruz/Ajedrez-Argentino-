/**
 * VISTA PREVIA AL COMPARTIR (WhatsApp, Facebook, Instagram, Telegram…)
 * ────────────────────────────────────────────────────────────────────
 * El problema: esos robots NO ejecutan JavaScript. Piden el HTML crudo, leen las etiquetas og:
 * y se van. Como toda la app vive en un solo index.html, cada link compartido —un torneo, un
 * perfil, una noticia— mostraba el mismo cartel genérico del sitio. Los títulos que pone la app
 * al abrir cada pantalla no les llegan nunca, porque son cosa del navegador.
 *
 * La solución: que el SERVIDOR ya mande las etiquetas correctas. Esto corre en el borde de
 * Cloudflare (Pages Functions), en el mismo proyecto: se publica con publicar-web.cmd como
 * cualquier archivo, no hay nada que desplegar aparte.
 *
 * De dónde saca los datos: data/og.json, que lo genera la app al apretar
 * "💾 Guardar datos en mi carpeta" (ver _ogJson() en index.html). Es chico a propósito.
 *
 * POR QUÉ SE LLAMA index.js Y NO _middleware.js
 * Un `_middleware.js` corre en TODAS las peticiones del sitio: también en cada imagen, cada
 * .json de datos y cada archivo del motor. Son decenas por visita, y todas contarían contra el
 * cupo de Cloudflare sin necesidad. Como `functions/index.js`, sólo corre en la dirección "/",
 * que es justamente la única que devuelve HTML. Los datos y las imágenes se siguen sirviendo
 * como siempre, sin pasar por acá.
 *
 * REGLAS QUE NO HAY QUE ROMPER
 * 1. Ante CUALQUIER problema, devolver la página tal cual. Por eso todo está envuelto y el catch
 *    devuelve `res`: si esto falla, la peor consecuencia tiene que ser "la vista previa sale
 *    genérica", nunca "no abre el sitio".
 * 2. Las visitas sin ?torneo=/?jugador=/?noticia= salen por la primera línea, sin leer nada.
 * 3. Se le manda a TODO EL MUNDO lo mismo, no sólo a los robots. Servirle a Google/WhatsApp algo
 *    distinto que a las personas se llama cloaking y se castiga. Además, para el navegador esto
 *    es inofensivo: la app pisa el título apenas arranca.
 * 4. La clave viene de la URL, o sea de un desconocido. NUNCA usarla directo contra el objeto
 *    (`datos[tipo][clave]`): pidiendo ?jugador=__proto__ o =constructor se llega a las tripas de
 *    JavaScript y salen títulos absurdos. Se busca con hasOwnProperty y se exige que sea una
 *    lista, así lo único que puede pasar es que no la encuentre.
 */

const SITIO = 'https://chessargentino.ar';
const MARCA = 'ChessArgentino';

// El archivo se guarda mientras el proceso siga vivo, para no ir a buscarlo en cada link.
let CACHE = null;
let CACHE_TS = 0;
const CACHE_MS = 5 * 60 * 1000;

async function cargarDatos(origen) {
  const ahora = Date.now();
  if (CACHE && ahora - CACHE_TS < CACHE_MS) return CACHE;
  const r = await fetch(origen + '/data/og.json', { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) return CACHE;            // si falla, se sigue usando lo último bueno que haya
  CACHE = await r.json();
  CACHE_TS = ahora;
  return CACHE;
}

/* Las imágenes tienen que ir con dirección completa: los robots no resuelven rutas relativas.
   Sólo se aceptan dos formas: una dirección http(s) o una ruta del propio sitio. Cualquier otra
   cosa se descarta y queda la imagen genérica. Sin este filtro, un valor raro guardado en los
   datos (por ejemplo "javascript:…") salía publicado como https://chessargentino.ar/javascript:…
   No era peligroso —nadie ejecuta una og:image— pero publicar basura tampoco sirve. */
function absoluta(p) {
  if (!p) return '';
  const s = String(p).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/?(data|assets)\/[\w\-./]+$/i.test(s)) return SITIO + '/' + s.replace(/^\/+/, '');
  return '';
}

/* Los mismos rangos que usa _a11yTexto() en index.html. Si el servidor no los sacara, el título
   de la vista previa mostraría "⏰ IV BA CHESS MASTERS ⏰" y el del navegador no: la misma página
   con dos títulos distintos según quién la mire. NO ampliar hacia  -⁯: ahí viven el guion
   largo (—) y las comillas tipográficas, que sí se conservan. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2460}-\u{24FF}\u{25A0}-\u{27BF}\u{2900}-\u{297F}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}\u{2022}]/gu;

function limpio(t) {
  return String(t || '').replace(EMOJI, ' ').replace(/\s+/g, ' ').trim();
}

function conMarca(t) {
  const s = limpio(t);
  return s.indexOf(MARCA) >= 0 ? s : s + ' | ' + MARCA;
}

function armarTorneo(f) {
  const [nombre, lugar, fechas, flyer] = f;
  const partes = [];
  if (lugar) partes.push(lugar);
  if (fechas) partes.push(fechas);
  return {
    // "posiciones" es la palabra que más usa la gente al buscar un torneo (Search Console, sep 2026).
    // Igual que _seoTorneo() en index.html: la misma página no puede tener dos títulos.
    titulo: conMarca(nombre + ' — posiciones, resultados y partidas'),
    desc: limpio('Tabla de posiciones, cruces, rondas y partidas de ' + nombre +
          (partes.length ? '. ' + partes.join('. ') : '') + '. Ajedrez argentino.'),
    imagen: absoluta(flyer)
  };
}

function armarJugador(f) {
  const [nombre, titulo, elo, foto] = f;
  return {
    titulo: conMarca(nombre + (titulo ? ' (' + titulo + ')' : '') + ' — Elo FIDE, partidas y torneos'),
    desc: limpio(nombre + ': ' + (elo ? 'Elo FIDE ' + elo + '. ' : '') +
          'Partidas, torneos, aperturas y evolución del rating. Ajedrez argentino.'),
    imagen: absoluta(foto)
  };
}

function armarNoticia(f) {
  const [titulo, resumen, portada] = f;
  return {
    titulo: conMarca(titulo),
    desc: limpio(resumen) || 'Noticia de ajedrez argentino.',
    imagen: absoluta(portada)
  };
}

/* La dirección oficial (canonical) de un torneo va sin ?cat=, para que Google no reparta el torneo en
   varias páginas que compiten entre sí (la Olimpiada 2026 salía en tres). Con una partida abierta el
   cat se queda: el número de partida es de esa categoría. Misma regla que _seoBusquedaCanonica() en
   index.html. og:url sigue con la dirección completa: es el link que se comparte. */
function busquedaCanonica(q) {
  if (!q.has('torneo') || !q.has('cat') || q.get('partida') || q.get('g') || q.get('vg')) return q.toString();
  const c = new URLSearchParams(q);
  c.delete('cat');
  return c.toString();
}

class PonerAtributo {
  constructor(attr, valor) { this.attr = attr; this.valor = valor; }
  element(el) { if (this.valor) el.setAttribute(this.attr, this.valor); }
}

/* ═══ FICHA DE TEXTO PARA GOOGLE (06/10/2026) ═══════════════════════════════════════════════════
   Search Console: de 1.847 páginas, Google había indexado 34. Las demás estaban "Descubierta:
   actualmente sin indexar", porque las 1.847 direcciones devolvían el MISMO HTML de 4 MB y lo propio
   de cada una (la tabla, los torneos del jugador) aparecía recién con el JavaScript.

   Ahora, a cada torneo y a cada jugador se le mete en el HTML un bloque con lo esencial y links de
   verdad entre torneos y perfiles. Va justo DESPUÉS del script de la pantalla "Cargando…"
   (<script id="dl-cover"> en index.html), o sea tapado por ella, y lo sigue un script que lo BORRA
   en el acto. El visitante no lo ve nunca, ni lo lee el lector de pantalla, y la app arranca igual
   que siempre. Es lo mismo para todos (personas y robots): no es cloaking (ver regla 3).

   Los datos los arma la app al guardar (_seoDatos en index.html), repartidos en data/seo/t0..7.json
   y data/seo/j0..15.json para que acá se lea uno solo, chico. Si falta o falla, la página sale sin la
   ficha y con todo lo demás como siempre (regla 1). */
const SHARDS = { t: 8, j: 16 };   // iguales a _SEO_SHARDS_T / _SEO_SHARDS_J de index.html
const FICHAS = new Map();         // 'seo/j3.json' → { datos, ts }

// Tiene que dar EXACTAMENTE lo mismo que _seoShard() en index.html.
function shard(clave, n) {
  let h = 0;
  const s = String(clave);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

// Nunca tira error: ante cualquier problema devuelve null (o lo último bueno que haya).
async function cargarFicha(origen, tipo, clave) {
  try {
    if (!SHARDS[tipo]) return null;
    const ruta = 'seo/' + tipo + shard(clave, SHARDS[tipo]) + '.json';
    const ahora = Date.now();
    const hit = FICHAS.get(ruta);
    if (hit && ahora - hit.ts < CACHE_MS) return hit.datos;
    const r = await fetch(origen + '/data/' + ruta, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) return hit ? hit.datos : null;
    const datos = await r.json();
    FICHAS.set(ruta, { datos, ts: ahora });
    return datos;
  } catch (e) {
    return null;
  }
}

const propio = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function linkJugador(og, id, nombreRespaldo) {
  const f = propio(og && og.j, id) ? og.j[id] : null;
  const nombre = Array.isArray(f) && f[0] ? f[0] : nombreRespaldo;
  return '<a href="/?jugador=' + esc(encodeURIComponent(id)) + '">' + esc(limpio(nombre)) + '</a>';
}

const PIE = '<p><a href="/">Torneos de ajedrez en Argentina</a> · <a href="/?ir=jugadores">Ranking FIDE de Argentina</a>'
          + ' · <a href="/?ir=noticias">Noticias de ajedrez</a></p>';

function fichaTorneo(fila, ficha, og) {
  const [nombre, lugar, fechas] = fila;
  let h = '<h1>' + esc(limpio(nombre)) + '</h1>';
  const det = [lugar, fechas].map(limpio).filter(Boolean);
  h += '<p>' + (det.length ? esc(det.join(' · ')) + '. ' : '') + 'Tabla de posiciones, cruces, rondas y partidas.</p>';
  const bloques = ficha && Array.isArray(ficha.b) ? ficha.b : [];
  for (const b of bloques) {
    if (!Array.isArray(b) || !Array.isArray(b[2])) continue;
    const [cat, tipo, filas] = b;
    // 'i' = tabla individual, 'e' = por equipos; 'p' y 'q' = lo mismo, pero todavía sin jugar
    // (inscriptos, sin puestos ni puntos).
    const tit = tipo === 'e' ? 'Clasificación por equipos' : tipo === 'q' ? 'Equipos inscriptos'
              : tipo === 'p' ? 'Jugadores inscriptos' : 'Tabla de posiciones';
    h += '<h2>' + tit + (cat ? ' — ' + esc(limpio(cat)) : '') + '</h2><ul>';
    for (const r of filas) {
      if (!Array.isArray(r)) continue;
      const [rk, nom, pid, ti, fed, elo, pts] = r;
      const quien = pid !== '' && pid != null ? linkJugador(og, String(pid), nom) : esc(limpio(nom));
      const extra = [fed, elo || ''].filter(Boolean).join(', ');
      h += '<li>' + (rk ? esc(rk) + '. ' : '') + (ti ? esc(ti) + ' ' : '') + quien + (extra ? ' (' + esc(extra) + ')' : '')
         + (pts !== '' && pts != null ? ' — ' + esc(pts) + ' pts' : '') + '</li>';
    }
    h += '</ul>';
  }
  const otros = ficha && Array.isArray(ficha.a) ? ficha.a : [];
  if (otros.length) {
    // "Más" sólo si arriba, en la tabla, ya apareció alguno con su link.
    const yaHay = bloques.some(b => Array.isArray(b) && Array.isArray(b[2]) && b[2].some(r => Array.isArray(r) && r[2] !== '' && r[2] != null));
    h += '<h2>' + (yaHay ? 'Más jugadores' : 'Jugadores') + ' argentinos en el torneo</h2><ul>';
    for (const o of otros) {
      if (!Array.isArray(o)) continue;
      const [pid, rk, pts] = o;
      h += '<li>' + linkJugador(og, String(pid), '') + (rk ? ' — puesto ' + esc(rk) : '') + (pts ? (rk ? ', ' : ' — ') + esc(pts) : '') + '</li>';
    }
    h += '</ul>';
  }
  return h;
}

function fichaJugador(fila, lista, og) {
  const [nombre, titulo, elo] = fila;
  let h = '<h1>' + esc((titulo ? titulo + ' ' : '') + limpio(nombre)) + '</h1>';
  h += '<p>' + esc(limpio(nombre)) + (elo ? ': Elo FIDE ' + esc(elo) + '.' : '.')
     + ' Partidas, torneos, aperturas y evolución del rating.</p>';
  const items = [];
  for (const f of (Array.isArray(lista) ? lista : [])) {
    if (!Array.isArray(f)) continue;
    const [tk, rk, n, pts, cat, eq, bo] = f;
    const t = propio(og && og.t, tk) ? og.t[tk] : null;
    if (!Array.isArray(t) || !t[0]) continue;
    const det = [t[1], t[2]].map(limpio).filter(Boolean);
    let res = '';
    if (eq) res = eq + (bo ? ', tablero ' + bo : '') + (pts ? ': ' + pts : '') + (rk ? ' (puesto ' + rk + (n ? ' de ' + n : '') + ')' : '');
    else res = [rk ? 'puesto ' + rk + (n ? ' de ' + n : '') : '', pts ? pts + ' puntos' : ''].filter(Boolean).join(', ');
    items.push('<li><a href="/?torneo=' + esc(encodeURIComponent(tk)) + '">' + esc(limpio(t[0])) + '</a>'
      + (cat ? ' (' + esc(limpio(cat)) + ')' : '') + (det.length ? ' — ' + esc(det.join(', ')) : '')
      + (res ? '. ' + esc(res) : '') + '</li>');
  }
  if (items.length) h += '<h2>Torneos</h2><ul>' + items.join('') + '</ul>';
  return h;
}

function fichaNoticia(fila) {
  const [titulo, resumen] = fila;
  return '<h1>' + esc(limpio(titulo)) + '</h1>' + (resumen ? '<p>' + esc(limpio(resumen)) + '</p>' : '');
}

// El bloque entero + el script que lo borra apenas se lee (antes de que se pinte nada).
function armarFicha(tipo, clave, fila, fichas, og) {
  let cuerpo = '';
  if (tipo === 't') {
    const f = fichas && propio(fichas.t, clave) ? fichas.t[clave] : null;
    cuerpo = fichaTorneo(fila, f, og);
  } else if (tipo === 'j') {
    const l = fichas && propio(fichas.j, clave) ? fichas.j[clave] : null;
    cuerpo = fichaJugador(fila, l, og);
  } else {
    cuerpo = fichaNoticia(fila);
  }
  return '<div id="seo-ficha" lang="es">' + cuerpo + PIE + '</div>'
       + '<script>(function(){var e=document.getElementById("seo-ficha");if(e&&e.parentNode)e.parentNode.removeChild(e);})();</script>';
}

export async function onRequest(context) {
  const { request, next } = context;
  let res = null;
  try {
    const url = new URL(request.url);

    // Sólo interesan los links de entidad sobre la página principal. Todo lo demás sale por acá.
    const q = url.searchParams;
    let tipo = null, clave = null;
    if (q.get('torneo'))       { tipo = 't'; clave = q.get('torneo'); }
    else if (q.get('jugador')) { tipo = 'j'; clave = q.get('jugador'); }
    else if (q.get('noticia')) { tipo = 'n'; clave = q.get('noticia'); }
    if (!tipo) return next();
    if (url.pathname !== '/' && !/\.html?$/i.test(url.pathname)) return next();

    // Las tres cosas se piden a la vez: la página, og.json y la ficha. Así la ficha no agrega espera.
    const pFicha = cargarFicha(url.origin, tipo, clave);
    const pDatos = cargarDatos(url.origin);
    pDatos.catch(() => {});           // si falla, que el error lo levante el await de abajo y no quede suelto
    res = await next();
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return res;

    const datos = await pDatos;
    const grupo = datos && Object.prototype.hasOwnProperty.call(datos, tipo) ? datos[tipo] : null;
    const fila = grupo && Object.prototype.hasOwnProperty.call(grupo, clave) ? grupo[clave] : null;
    // Regla 4: además de buscarla como corresponde, tiene que ser una lista con contenido.
    if (!Array.isArray(fila) || !fila.length) return res;   // clave desconocida: la página de siempre

    const m = tipo === 't' ? armarTorneo(fila) : tipo === 'j' ? armarJugador(fila) : armarNoticia(fila);
    const dir = SITIO + url.pathname + url.search;
    const bc = busquedaCanonica(q);
    const canonica = SITIO + url.pathname + (bc ? '?' + bc : '');
    let ficha = '';
    try { ficha = armarFicha(tipo, clave, fila, await pFicha, datos); } catch (e) { ficha = ''; }

    return new HTMLRewriter()
      .on('script#dl-cover', { element(el) { if (ficha) el.after(ficha, { html: true }); } })
      .on('title', { element(el) { el.setInnerContent(m.titulo); } })
      .on('meta[name="description"]',        new PonerAtributo('content', m.desc))
      .on('meta[property="og:title"]',       new PonerAtributo('content', m.titulo))
      .on('meta[property="og:description"]', new PonerAtributo('content', m.desc))
      .on('meta[property="og:url"]',         new PonerAtributo('content', dir))
      .on('meta[property="og:image"]',       new PonerAtributo('content', m.imagen))
      .on('link[rel="canonical"]',           new PonerAtributo('href', canonica))
      .transform(res);
  } catch (e) {
    // Regla 1: pase lo que pase, la página tiene que salir.
    try { return res || (await next()); } catch (_) { return new Response('', { status: 500 }); }
  }
}
