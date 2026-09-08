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
 * REGLAS QUE NO HAY QUE ROMPER
 * 1. Ante CUALQUIER problema, devolver la página tal cual. Esto corre en todas las visitas: si
 *    revienta, se cae el sitio entero. Por eso todo está envuelto y el catch devuelve `res`.
 * 2. Las visitas sin ?torneo=/?jugador=/?noticia= salen por la primera línea, sin leer nada:
 *    la enorme mayoría del tráfico no paga ningún costo.
 * 3. Se le manda a TODO EL MUNDO lo mismo, no sólo a los robots. Servirle a Google/WhatsApp algo
 *    distinto que a las personas se llama cloaking y se castiga. Además, para el navegador esto
 *    es inofensivo: la app pisa el título apenas arranca.
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

// Las imágenes tienen que ir con dirección completa: los robots no resuelven rutas relativas.
function absoluta(p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return SITIO + '/' + String(p).replace(/^\/+/, '');
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
    titulo: conMarca(nombre + ' — resultados y partidas'),
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

class PonerAtributo {
  constructor(attr, valor) { this.attr = attr; this.valor = valor; }
  element(el) { if (this.valor) el.setAttribute(this.attr, this.valor); }
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

    res = await next();
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return res;

    const datos = await cargarDatos(url.origin);
    const fila = datos && datos[tipo] && datos[tipo][clave];
    if (!fila) return res;   // clave desconocida (dato viejo o borrado): la página de siempre

    const m = tipo === 't' ? armarTorneo(fila) : tipo === 'j' ? armarJugador(fila) : armarNoticia(fila);
    const dir = SITIO + url.pathname + url.search;

    return new HTMLRewriter()
      .on('title', { element(el) { el.setInnerContent(m.titulo); } })
      .on('meta[name="description"]',        new PonerAtributo('content', m.desc))
      .on('meta[property="og:title"]',       new PonerAtributo('content', m.titulo))
      .on('meta[property="og:description"]', new PonerAtributo('content', m.desc))
      .on('meta[property="og:url"]',         new PonerAtributo('content', dir))
      .on('meta[property="og:image"]',       new PonerAtributo('content', m.imagen))
      .on('link[rel="canonical"]',           new PonerAtributo('href', dir))
      .transform(res);
  } catch (e) {
    // Regla 1: pase lo que pase, la página tiene que salir.
    try { return res || (await next()); } catch (_) { return new Response('', { status: 500 }); }
  }
}
