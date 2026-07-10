# Plan — Editar la web desde el teléfono

> Estado 2026-07-10: **CONSTRUIDO (Fases A y B)** — editar torneo existente Y crear torneo
> cáscara desde el teléfono. Verificado en preview + tests del Worker. Falta ACTIVARLO:
> ver `cloudflare-worker/ACTIVAR-EDICION-TELEFONO.md` (token GitHub + secretos + deploy
> Worker + publicar). Fase C (sincronizar.cmd divergencia, adopción automática) pendiente.
> Autor no programador; explicar en claro. Verificar todo en preview antes de afirmar.

## Objetivo
Poder, **desde el teléfono**, sin la PC:
1. **Editar un torneo existente** — sobre todo agregarle un link de **Lichess broadcast / chess-results / info64**, o corregir datos (nombre, fechas, sede, estado).
2. **Crear un torneo desde cero** (cáscara: nombre, fechas, tipo, sede + link). Las partidas las trae solo el link en vivo; no se suben desde el teléfono.

Lo pesado (subir PGN, fotos, ranking FIDE) sigue siendo en la PC.

## Por qué es viable con lo que ya hay
- Repo GitHub: `PupiCruz/Ajedrez-Argentino-`. Cloudflare Pages redepliega solo al pushear a `main` (~1-2 min) → `chessargentino.pages.dev`.
- Ya hay un **Cloudflare Worker** desplegado (proxy CR/info64 + D1). Sabemos agregar secretos y endpoints.
- La web publicada YA baja tablas de CR/info64 en vivo por el Worker (`_refreshLiveLeaders`→`_liveStandingsFetch`, index.html:5185-5225) y las partidas de Lichess broadcast en vivo. O sea: un torneo agregado con solo su LINK ya se actualiza solo, sin tocar la PC. **Esta es la clave que hace todo esto fácil.**

## Arquitectura elegida
Teléfono → página web liviana (PIN) → **Worker** (tiene el token de GitHub como secreto) → commit a GitHub vía API → Cloudflare republica.
El teléfono NUNCA toca GitHub ni tiene el token. Solo manda datos al Worker con un PIN.

### NO hacer (trampa): editar `manifest.js` a mano en github.com desde el celular.
`manifest.js` se carga como `<script>`: un error de tipeo rompe TODA la web. Por eso va el archivo aparte de abajo.

## Piezas a construir

### A) Archivo de datos "en vivo": `data/live-torneos.json`
- Chico (unos KB). La web lo **lee con fetch** (NO `<script>`) y lo **fusiona** con los torneos del manifest. Envuelto en try/catch → si sale mal, se ignora y la web **no se rompe**.
- Servirlo `no-cache` (agregar regla en `_headers`, como `manifest.js`).
- Estructura tentativa:
  ```json
  {
    "version": 3,
    "nuevos": [ { "id":"ph_<timestamp>", "name":"...", "dates":"...", "startDate":"...", "endDate":"...",
                  "type":"Internacional", "location":"...", "status":"live",
                  "broadcastId":"", "broadcastUrl":"", "crUrl":"", "info64url":"" } ],
    "overrides": { "<idTorneoExistente>": { "broadcastId":"...", "crUrl":"...", "dates":"...", ... } }
  }
  ```
- `nuevos` = torneos creados desde el teléfono (cáscara sin partidas). `overrides` = parches a torneos que ya están en el manifest (agregar link, corregir dato). Prefijo `ph_` para distinguir "creado desde teléfono".

### B) Endpoint nuevo en el Worker: `POST /admin/save`
- Recibe `{ pin, live }` (el JSON completo ya editado, o una operación puntual).
- Valida `pin` contra secreto `EDIT_PIN` (comparación server-side; rate-limit con D1 o KV para frenar fuerza bruta).
- GitHub API: `GET /repos/PupiCruz/Ajedrez-Argentino-/contents/data/live-torneos.json` (trae sha+contenido) → modifica → `PUT` con el commit. Eso dispara el redeploy de Pages.
- Secretos (wrangler secret put): `GH_TOKEN` (PAT **fine-grained**, SOLO este repo, permiso contents:read/write) y `EDIT_PIN`.
- El Worker SOLO puede escribir `data/live-torneos.json` (whitelist). Nunca `index.html`. Blast-radius mínimo.
- También un `GET /admin/list` (con PIN) que devuelva la lista de torneos editables (del manifest) para poblar la página del teléfono.

### C) Página del teléfono: `editar.html` (liviana, NO la app de 120MB)
- Carga instantánea. Pide PIN. Formulario simple: elegir torneo existente (de `/admin/list`) o "nuevo", campos nombre/fechas/tipo/sede + los 3 links (Lichess/CR/info64). "Guardar" → `POST /admin/save`.
- Reusar la lógica de campos del editor tz existente donde sirva, pero UI mínima y mobile-first.
- Mostrar "Guardado, la web se actualiza en ~1-2 min".

### D) Cambios en la app (index.html)
- Al arrancar (publicado Y autor): `fetch('data/live-torneos.json?v=...')`, try/catch, y **fusionar**: agregar `nuevos` a la lista de torneos y aplicar `overrides` sobre los del manifest. Que `renderTorneos` y `openTournamentDetail` los contemplen.
- Modo autor/PC: además, botón **"Adoptar cambios del teléfono"** que toma lo de `live-torneos.json` y lo mete en `embedded-data.js`/tz_config (fuente de la verdad en Drive), y limpia `live-torneos.json`. Esta es la **reconciliación**.

### E) Reconciliación PC ↔ teléfono (sincronizar.cmd)
- `sincronizar.cmd` ya hace `git fetch` + `merge --ff-only` → trae los commits del teléfono a la PC. **Sirve tal cual para el caso común** (PC limpia).
- Ajuste: en el caso de DIVERGENCIA (PC con cambios propios sin publicar + teléfono también commiteó), hoy solo ofrece `IGUALAR` (reset --hard = pierde lo de la PC). Cambiarlo para hacer una **fusión real** (o guiar: "publicá primero la PC"). No debe haber camino que borre trabajo sin aviso claro.
- Flujo sano recomendado: teléfono edita → PC corre `sincronizar.cmd` (baja el cambio) → si el torneo va a recibir partidas/fotos, PC "Adopta" y sigue el flujo normal (Guardar datos + publicar-web.cmd).

## Seguridad (importante para el autor)
- Token GitHub = **secreto del Worker**, jamás en el teléfono ni en la web. Teléfono solo tiene el PIN.
- PAT **fine-grained**, un solo repo, solo contents. Si se filtrara, no toca nada más.
- Worker escribe SOLO `data/live-torneos.json`. Imposible inyectar código en `index.html`.
- PIN validado server-side + rate-limit. PIN largo (frase).
- `live-torneos.json` se **lee con fetch + try/catch** → un archivo mal formado nunca rompe la web (a diferencia de manifest.js).

## Fases
- **A (primero, menor riesgo):** editar torneo existente + agregar link (Lichess/CR/info64) desde el teléfono. Cubre el uso #1.
- **B:** crear torneo desde cero (cáscara) desde el teléfono.
- **C:** otros datos sueltos + reforzar sincronizar.cmd.

## Preguntas a resolver mañana (arranque de sesión)
1. ¿Hasta qué profundidad muestra la web publicada un torneo CR/info64 SOLO con el link (tabla ✓; ¿cruces ronda por ronda?, ¿partidas?). Verificar en preview/publicado antes de prometer.
2. ¿Página `editar.html` separada, o una ruta `?admin` dentro de la app? (Separada = más liviana en el teléfono; me inclino por separada.)
3. ¿Rate-limit del PIN con D1 (ya existe) o KV?
4. Definir el PAT fine-grained y los `wrangler secret put` (el autor los corre).
5. Diseño fino de la "Adopción" en la PC para no duplicar torneos (orden: por id `ph_`, luego por nombre+fechas).

## Archivos que se tocan
- Nuevo: `data/live-torneos.json`, `editar.html`.
- `cloudflare-worker/cr-proxy-worker.js` (endpoints `/admin/save`, `/admin/list`).
- `index.html` (fetch+merge de live-torneos; botón "Adoptar").
- `_headers` (no-cache para live-torneos.json).
- `sincronizar.cmd` (caso divergencia).
