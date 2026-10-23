// 📲 ChessArgentino como app (PLAN-PORTADA-HOY, Fase 5, 22/10/2026).
// Este «ayudante» (service worker) corre en el teléfono aunque la web esté cerrada, y SÓLO sirve para las
// notificaciones. A propósito NO guarda nada de la web (no tiene «fetch»): la web se sigue bajando fresca como
// siempre, sin riesgo de que alguien quede con una versión vieja guardada en el teléfono.
//
// Si algún día hubiera que sacarlo: dejar este archivo con sólo
//   self.addEventListener('install', () => self.skipWaiting());
//   self.addEventListener('activate', () => self.registration.unregister());
// y publicar: se borra solo en todos los teléfonos.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Una notificación que llega del servidor (paso 2: la manda el bot). Viene como JSON:
// { titulo, texto, url, tag }. Sin datos, una genérica.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { texto: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'ChessArgentino', {
    body: d.texto || '',
    icon: '/favicon-192.png',
    badge: '/badge-96.png',   // el caballito blanco de la barra de arriba (Android)
    tag: d.tag || undefined,
    data: { url: d.url || '/' },
  }));
});

// Al tocar la notificación: si la app ya está abierta, la trae al frente y la lleva a esa página; si no, la abre.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // Sólo páginas de ESTE sitio (auditoría 22/10): un aviso con la dirección de otro sitio abre la portada.
  let url = self.location.origin + '/';
  try { const u = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin); if (u.origin === self.location.origin) url = u.href; } catch (_) {}
  // (23/10) Con la app ya abierta, navigate() puede fallar (una página que este ayudante no controla, o el teléfono que
  // no lo deja) y antes el error se tragaba: la app quedaba en la portada. Ahora, si falla, se le pide a la página que vaya
  // ella (escucha «aaIr» en _appSwMensaje); y si tampoco hay a quién, se abre una ventana nueva con el link.
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => new URL(x.url).origin === self.location.origin && 'focus' in x);
    if (!w) return self.clients.openWindow(url);
    return w.focus().catch(() => w).then((f) => (f || w).navigate(url)).then((n) => {
      if (!n) w.postMessage({ aaIr: url });
    }).catch(() => { try { w.postMessage({ aaIr: url }); } catch (_) { return self.clients.openWindow(url); } });
  }));
});
