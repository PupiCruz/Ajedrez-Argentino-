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
    tag: d.tag || undefined,
    data: { url: d.url || '/' },
  }));
});

// Al tocar la notificación: si la app ya está abierta, la trae al frente y la lleva a esa página; si no, la abre.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) {
      if (new URL(w.url).origin === self.location.origin && 'focus' in w) { w.navigate(url).catch(() => {}); return w.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
