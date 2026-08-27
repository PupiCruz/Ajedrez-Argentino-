# Ajedrez Argentino — guía del proyecto

> Esta nota la lee Claude automáticamente al abrir esta carpeta, en cualquier PC.
> Sirve para retomar el trabajo aunque sea en otra computadora o sesión nueva.

## ✅ Auditoría 2026: TERMINADA
La auditoría de seguridad y código del **26/08/2026** (27 hallazgos) se arregló entera en
**8 fases**, todas publicadas y andando al **27/08/2026**. El registro completo de qué se
cambió y por qué está en **`PLAN-AUDITORIA.md`** (en esta misma carpeta): conviene leerlo
antes de tocar cuentas, moderación, chats o el arranque de la página.

## 🧪 Bancos de pruebas — correrlos antes y después de tocar esas partes
Quedaron cuatro, **242 comprobaciones** en total. No necesitan instalar nada (Node y listo):

| Banco | Qué cubre | Cómo se corre |
|---|---|---|
| `ajedrez-argentino/test-web.mjs` (60) | index.html y editar.html | `cd ajedrez-argentino` y `node test-web.mjs` |
| `cloudflare-worker/test-cuentas.mjs` (59) | cuentas, frenos, rating, moderación | `cd ajedrez-argentino/cloudflare-worker` y `node test-cuentas.mjs` |
| `vivo-worker/test-lobby.mjs` (62) | lobby, los tres chats, desafíos, sanciones, bloqueo | `cd vivo-worker` y `node test-lobby.mjs` |
| `vivo-worker/test-salas.mjs` (61) | salas de partida, hibernación, reloj | `cd vivo-worker` y `node test-salas.mjs` |

Ya cazaron varios bugs antes de que llegaran al sitio. Si uno falla, **no publicar**.

## Qué es
App web de **ajedrez argentino**: torneos, perfiles de jugadores, rankings FIDE,
visor de partidas con análisis (motor Stockfish) y noticias. Es una **app de un solo
archivo HTML** (`index.html`) que carga sus datos y assets desde subcarpetas.

El autor **no es programador** y trabaja en español. El objetivo es eventualmente
**publicar la web** para el público.

## La carpeta (qué es cada cosa)
- `index.html` — toda la app (HTML + CSS + JS en un solo archivo).
- `data/embedded-data.js` — **todos los datos** (torneos, jugadores, noticias, zona
  horaria). Es la **fuente de la verdad**. Pesa ~20MB. NO está en git (es data, se
  respalda en Drive).
- `data/embedded-photos.js` — fotos de jugadores en base64. Igual que embedded-data.js:
  es SOLO para el modo autor local (NO está en git, se respalda en Drive). En la web
  publicada NO se usa.
- `data/embedded-flyers.js` — flyers de torneos migrados (base64) + mapa de redirección
  imgur→data/fl. También SOLO modo autor local (gitignored, va a Drive).
- `data/hardcoded.js` — datos curados (PLAYER_GAMES + PGN_DB).
- `data/manifest.js`, `data/t/`, `data/p/`, `data/ph/`, `data/fl/`, `data/cr/` — "pedacitos" para la
  web publicada (carga por demanda). **Se regeneran solos al publicar**; no se tocan a mano.
  `data/cr/<clave>.json` = CUADROS de cruces/tabla por torneo (uno por clave `cr2_*`). Antes viajaban
  EMBEBIDOS en manifest.js (~6,8MB, lo que más pesaba al abrir); ahora el manifest solo lleva
  `__CR_INDEX__` (qué claves existen) + `__CR_NAMES__` (nombres de cada tabla, para el buscador) y el
  cruce completo se baja al abrir el torneo (`_crEnsureLoaded`). Bajó el manifest de 8,9MB→2,5MB
  (brotli 852KB→343KB). El rating en vivo del perfil baja solo los cruces clásicos recientes del
  jugador (`_crEnsureLiveRating`). OJO modo autor: embedded-data.js pobla `__EMBEDDED_CR__` completo y
  manifest.js lo conserva con `|| {}` (no lo pisa).
  `data/ph/<id>.jpg` = FOTOS sueltas (una por jugador); el manifest lleva `__PHOTO_INDEX__`
  = {id: ext} de quién tiene foto. `data/fl/<key>.jpg` = FLYERS self-hosteados (antes eran
  links de imgur, lentísimos ~1-9s; ahora en Cloudflare ~0,1s); el manifest lleva
  `__FLYER_REDIRECT__` = {urlImgur: data/fl/…}. Ambos con `loading="lazy"`. Los flyers se
  migran con el botón "🖼️ Migrar flyers a mi hosting" (baja de imgur vía CORS, achica a
  800px, `_fetchResizeImage`); no se toca el flyerUrl guardado (imgur queda de respaldo,
  `_flyerSrc` redirige). **TODOS estos SÍ van a git** (`manifest.js`, `data/t/`, `data/p/`,
  `data/ph/`, `data/fl/`, `data/cr/`): Cloudflare Pages publica directo desde el repo, así que si no
  estuvieran, la web saldría sin torneos ni fotos.
- `assets/` — motores Stockfish (self-host), librería de ajedrez, piezas SVG, sonidos.
  **La app no tiene ninguna dependencia externa en runtime** (anda sin internet).
  Motor principal: `stockfish-18-lite-single.{js,wasm}` (SF18 con red neuronal NNUE,
  un solo hilo, el mismo build que usa Chess.com). Plan B y modo `file://` (doble clic):
  `stockfish-embedded.js` (SF16 en base64, sin red). La lógica está en `sfStart()`.
- `iniciar-servidor.cmd` / `serve.ps1` — levantan un servidor local para abrir la app.

## Cómo se trabaja (flujo del autor)
1. Abrir la app (con `iniciar-servidor.cmd`) y cargar/editar torneos, jugadores, noticias.
2. **Día a día:** botón **"Guardar datos en mi carpeta"** → descarga
   `embedded-data.js` + `embedded-photos.js` para reemplazar en `data\`. Después se
   sube la carpeta a Google Drive. **Esto es lo único que hay que hacer siempre.**
3. La app avisa si hay cambios sin guardar (cartel + aviso al cerrar la pestaña).
   Al cargar, "el archivo manda" (los datos del archivo pisan lo del navegador).

## Los 3 botones de la pestaña de export
1. **"Guardar datos en mi carpeta"** (`exportDataFile`) — el del día a día. Solo baja
   los 2 archivos de datos para reemplazar en `data\`.
2. **"Descargar respaldo completo (ZIP)"** (`exportAuthoringZip`) — ZIP autónomo con
   la app + todos los datos embebidos. Para respaldar o llevar a una PC sin la carpeta.
   Se descomprime y se abre `index.html` directamente. (Ocasional.)
3. **"Descargar para publicar (ZIP)"** (`exportHtml`) — build liviano de **carga por
   demanda** para subir a hosting (Netlify / Cloudflare Pages). Genera
   `manifest.js` + `data/t/*.json` + `data/p/*.json` frescos desde la data actual.
   El token de Lichess **nunca** se incluye.

## Actualizar el ranking FIDE (mensual)
La lista de Jugadores es el ranking FIDE de Argentina. Cada mes FIDE publica un nuevo
`standard_rating_list.txt`. Para actualizar: pestaña **Jugadores** → botón **"Actualizar
ranking FIDE"** → subir el .txt. La app arma la lista de **activos ARG con elo ≥ 1700**
(excluye inactivos: Flag con `i` → `i`/`wi`), muestra un resumen y pide confirmación.
- Preserva el `id` de cada jugador por su `fide_id` (no se rompen fotos/favoritos/partidas).
- NO toca partidas, estadísticas ni torneos: solo cambia el ranking y las posiciones.
- Detecta el mes del encabezado de la tabla (ej. columna `JUN26` → "Junio 2026").
- La solapa **Femeninos** filtra por **sexo** (dato que trae la tabla), no por título.
- Umbral en la constante `_FIDE_MIN_ELO` (hoy 1700). El override se guarda en localStorage
  (`fide_ranking`) y se embebe en los 3 exports (`__EMBEDDED_PLAYERS__`).
- Después de actualizar, usar **"Guardar datos en mi carpeta"** para que quede guardado.

### Jugadores "Adicionales" (fuera del ranking)
Para argentinos que juegan con **otra bandera** (ej. Alan Pichot → ESP) o que querés tener
aunque no estén en el top activo. Botón **"Agregar jugador adicional"** (modo autor): se
cargan por **FIDE id** + nombre (+ federación opcional). Quedan en la solapa **"Adicionales"**,
NO en el ranking numerado, pero tienen perfil/foto/favoritos/partidas como cualquiera (id
estable por `fide_id`, campo `ranked:false`). La actualización mensual de la tabla los conserva
y les **refresca elo/título/federación** por fide_id (sin importar federación ni actividad), así
si suben de elo se refleja. Quedan reconocidos como argentinos en torneos aunque su bandera sea
extranjera (vía `_getArgFideSet`). Se guardan en `fide_ranking.additionals` y se embeben en los
exports.

**Al actualizar la tabla, los que SALEN del ranking** (pasan a inactivos, bajan de 1700, o cambian
de federación) no desaparecen: se **conservan como Adicional** si valen la pena —elo ≥ 2000
(`_ADIC_KEEP_ELO`), o ≥ 30 partidas en el sitio (`_ADIC_KEEP_GAMES`), o ya tienen foto/favorito—; si
no (ocasional de poco elo sin partidas), se **quitan** (sin borrar datos; la app recuerda su id y
reaparecen si vuelven). El nombre de los adicionales se toma exacto del listado FIDE por fide_id, y
se marca "inactivo" en tarjeta/perfil. (Pendiente fase 2: auto-sugerir adicionales detectados en
partidas cargadas.)

**Buscar jugadores frecuentes (fase 2):** botón en la pestaña Jugadores (modo autor) que lista
jugadores con **≥ 50 partidas** en el sitio (`_SUGGEST_MIN_GAMES`) que aún no tienen perfil. Como las
partidas solo traen nombres (sin federación, casi sin fide_id), NO se autodetecta nacionalidad: es una
**lista para revisar** y el autor tilda los argentinos (ideal para leyendas). Por cada uno puede pegar
el FIDE id (se actualiza cada mes con la tabla) o dejarlo solo con nombre (engancha sus partidas por
nombre). Crea Adicionales. Umbral de "conservar al salir del ranking" es 30 (`_ADIC_KEEP_GAMES`),
distinto del de sugerencia (50).

## Publicar la web
Apretar "Descargar para publicar (ZIP)", descomprimir y arrastrar la carpeta a
**Netlify** o **Cloudflare Pages** (gratis). Cada vez que se quiera actualizar la web
con datos nuevos, se regenera el ZIP y se vuelve a subir.

## Cosas importantes a no romper
- **Token de Lichess** (para el libro de aperturas): vive solo en el navegador y
  **nunca** debe quedar incrustado en lo que se publica. Ya hubo un incidente de token
  filtrado por incrustarlo en el HTML.
- El `index.html` publicado debe cargar `data/manifest.js` (no `embedded-data.js`), y
  el manifest debe incluir **noticias y zona horaria**, si no la web publicada abre sin
  torneos o muestra las noticias de ejemplo.
- Cuidado al escribir `</script>` dentro de strings en el JS inline: hay que escaparlo
  como `<\/script>` o el navegador corta el script y rompe toda la app.

## Git
Rama local `master` → remoto `origin/main` (GitHub `PupiCruz/Ajedrez-Argentino-`).
Cloudflare Pages redeploya solo al pushear a `main` (~1-2 min) → `chessargentino.pages.dev`.
El Worker del teléfono (editar.html) también pushea a `main`: si el push de la PC
rebota, hacer `git fetch` + `git rebase origin/main` y pushear de nuevo.
**Qué SÍ se commitea:** el código (`index.html`, `editar.html`, assets, scripts) **y los datos
ya publicados** que consume la web: `data/manifest.js`, `data/t/`, `data/p/`, `data/ph/`,
`data/fl/`, `data/cr/`, `data/games_0.json`, `data/games_1.json`, `data/book.json`, `data/datos.json`,
`data/puzzles.json`, `data/practice.json`, `data/hardcoded.js`, `data/live-*.json`.
**Qué NO se commitea** (archivos gigantes de autor, van a Drive; están en `.gitignore`):
`data/embedded-data.js`, `data/embedded-photos.js`, `data/embedded-flyers.js`,
`data/_fs-fingerprints.json`.
O sea: cuando cargás torneos, además de "Guardar datos en mi carpeta" (que actualiza los
embedded-* para Drive) hay que **commitear los `data/` regenerados** o la web no se entera.

## Memoria por PC (no viaja con esta carpeta)
Las notas detalladas sesión por sesión que toma Claude viven en el perfil de la PC
(`...\.claude\...\memory\`) y **no** se sincronizan con Drive. Esta carpeta y este
`CLAUDE.md` sí viajan; por eso el resumen importante va acá.
