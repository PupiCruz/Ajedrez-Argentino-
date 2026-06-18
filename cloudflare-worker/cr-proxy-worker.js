// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker — Proxy CORS para Chess-Results
// ─────────────────────────────────────────────────────────────────────────────
// Para qué: chess-results.com NO manda headers CORS, así que el navegador bloquea
// que la app baje sus archivos .xlsx directamente. Este Worker los baja del lado
// servidor (donde no hay CORS) y los reenvía con permiso CORS, para que la web de
// Ajedrez Argentino pueda leer los cuadros de cruces y la clasificación en vivo.
//
// Uso desde la app:
//   https://<tu-worker>.workers.dev/?url=<URL de chess-results url-encodeada>
//
// Seguridad: sólo deja pasar URLs de chess-results.com (no es un proxy abierto).
// Caché: guarda cada respuesta ~2 min, así muchos visitantes no martillan a
// chess-results (y la web va más rápida).
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_HOST = /(^|\.)chess-results\.com$/i;
const CACHE_SECONDS = 120;

export default {
  async fetch(request, env, ctx) {
    // Respuesta al "preflight" CORS que manda el navegador antes del fetch real.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');
    if (!target) return errJson('Falta el parámetro ?url=', 400);

    let t;
    try { t = new URL(target); }
    catch (e) { return errJson('URL inválida', 400); }

    // Sólo chess-results.com por HTTPS — evita que el Worker sea un proxy abierto.
    if (t.protocol !== 'https:' || !ALLOWED_HOST.test(t.hostname)) {
      return errJson('Host no permitido (sólo chess-results.com)', 403);
    }

    // Caché: si ya bajamos esto hace poco, devolverlo sin volver a chess-results.
    const cache = caches.default;
    const cacheKey = new Request(reqUrl.toString());
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    let upstream;
    try {
      upstream = await fetch(t.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AjedrezArgentinoBot/1.0)' },
        redirect: 'follow', // chess-results.com a veces redirige (302) al nodo s2/s3...
      });
    } catch (e) {
      return errJson('No se pudo bajar de chess-results: ' + e.message, 502);
    }

    const headers = corsHeaders();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('Content-Type', ct);
    headers.set('Cache-Control', 'public, max-age=' + CACHE_SECONDS);

    const resp = new Response(upstream.body, { status: upstream.status, headers });

    // Guardar en caché en segundo plano (sólo si salió bien).
    if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  },
};

function corsHeaders() {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  });
}

function errJson(msg, status) {
  const h = corsHeaders();
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ error: msg }), { status, headers: h });
}
