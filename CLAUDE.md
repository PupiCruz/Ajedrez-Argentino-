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
>
> **Y en los torneos POR CATEGORÍAS, la Rama es de CADA CATEGORÍA.** Abrí el torneo, entrá a la
> categoría y tocá el panelcito **⚥ Rama** del encabezado (sólo en modo autor). Es el tilde que
> evita depender del nombre: en los XIII Juegos Suramericanos hay `Blitz Abs` / `Blitz Fem` /
> `Rápido Abs` / `Rápido Fem`… y con marcarlas queda cerrado. La de la categoría **pisa** a la del
> torneo, y viaja a la Radiografía horneada igual que la del torneo.
> Al lado está **🗂 Sistema** (Suizo / Todos contra todos), por si un torneo mezcla los dos —los
> blitz todos-contra-todos y los rápidos suizos, mismo caso—: decide si se dibuja el cuadro cruzado
> o sólo la tabla. Sin tocarlo, la categoría hereda el sistema del torneo.

Se mira el **nombre del torneo + el nombre de la categoría**, juntos. Así que alcanza con que la
palabra esté en uno de los dos.

| Si el torneo es… | Escribí en el nombre | Qué pasa |
|---|---|---|
| **Juvenil por edad** | `Sub 14`, `Sub14`, `U16`, `SUB 18A`, `SUB 18F` | no reparte "mejor sub-20" |
| **Juvenil sin número** | `juvenil`, `juventud`, `cadete`, `infantil`, `junior`, `youth`, `menores` | se toma como tope 20 |
| **Sólo de mujeres** | `Femenino`, `Femenina`, **`Fem`**, `Damas`, `Women`, `Girls`, o la categoría `SUB 14F` — **o el campo Rama = Femenino** (del torneo o de la categoría) | no reparte "mejor femenina" |
| **De veteranos** | `Senior`, `Veteranos`, `+50`, `mayores de 50` | no reparte "mejor +50" |
| **Mixto con las dos ramas en UNA tabla** | `Absoluto y Femenino` (o `Abs y Fem`) | **SÍ** reparte "mejor femenina" |

**Ejemplos que funcionan bien:**
- `XXXVI Festival Panamericano de la Juventud 2026` con categorías `SUB 10A`, `SUB 12F`, `SUB 18A`…
- `Campeonato Panamericano U-20 2026` con categorías `Absoluto` y `Femenino`
- `77° Campeonato Argentino Superior Femenino`
- `Campeonato de España Individual Absoluto y Femenino` (una sola tabla mixta de 142 → conserva la
  medalla femenina, y está bien: la mejor femenina ahí es un logro de verdad)

**Cuidados:**
- **`Sub 2400` / `Sub2000` / `U1700` son topes de RATING y la app los distingue** (exige 1 o 2
  dígitos). No hay nada que hacer: se comportan como un torneo común.
- Para las categorías sirve **`Absoluto` / `Femenino`**, la abreviatura **`Abs` / `Fem`**, o el par
  corto `A` / `F` pegado al número (`SUB 18A`). **`Varones` y `Mujeres` NO se reconocen** hoy.
  Y si preferís no depender del nombre: el tilde **⚥ Rama** de la categoría.
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

## 🏛️ Torneos históricos (colecciones)

En **Torneos** hay un botón **🏛️ Torneos históricos**: adentro están las **colecciones** (Olimpíadas, Mar
del Plata, Torneo Clarín, Festival Najdorf) como tarjetas, y adentro de cada una sus torneos, también
como tarjetas. Al tocar uno se abre la ficha de siempre.

- **Meter un torneo en una colección:** ✏️ Editar torneo → **Colección**. Con el tilde **"Mostrar también
  en la lista general"**, aparece en los dos lados (ej. Budapest 2024: en Finalizados y en Olimpíadas);
  sin el tilde, **sólo** en su colección (los viejos, para no llenar la lista de todos los días), aunque
  el **buscador** lo encuentra igual, con la etiqueta 🏛️ HISTÓRICO. Es el **mismo torneo**: no se duplica.
- **Sin flyer**, la tarjeta lleva una **portada automática** (año grande, sede, color de la colección).
- **Crédito del flyer:** si la imagen es prestada, en Editar torneo, debajo del flyer, van el crédito y
  su link (aparece chiquito debajo del flyer). El Museo de la FIDE lo pide: *link activo a la fuente*.
- **Una colección nueva** = un renglón en `COLECCIONES` del `index.html` (nombre, etiqueta, colores).
- **📥 Importar torneo histórico** (modo autor, dentro de la sección): carga un **paquete** `.json` con la
  ficha, los cuadros de cada categoría y las partidas (van al pool, una por categoría). Volver a importar
  el mismo torneo lo **reemplaza**. **Después: 💾 Guardar datos en mi carpeta** (hasta entonces las
  partidas viven sólo en la pestaña) **y publicar.** Antes de cargar, el cartel muestra el **informe**:
  cuántas mesas encontraron su partida (ojito), mesas sin partida, nombres dudosos, resultados que no
  coinciden, países sin traducir o sin bandera. Reimportar **conserva el flyer** que le hayas puesto.
- **🔖 Copiar de OlimpBase** (modo autor, al lado de Importar, 25/09/2026): el autor carga Olimpiadas
  **solo, sin Claude**. El botón arma un **favorito** del navegador (bookmarklet) con el lector entero
  (`herramientas/olimpbase-lector.js`): se arrastra a la barra de favoritos, se abre la Olimpiada en
  olimpbase.org y se toca. Lee página por página (una cada ~1,2 s, para no cargar a OlimpBase; su filtro
  anti-robots no se esquiva: se lee desde su propia pestaña) y **baja el paquete .json** →
  📥 Importar. Si se cambia el lector, hay que **volver a arrastrar** el favorito. Hoy lee las Olimpiadas
  de todos contra todos (1927–1939 y 1950) y, desde el 28/09/2026, las **suizas de 1976 a 1996** (las de
  1998 en adelante vienen de Chess-Results) y, desde el 30/09/2026, las de **grupos y finales (1952–1974)**: cada
  etapa decide sola si es suiza o todos contra todos (la Final C de Leipzig 1960 y Varna 1962 fue suiza → esa
  categoría lleva `format:'swiss'` y sus `rounds`). **Femeninas:** las que se jugaron **junto** con la abierta
  (1972 Skopie, 1976 Haifa, 1978 Buenos Aires) van en el mismo torneo; si alguna de las dos tiene grupos, las
  categorías se llaman "Absoluto · Final A", "Femenino · Grupo 1"… con el campo **`grupo`** ("Absoluto" /
  "Femenino") y la ficha las muestra en **dos pisos** (arriba Absoluto | Femenino, abajo las etapas). Las que se
  jugaron **aparte** (1957 Emmen, 1963 Split, 1966 Oberhausen, 1969 Lublin, 1974 Medellín) son un torneo propio
  (`tz_ob1957w`, "1.ª Olimpíada Femenina de Ajedrez · Emmen 1957", `rama:'fem'`): el favorito se toca parado en
  su página (/1957w/…). Si unas pocas partidas del PGN traen mal el AÑO (Helsinki 1952: "1951"), se corrigen
  (`informe.fechasPgn`). En las suizas la tabla sale
  como la de Chess-Results (`kind:'final'`: matches +/=/− y desempates en el orden oficial de ese año), los
  BYE no se guardan como cruce (van al informe), la **Olimpiada femenina** (carpeta `/AAAAw/`, misma sede)
  entra sola como 2.ª categoría "Femenino" desde 1980 (`rama:'fem'`; la abierta queda "Absoluto", `rama:'abs'`) y el PGN se toma de `/ob-games/AAolm.pgn` aunque la ficha
  enlace un .zip. Alemania Occidental = `FRG` (bandera de hoy); Zaire/Yemen del Norte/del Sur sin bandera. **Banderas por época** (28/09/2026): el lector sabe el año y le pone a Yugoslavia `YGE` (con estrella, 1946-1991) o `YGL` (tricolor lisa: el reino y 1992-2003), y a las Antillas Neerlandesas antes de 1986 `AHX` (seis estrellas); `AHO` a secas = cinco estrellas (1986-2010) y Serbia y Montenegro (`SCG`) la lisa. `YUG` a secas sigue sin bandera. Tabla `_FED_HIST_FLAG` / `_FED_ERA`.
  El número de cada partida en el PGN (`show_game_ob('37olm.pgn', '9')`) lo da OlimpBase: el ojito
  engancha exacto. Para 1939 los programitas viejos de `.claude/olimpbase/` quedaron de historia.
- **El árbol de aperturas sigue siendo de argentinos** (24/09/2026): de los torneos de una colección
  se ven TODAS las partidas al entrar (y el buscador las encuentra), pero al árbol (Partidas → 🌳)
  sólo suman las que juega algún argentino. En una Olimpiada manda el **equipo** del PGN
  (`WhiteTeam`/`BlackTeam`): Eliskases jugó 1939 por Alemania. Sin equipos, se reconoce al argentino
  por país/FIDE id/nombre conocido o por la formación de Chess-Results. Al guardar, el índice publicado
  marca `na:1` las que no van. Código: `_arbolHistEventos`, `_arbolTieneArg`, `_arbolFuera`.
- **📥 Subir partidas** (modo autor, arriba a la derecha de la ficha, junto a "Marcar finalizado"):
  sube un PGN directo a ESE torneo y a la categoría que se está mirando. Sirve para los históricos,
  que no aparecen en la lista de "Subir partidas a la base de datos" (ofrece sólo los últimos 10
  finalizados). En un histórico avisa cuántas suman al árbol. **Después: 💾 Guardar en mi carpeta.**
- Por categoría, dos marcas que respeta la ficha: `inicial: true` (abre en esa pestaña, ej. la Final A) y
  `sinPodio: true` (sin podio, ej. los grupos preliminares de una Olimpiada vieja).
- En la web publicada el botón y cada colección aparecen **recién cuando tienen algún torneo**.
- **Fuentes y permisos:** los datos de OlimpBase se usan con permiso de Wojciech Bartelski (18/09/2026),
  con una sola condición: **citar la fuente** → cada torneo lleva en "Sitio web del torneo" el link a su
  página de OlimpBase (sale como "📚 Fuente de los datos: OlimpBase").

## 🧉 El Pupi (comentarista con mate, 05/10/2026)
La caricatura del autor que mira la partida en el visor y la comenta (colgadas, jugadones, cómo vienen los
jugadores, datos de torneos, la siesta del "pelotazo"…). Lo que dice sale del análisis que ya hace la app
(`_faComHtml`), nada de IA.
- **El código NO se edita en el index:** vive en `prototipos/comentarista/pupi.js` + `pupi.css` (fuera de esta
  carpeta) y se copia al final del `index.html`, entre las marcas `PUPI:INICIO` y `PUPI:FIN`, con
  `node prototipos/comentarista/pasar-al-index.cjs`. Si esa carpeta se perdiera, la copia del index está completa.
- **Maqueta para probar:** `node prototipos/comentarista/servir.cjs 8141` (saca el bloque del index y pone el de la carpeta).
- **Caras y sonidos:** `assets/pupi/caras/*.webp` y `assets/pupi/sonidos/*.wav` (ya recortados y emparejados de
  volumen). Se "hornean" desde la maqueta con `await __pupi.hornear()` en la consola. **/assets/* se cachea un año:**
  al cambiar alguno, subir `PUPI_V` y actualizar las listas `PUPI_CARAS` / `PUPI_SONIDOS` / `PUPI_MASCARAS` en pupi.js.
- **🎞️ El Pupi animado (14/10/2026):** el avatar es un `<canvas>` WebGL (`crearVivo()` en pupi.js). Cada cuadro
  dibuja **la misma imagen de la cara**, deformada en el shader (`FS`): respira, mueve la cabeza desde el cuello,
  parpadea, mira de reojo y, **mientras el globo escribe el título letra por letra** (`escribir()`), la boca lo dice
  (abre en vocales, cierra en m/b/p y en los signos). Especiales: escupe (a los 1,2 s pasa a `vida` o `triste`, con
  el mismo sorteo de la jugada que elige horror/escupe → `c.despues`), uff, atraganta (el reloj arranca **con el
  audio** `tos1.wav`: `vivo.alinear()` desde `sonar()`, así los sacudones caen en los "cof"), dormido, bostezo,
  chau, contento3, ceba… **Sin WebGL queda la imagen quieta de siempre.** Con "reducir movimiento" sólo habla.
  - **Las medidas de cada cara** (en píxeles del dibujo de 341×308: ojos `ojoL/ojoR` = centro y radios, pupilas,
    `boca` cerrada que se abre o `abierta` que se cierra, `cuello`, manos, `marcas` que giran/tiemblan/titilan…)
    están en la tabla **`VIVO_CARAS`** de pupi.js. El contorno de arriba y de abajo de las bocas abiertas, columna
    por columna, está en **`VIVO_BORDES`** (= `bordes.json` del paquete) o en el `bordes` de la propia cara.
    Las caras sin medidas (ofendido2) sólo respiran y mueven la cabeza (`VIVO_SIN_MEDIDAS`).
  - **Máscaras** (no se ven solas): `assets/pupi/mascaras/*.png` — escupe (rojo = chorro que vuela, verde = zona
    que se rellena con `escupe-debajo`), uff (rojo = el mate que vuela, verde = rayitas, azul = queda vacío) y las
    manos de chau y contento3. Cuál usa cada cara: `VIVO_MASC` / `mascarasDe()`.
  - **Para calibrar una cara nueva:** la fuente y la maqueta están en el Escritorio,
    `MINIATURAS\caras-para-dibujar\pupi-animado\` (`codigo/plantilla.html` + `maqueta/pupi-vivo.html`; copia de la
    maqueta en `prototipos/comentarista/pupi-vivo.html` → `http://localhost:8141/__pupi/pupi-vivo.html` con la
    maqueta del Pupi andando). Se mide en la maqueta, se copia el renglón a `VIVO_CARAS` y se prueba en la consola
    con `__pupi._vivo().forzar = { blink: 1 }` (o `mouth`, `look: [x, y]`, `esp`: segundos del especial) y
    `__pupi._pintar({ cara: 'horror', titulo: 'Probando la boca' })`. Después: `PUPI_V`, pasar-al-index, banco.

## 🔎 Google: fichas de texto y sitemap (06/10/2026)
Search Console mostró que Google tenía indexadas 34 de 1.847 páginas: todas devolvían el mismo
`index.html` y lo propio de cada una aparecía recién con el JavaScript.
- **Fichas:** al apretar 💾 Guardar en mi carpeta, `_seoDatos()` arma `data/seo/t0..7.json` (tablas de
  los torneos) y `data/seo/j0..15.json` (torneos de cada jugador). El servidor (`functions/index.js`)
  lee el archivito que corresponde y mete un bloque de texto con links **justo después de
  `<script id="dl-cover">`** (la pantalla "Cargando…"). Un script lo **borra en el acto**, así que el
  visitante no lo ve nunca. **No cambiarle el id a ese script.**
- El reparto en archivitos (`_seoShard` / `shard`) y las cantidades (8 y 16) tienen que ser
  **iguales en los dos archivos**.
- **Canonical sin `?cat=`** en los torneos (salvo con una partida abierta) y título con
  "posiciones, resultados y partidas": se cambian **en los dos lados** (`_seo*` en index.html y
  functions/index.js), si no la misma página queda con dos títulos.
- **📖 Sobre el torneo** (23/10/2026): campo `about` de Editar torneo (texto con `## Título`, `- lista`,
  `**negrita**`, `[link](https://…)`). Se ve en la ficha (`_tdAboutHtml`), va ENTERO en la ficha para Google
  (`p` en data/seo/t*.json) y su primer párrafo es la descripción (5.º lugar de og.json). Las reglas de
  formato están dos veces (`_aboutBloques` en index.html y `aboutBloques` en functions/index.js): cambiarlas
  en los dos lados (lo controla la sección 81 del banco). Sirve para los torneos PRÓXIMOS, que no tienen tabla.
- **🗳️ Encuesta del torneo** (23/10/2026): en Editar torneo (pregunta + hasta 4 opciones con foto + "hasta").
  Va arriba a la derecha de la ficha (`_tdEncHtml`). Los votos los cuenta el bot (`vivo-worker/src/encuestas.js`,
  Durable Object `Encuesta`), que SÓLO acepta las encuestas de `data/encuestas.json` (lo escribe 💾 Guardar,
  `_encuestasJson`): una encuesta nueva funciona recién después de guardar y publicar. Las caras del Mundial:
  `data/fl/wcm2026-gukesh.jpg` y `wcm2026-sindarov.jpg` (recortadas del flyer).
- **Sitemap:** `lastmod` es la fecha real (fin del torneo, último torneo del jugador). Sin fecha
  conocida, o si tiene más de un año sin fecha de alta, va **sin** lastmod.

## ✅ Auditorías 2026: TERMINADAS
La auditoría de seguridad y código del **26/08/2026** (27 hallazgos) se arregló entera en
**8 fases**, todas publicadas y andando al **27/08/2026**. La **segunda, del 23/09/2026**
(21 hallazgos, sobre Lichess, arenas, colgadas y la Olimpiada), se arregló en **4 fases** el mismo
día. El registro completo de qué se cambió y por qué está en **`PLAN-AUDITORIA.md`** (en esta
misma carpeta, la más nueva arriba): conviene leerlo antes de tocar cuentas, moderación, chats,
los proxys del Worker o el arranque de la página.

## 🪶 Rendimiento (auditoría 22/10/2026, Fase 5)
`publicar-web.cmd` arma tres cosas antes de subir (si alguna falla, la web sigue como antes):
- **Partidas por partes** (`herramientas/armar-indices-partidas.mjs`): corta `data/games_*.json` en `data/gi/`
  (búsqueda por jugador: paquetes por apellido) y `data/ob/` (explorador: primeras jugadas ya contadas + hojas).
  La web baja sólo el pedazo que necesita (`_gpBuscar`, `_obPartesCalc`). Los `games_N.json` siguen: los usa la
  búsqueda sin apellido y el modo autor. Ojo con el límite de Cloudflare: 20.000 archivos en total.
- **La página liviana** (`herramientas/armar-web-liviana.mjs` → `web.html`): la copia de `index.html` sin comentarios
  ni espacios (esbuild de vivo-worker, sin cambiar nombres) y sin `PLAYERS`. La sirve `functions/index.js` en "/".
  **Se edita siempre `index.html`**; `web.html` no se toca a mano.
- **Versión por archivo** (`herramientas/versiones-datos.mjs` → `data/versiones.js`): el número de cada archivo grande
  sale de su contenido (`_dataV('book.json')`). `data/t`, `p`, `cr` siguen con `__DATA_TS__`.
- Los nombres de las tablas: el manifest lleva sólo los recientes (`_crNombresRecientes`, 60 días); todos van en
  `data/cr-nombres.json` y se bajan al usar el buscador de Torneos. Hace falta un 💾 Guardar para que se armen.

## 🧪 Bancos de pruebas — correrlos antes y después de tocar esas partes
Son dieciséis y no necesitan instalar nada (Node y listo). **Cuántas comprobaciones tiene cada uno lo
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
| `vivo-worker/test-colgadas.mjs` | el arbitrito que reparte los avisos de colgadas | `cd vivo-worker` y `node test-colgadas.mjs` |
| `vivo-worker/test-reparto.mjs` | el motor repartido (las PC se reparten los tableros de la ronda) | `cd vivo-worker` y `node test-reparto.mjs` |
| `vivo-worker/test-bandeja.mjs` | la bandeja de evaluaciones de los visitantes (📥, se adoptan en modo autor) | `cd vivo-worker` y `node test-bandeja.mjs` |
| `vivo-worker/test-final-torneo.mjs` | 🏁 el aviso del bot al marcar un torneo Finalizado (podio → canal y hilo de Discord) | `cd vivo-worker` y `node test-final-torneo.mjs` |
| `vivo-worker/test-avisos-ronda.mjs` | los avisos de ronda del bot: nacional (primeras mesas) vs internacional (los argentinos) | `cd vivo-worker` y `node test-avisos-ronda.mjs` |
| `vivo-worker/test-titulados.mjs` | 🏆 avisos de los Titled Tuesday/Thursday de Chess.com en #en-vivo + 🌐 ratings online en /jugador | `cd vivo-worker` y `node test-titulados.mjs` |
| `vivo-worker/test-ranking-musica.mjs` | 🎵 ranking de Música en el Tablero: sólo con cuenta (cr-proxy), los puntos los cuenta el servidor con el acta (y con el juego de verdad jugado en Node: tiene que dar lo mismo), frenos, orden, 100 mejores, 🗑️ de moderadores | `cd vivo-worker` y `node test-ranking-musica.mjs` |
| `vivo-worker/test-token-lichess.mjs` | 🔑 aviso por privado al autor si el token de Lichess de cr-proxy (`LICHESS_TOKEN`, permiso study:read) falla o vence | `cd vivo-worker` y `node test-token-lichess.mjs` |
| `vivo-worker/test-errores.mjs` | 📛 errores de la web en los visitantes: limpieza (sin datos personales), se juntan los iguales, freno, `/errores` del bot | `cd vivo-worker` y `node test-errores.mjs` |
| `vivo-worker/test-encuestas.mjs` | 🗳️ encuestas de la ficha del torneo: sólo las publicadas en data/encuestas.json, opciones, cierre, un voto por navegador (cambiable), freno por red, resultado en memoria | `cd vivo-worker` y `node test-encuestas.mjs` |
| `vivo-worker/test-avisos.mjs` | 🔔 avisos al teléfono (Web Push): cifrado igual al ejemplo del RFC 8291, firma VAPID, aparatos y temas por cuenta, cola de a 40, noche, racha de las 22 | `cd vivo-worker` y `node test-avisos.mjs` |

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
  Motor principal: `stockfish-19-lite-single.{js,wasm}` (SF19 con red neuronal NNUE, 1,8 MB,
  un solo hilo, el mismo build que usa Chess.com; reemplazó al SF18 el 30/09/2026). Plan B y modo `file://` (doble clic):
  `stockfish-embedded.js` (SF16 en base64, sin red). La lógica está en `sfStart()`.
  **Librería de ajedrez** (`assets/chess.min.js`, desde el 04/10/2026): es **chess.js 1.4.0** (4 a 30
  veces más rápida) envuelta en un **traductor** que le pone la cara EXACTA de la vieja 0.10.3
  (`load_pgn`, `in_check`, `move()` que devuelve null…), así que el `index.html` no cambió. **No se
  edita a mano:** se arma con `node herramientas/chess-compat/armar.cjs` (fuentes en esa carpeta) y
  se compara contra la vieja con `node herramientas/chess-compat/comparar.cjs` (tiene que decir
  "CERO diferencias"). Si se cambia, subir el `?v=` del `<script>` (va por v=3) en `index.html` y `editar.html`
  (`/assets/*` se cachea un año).
- `iniciar-servidor.cmd` / `serve.ps1` — levantan un servidor local para abrir la app.
- `juegos/musica-en-el-tablero/` — 🎵 **Música en el Tablero**, el juego de ritmo (17/10/2026). Es una página
  aparte; se entra desde la tarjeta de arriba de **Jugar** (`#lv-musica`). **No se edita acá:** el original vive
  en `Desktop\Claude Code\ChessHero` y se trae con `node herramientas/llevar-a-la-web.js` (desde ChessHero), que
  pisa esta carpeta. Piezas, fondos y el Pupi salen de `/assets/`. `pupi-datos.json` lo arma `publicar-web.cmd`
  (`herramientas/armar-datos-pupi.js`). El ranking de todos vive en el vivo-worker (`/musica/…`, Durable
  Object `RankingMusica`; sólo para quien entró con su cuenta: el nombre es su usuario de Lichess). Para probarlo contra el worker de esta PC: `?vivolocal=1` (como el resto de Jugar).
  📱 Teléfono (17/10): piezas en sprites, reloj suave, retraso automático del navegador, nota adelantada si el
  retraso es ≥ 0,1 s, sin barra al jugar, botón 🎧 Ritmo; `?medir=1` muestra fps y retraso.

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

### 🎂 Cumpleaños (22/10/2026)
FIDE sólo publica el **año** de nacimiento. El día y el mes se cargan de dos maneras, en modo autor:
- **Uno por uno:** en el perfil, al lado del FIDE ID, **🎂 Cumpleaños: sin cargar ✏️** → escribir `13/5` o `13 de mayo`.
  Vacío lo borra. Sin número FIDE no hay lápiz.
- **De a muchos:** Jugadores → **🎂 Buscar cumpleaños en Wikidata** (unos segundos). Wikidata guarda el número FIDE de
  cada jugador, así que el cruce es exacto (~190 jugadores). Vienen tildados los seguros; **sin tildar** los que ya
  tienen otra fecha cargada a mano (lo manual nunca se pisa) y los de año distinto al de FIDE (puede ser otra persona).
- Después: **💾 Guardar datos en mi carpeta** y publicar. Se guardan por fide_id (`cumples` en el navegador →
  `window.__CUMPLES__`, un renglón más de `_embeddedPlayersJs`). Se ven en el perfil («🎂 13 de mayo de 1987») y en la
  portada, en su panel «🎂 ¡Hoy cumplen años!» — **SIN la edad** (pedido del autor 23/10: ni en la web ni en el saludo
  del bot). Los menores también (decisión del autor). El aviso al teléfono abre `/?ver=cumples` (baja hasta el panel).
  En el bot, **`/cumples 24/10`** muestra los de ese día con su año de nacimiento, para revisarlos un día antes.
  Pruebas: sección 79 del banco.

### 📲 La web como app + 🔔 avisos al teléfono (22/10/2026)
- **App:** `manifest.webmanifest` + `sw.js` en la raíz. El `sw.js` NO guarda nada de la web (no tiene «fetch»): sólo
  recibe avisos y abre la página al tocarlos. Adentro tiene la receta para sacarlo de todos los teléfonos.
- **Dónde se ve:** cartel arriba de Hoy (sólo en teléfonos; su ✕ con cuenta queda guardada en la cuenta), «📲 Instalar la
  app» en el menú del usuario y en el ☰, «🔔 Avisos al teléfono» en el ☰ y en ⚙️ Preferencias.
- **Avisos:** los manda el bot (`vivo-worker/src/avisos.js`, secreto `VAPID_JWK`) con 6 temas: ejercicio del día, racha
  (22 h), ronda que arranca (al tocar 📣 Publicar), cumpleaños, videos y noticias, torneos nuevos. De 23 a 9 nada.
  Con cuenta, lo elegido vale para todos sus aparatos. En el bot, `/avisos` dice cuántos teléfonos hay anotados.
- **Apagar todo de golpe:** `_appEnPrueba()` en `index.html` → `return false` y publicar.

### 🌐 Ratings online: tarjeta "En línea" (Chess.com + Lichess, 15/10/2026)
Fase 1 de `planes-de-la-web/PLAN-RATINGS-ONLINE.md` (afuera de esta carpeta).
- **Cargar las cuentas:** en el perfil (modo autor), tarjeta **🌐 En línea → ✏️ Cuentas**. Acepta el usuario o el
  link. Al guardar, la app comprueba la cuenta en Chess.com/Lichess y **avisa** (no bloquea) si no existe, si está
  cerrada/suspendida o si el título no coincide con el FIDE. Después: **💾 Guardar datos en mi carpeta**.
- Se guardan por **fide_id** (`online_cuentas` en el navegador → `window.__ONLINE_CUENTAS__`, en el mismo renglón
  que el ranking: `_embeddedPlayersJs`). Sin fide_id no hay tarjeta.
- **Los ratings** los baja `node herramientas/online/actualizar.mjs` → `data/online.json` (+ `data/online-hist.json`,
  una foto mensual de Chess.com, que no tiene historial). **Lo corre solo `publicar-web.cmd`**: la bajada completa
  (~2 min) UNA vez por día (medianoche argentina); en las demás publicaciones del día pide sólo las cuentas nuevas
  (si no hay, no pide nada). `--todo` la fuerza. Sin internet, deja lo de la vez pasada. Las cuentas cerradas no se publican (las avisa el script).
- El visitante **nunca** le pide nada a Chess.com ni a Lichess: sólo lee `data/online.json`. Sin cuentas, no ve nada.
  No se muestra "visto por última vez" (hay menores). Pruebas: sección 76 del banco.
- Un ritmo de Chess.com **sin partidas en el último año no se muestra** (`_ONL_VIGENCIA` / `VIGENCIA` del script):
  Slipak salía con "bullet 1195" por una partida de 2023. Una cuenta sin ningún ritmo vigente, el visitante no la ve.
- **El bot de Discord los usa** (`vivo-worker`): `data/online.json` lleva además `j` = { número del jugador: {cc, li} }
  (lo arma el script con el ranking de `embedded-data.js`). Con eso: el **/jugador** muestra "🌐 En línea", y en
  **#en-vivo** salen los avisos del **Titled Tuesday** (martes 12 h) y los **tres Titled Thursday** (jueves 12, 17 y 22 h):
  a los 12 minutos, qué argentinos juegan (Chess.com NO publica a los anotados antes de que empiece) con el link al
  torneo, y al terminar sus puntos y puesto POR PUNTOS ("56.º–80.º" si hay empate: los desempates no vienen al
  instante). Sin argentinos, no avisa. Ojo: `player/{u}/tournaments` llega con HORAS de atraso; el torneo se encuentra
  en el archivo de partidas del mes (al día) y los jugadores en sus rondas (la que se juega viene a medias). Código: `vivo-worker/src/titulados.js`. El Freestyle
  Friday (960) y el Bullet Brawl no aparecieron en ninguna cuenta argentina en ago-oct 2026: si vuelven, un renglón
  en `TT_EVENTOS`. Para probar sin publicar: `POST /tg/titulados { clave, probar: 'arranque', ev: 'thu2' }`.
- **🔗 Redes del jugador:** las que comparte en Lichess (biografía + links) y su canal de streamer de Chess.com. Sólo el
  perfil de YouTube/Twitch/Kick/Instagram/X/TikTok/Facebook (nada de mails, teléfonos, videos ni posteos sueltos).
  **Se publican sólo con el tilde "Mostrar sus redes"** de ✏️ Cuentas (`redes: 1` en la cuenta; hay menores): sin
  tilde el autor las ve apagadas y el script ni las escribe en `online.json`. Lector: `_onlRedes` / `extraerRedes`.
  Llevan SIEMPRE la aclaración "Las compartió el propio jugador en su perfil público de Lichess/Chess.com. ¿Sos vos y
  preferís que no aparezcan? Avisanos" (→ Instagram de la página): en la tarjeta y en el `/jugador` del bot (`dcCampoRedes`).
  **Para revisarlas todas juntas:** Jugadores (modo autor) → **🔗 Revisar redes de los jugadores**: consulta en el momento
  (Lichess de un pedido, Chess.com de a uno), arriba los que mencionan clases en su biografía ("🎓", `_ONL_CLASES`),
  un tilde por jugador y Guardar. Después, 💾 Guardar datos y publicar.
  Segundo tilde **🎓 Da clases** (ahí y en ✏️ Cuentas; `clases: 1`, viaja en `online.json` → `j`): el perfil y el bot dicen
  **"🎓 Podés consultarle por clases"** arriba de sus redes. Sin marcar de entrada: lo decide el autor. La frase de la
  biografía NUNCA se publica (suele traer precios, mails o teléfonos).
  **✏️ Redes a mano (16/10):** en ✏️ Cuentas, "Redes que agregás vos": se elige la red (YouTube, Instagram, Facebook,
  Twitch, X, TikTok, Kick o **Sitio web**; al pegar el link se adivina sola) y Agregar / ✕ guardan en el acto
  (`mias: [{red,url}]` en la cuenta, sólo https). Se ven SIEMPRE (sin el tilde de redes), primero, y aunque el jugador no
  tenga cuentas; la aclaración pasa a "Son canales públicos del jugador". Viajan al bot en `online.json` → `j[id].mias`.
- **🎓 Perfil de entrenador (16/10):** ninguna API lo da. `actualizar.mjs` lo averigua cuenta por cuenta: Lichess →
  `lichess.org/coach/{u}` (200 = sí, 404 = no); Chess.com → la página del perfil trae `isCoach: true` (`esCoachCC`).
  Las listas por país NO sirven (Lichess le da 403 a un script; Chess.com sin sesión muestra sólo la 1.ª página).
  Cache en `herramientas/online/entrenadores.json` (`{cc|li: {u: {t, c}}}`): se revisa cada 14 días, hasta 120 por sitio
  y por bajada diaria (+ las cuentas nuevas), en paralelo con los ratings. Marca `coach: 1` en `online.json`; la
  tarjeta y el bot muestran "🎓 Podés consultarle por clases" + "Entrenador en Lichess/Chess.com" (link) SIN tilde
  del autor (es un perfil profesional público).
- **🎓 Estudiar › Entrenadores (16/10):** 4.ª sub-pestaña (`?ir=estudiar&ver=entrenadores`, `_entPintar`). Entra quien
  tiene `coach: 1` en algún sitio o el tilde 🎓 Da clases (`_entLista`, por Elo FIDE). De Lichess, el script guarda su
  ficha (`infoCoachLI` → `ci: { h, lugar, idiomas, acepta }`): frase, ciudad, idiomas y "Acepta alumnos". NUNCA la
  tarifa ni el "Acerca de mí" (mails/teléfonos); frase con mail/link/teléfono se descarta. Filtros: Todos / GM y MI /
  Aceptan alumnos / En inglés + buscador (nombre o ciudad). Redes con las mismas reglas que la tarjeta. Banco: sección 76.
  📷 Fotos: la de su ficha de entrenador de Lichess (`ci.foto`, image.lichess1.org) o el avatar de Chess.com (`foto`, sólo de
  los entrenadores: `marcarCoach` la borra al resto). Se cargan desde Lichess/Chess.com; si fallan, quedan las iniciales.
- **Decisiones del autor (15/10):** NO hay ranking online en Jugadores (se mezclarían aficionados con mucho rating
  online: los ratings online van SÓLO dentro de cada perfil), NO gráficas de evolución online y NO Worker con cron
  (publica todo el tiempo; el script alcanza).
- **Carga masiva (fase 2):** Jugadores (modo autor) → **🌐 Buscar cuentas de Chess.com de los titulados** (~2 min).
  Busca en la lista de Chess.com del MISMO título los usuarios que contienen el apellido y confirma cada uno con su
  perfil (nombre real). Vienen tildadas las seguras; se guardan las tildadas. ⚠️ El listado "país Argentina" de
  Chess.com viene cortado en 10.000 (alfabético): por eso NO se usa. Lichess no tiene listas: a mano. Banco: sección 77.

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
`data/fl/`, `data/cr/`, `data/games_0.json`, `data/games_1.json`… (de a 50.000 partidas, hoy 4 archivos: Cloudflare no acepta ninguno de más de 25 MiB), `data/book.json`, `data/datos.json`,
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
