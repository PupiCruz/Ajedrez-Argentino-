# Cómo desplegar el Worker de Chess-Results (proxy CORS)

Esto se hace **una sola vez**. Es gratis (Cloudflare Workers, plan free, no pide tarjeta).

## Pasos (por el panel de Cloudflare — sin instalar nada)

1. Entrá a https://dash.cloudflare.com/ con tu cuenta (la misma de Cloudflare Pages).
2. En el menú de la izquierda: **Workers & Pages** → botón **Create application** → **Create Worker**.
3. Ponele un nombre, por ejemplo: `cr-proxy`. (El nombre arma la URL final.) → **Deploy**.
4. Cuando termine, tocá **Edit code** (o "Editar código").
5. Borrá todo lo que haya en el editor y **pegá el contenido completo** del archivo
   `cr-proxy-worker.js` (está en esta misma carpeta).
6. Tocá **Deploy** (arriba a la derecha).
7. Copiá la **URL del Worker** que te muestra Cloudflare. Va a ser algo como:
   `https://cr-proxy.TU-SUBDOMINIO.workers.dev`
8. **Pasale esa URL a Claude** para que la conecte en la app.

## Probar que anda (opcional)
Pegá esto en el navegador (reemplazando la URL del worker por la tuya):

```
https://cr-proxy.TU-SUBDOMINIO.workers.dev/?url=https://s2.chess-results.com/tnr1435703.aspx?lan=2%26zeilen=0%26art=0%26rd=8%26turdet=YES%26flag=30%26prt=4%26excel=2010
```

Si descarga un archivo `.xlsx`, ¡funciona!

## Nota
- El Worker sólo deja pasar URLs de `chess-results.com` (no es un proxy abierto).
- Guarda cada archivo ~2 minutos en caché para no sobrecargar a chess-results.
