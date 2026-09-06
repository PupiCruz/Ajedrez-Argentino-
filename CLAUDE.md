# Ajedrez Argentino — guía del proyecto

> Esta nota la lee Claude automáticamente al abrir esta carpeta, en cualquier PC.
> Sirve para retomar el trabajo aunque sea en otra computadora o sesión nueva.

## 🏷️ Cómo NOMBRAR los torneos (juveniles, femeninos, veteranos)

La Radiografía reparte tres medallas de categoría —**mejor sub-20**, **mejor femenina** y
**mejor +50**— y con ellas se arma la vitrina de trofeos de los perfiles. Para saber cuándo esas
medallas **no** corresponden (en un Sub-18 todos son sub-20; en un femenino la mejor femenina es la
campeona), la app **lee el NOMBRE**.

> **Atajo para lo femenino: el campo _Rama_ de la ficha del torneo.**
> En **Editar torneo** hay un desplegable **Rama** con tres opciones: *Detectar por el nombre*
> (lo de siempre), *Absoluto / mixto* y *Femenino*. Si lo marcás, **manda sobre el nombre**.
> Es la salida para los torneos de mujeres que no lo dicen en ningún lado (`She Plays 2026`):
> por el nombre es imposible saberlo. Marcalo y la Radiografía deja de adivinar.
> Para las otras dos medallas (sub-20 y +50) sigue mandando el nombre; ahí valen las reglas de abajo.

Se mira el **nombre del torneo + el nombre de la categoría**, juntos. Así que alcanza con que la
palabra esté en uno de los dos.

| Si el torneo es… | Escribí en el nombre | Qué pasa |
|---|---|---|
| **Juvenil por edad** | `Sub 14`, `Sub14`, `U16`, `SUB 18A`, `SUB 18F` | no reparte "mejor sub-20" |
| **Juvenil sin número** | `juvenil`, `juventud`, `cadete`, `infantil`, `junior`, `youth`, `menores` | se toma como tope 20 |
| **Sólo de mujeres** | `Femenino`, `Femenina`, `Damas`, `Women`, `Girls`, o la categoría `SUB 14F` — **o el campo Rama = Femenino** | no reparte "mejor femenina" |
| **De veteranos** | `Senior`, `Veteranos`, `+50`, `mayores de 50` | no reparte "mejor +50" |
| **Mixto con las dos ramas en UNA tabla** | `Absoluto y Femenino` (las dos palabras juntas) | **SÍ** reparte "mejor femenina" |

**Ejemplos que funcionan bien:**
- `XXXVI Festival Panamericano de la Juventud 2026` con categorías `SUB 10A`, `SUB 12F`, `SUB 18A`…
- `Campeonato Panamericano U-20 2026` con categorías `Absoluto` y `Femenino`
- `77° Campeonato Argentino Superior Femenino`
- `Campeonato de España Individual Absoluto y Femenino` (una sola tabla mixta de 142 → conserva la
  medalla femenina, y está bien: la mejor femenina ahí es un logro de verdad)

**Cuidados:**
- **`Sub 2400` / `Sub2000` / `U1700` son topes de RATING y la app los distingue** (exige 1 o 2
  dígitos). No hay nada que hacer: se comportan como un torneo común.
- Para las categorías, poné **`Absoluto` / `Femenino`** (o el par corto `A` / `F` pegado al número,
  tipo `SUB 18A`). **`Varones` y `Mujeres` NO se reconocen** hoy.
- Si el torneo es juvenil pero el nombre no lo dice, poné la edad en la **categoría**: alcanza.
- Si un torneo mixto se llama sólo "Femenino" por error, se le borra una medalla legítima. Se
  desarma poniendo **Rama = Absoluto / mixto**, sin tocar el nombre.
- El campo Rama se guarda en el torneo (`rama: 'abs' | 'fem'`), viaja al publicar y llega a la
  Radiografía por `metaCr`. Sin marcar (`''`) todo funciona como antes.

**Cómo comprobarlo:** abrí la Radiografía del torneo. Si ves un premio que es obvio por el formato
("mejor sub-20" en un Sub-16), el nombre necesita la palabra. **Corregí el nombre y volvé a
publicar**: la Radiografía se recalcula entera en cada publicación, así que se arregla sola —
también en las vitrinas de los perfiles, que salen de lo mismo.

(Estas mismas reglas ya dejan afuera las medallas obvias en 25 de las 185 del catálogo. Detalle en
`_stTopeEdad` / `_stSoloFemenino` / `_stSoloVeteranos` del `index.html`, con pruebas en la sección
34 del banco.)

## ✅ Auditoría 2026: TERMINADA
La auditoría de seguridad y código del **26/08/2026** (27 hallazgos) se arregló entera en
**8 fases**, todas publicadas y andando al **27/08/2026**. El registro completo de qué se
cambió y por qué está en **`PLAN-AUDITORIA.md`** (en esta misma carpeta): conviene leerlo
antes de tocar cuentas, moderación, chats o el arranque de la página.

## 🧪 Bancos de pruebas — correrlos antes y después de tocar esas partes
Son ocho y no necesitan instalar nada (Node y listo). **Cuántas comprobaciones tiene cada uno lo
dice el propio banco al terminar**, y por eso no está copiado acá: un número escrito a mano en dos
lugares se pudre solo. (Pasó: este archivo decía 394 cuando el banco de la web ya iba por 542.)

| Banco | Qué cubre | Cómo se corre |
|---|---|---|
| `ajedrez-argentino/test-web.mjs` | index.html y editar.html | `cd ajedrez-argentino` y `node test-web.mjs` |
| `cloudflare-worker/test-cuentas.mjs` | cuentas, frenos, rating, moderación | `cd ajedrez-argentino/cloudflare-worker` y `node test-cuentas.mjs` |
| `cloudflare-worker/test-logros.mjs` | reglas de los logros del perfil | `cd ajedrez-argentino/cloudflare-worker` y `node test-logros.mjs` |
| `vivo-worker/test-sala.mjs` | el motor de las salas (asientos, cola, rotación) | `cd vivo-worker` y `node test-sala.mjs` |
| `vivo-worker/test-salas.mjs` | salas de partida, hibernación, reloj | `cd vivo-worker` y `node test-salas.mjs` |
| `vivo-worker/test-lobby.mjs` | lobby, los tres chats, desafíos, sanciones, bloqueo | `cd vivo-worker` y `node test-lobby.mjs` |
| `vivo-worker/test-presencia.mjs` | presencia: salón, punto verde, contador del chat | `cd vivo-worker` y `node test-presencia.mjs` |
| `vivo-worker/test-desafio-invitados.mjs` | no aceptar desafíos de invitados | `cd vivo-worker` y `node test-desafio-invitados.mjs` |

Ya cazaron varios bugs antes de que llegaran al sitio. Si uno falla, **no publicar**.

### ⚠️ Mirar el NÚMERO, no sólo el ✅
`test-web.mjs` saca las funciones del `index.html` **recortándolas por nombre**. Si una función
empieza a llamar a un ayudante que no está en la lista de su bloque, la copia recortada revienta y
**Node mata el archivo entero**: dejan de correr cientos de pruebas y el resumen igual dice que
pasaron. Pasó de verdad (corrían 82 de 303 durante días, en silencio).

Por eso el banco cuenta las comprobaciones y termina con `Corrieron N de M`. **Si esos dos números
no son iguales, no publicar.** La regla se comprueba sola: los dos números los imprime el banco, así
que no hay que saber de memoria cuánto tiene que dar. Si se corta, avisa solo y dice **qué ayudante
falta**; el arreglo es agregarlo a la lista de nombres de ese bloque (buscá `extraerFuncion`). Al
agregar pruebas hay que subir la constante `ESPERADAS`, que vive en el propio banco; nunca baja sola.

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
