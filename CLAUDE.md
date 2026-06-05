# Ajedrez Argentino — guía del proyecto

> Esta nota la lee Claude automáticamente al abrir esta carpeta, en cualquier PC.
> Sirve para retomar el trabajo aunque sea en otra computadora o sesión nueva.

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
- `data/embedded-photos.js` — fotos de jugadores.
- `data/hardcoded.js` — datos curados (PLAYER_GAMES + PGN_DB).
- `data/manifest.js`, `data/t/`, `data/p/` — "pedacitos" para la web publicada
  (carga por demanda). **Se regeneran solos al publicar**; no se tocan a mano.
  Están ignorados por git.
- `assets/` — motor Stockfish (self-host), librería de ajedrez, piezas SVG, sonidos.
  **La app no tiene ninguna dependencia externa en runtime** (anda sin internet).
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
exports. (Pendiente fase 2: auto-sugerir adicionales detectados en partidas cargadas.)

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
Repo **local** (sin remoto), rama `master`. Se commitea el código (`index.html`,
assets, scripts); **no** se commitea `data/embedded-data.js` (datos → Drive).

## Memoria por PC (no viaja con esta carpeta)
Las notas detalladas sesión por sesión que toma Claude viven en el perfil de la PC
(`...\.claude\...\memory\`) y **no** se sincronizan con Drive. Esta carpeta y este
`CLAUDE.md` sí viajan; por eso el resumen importante va acá.
