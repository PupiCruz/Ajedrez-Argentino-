# Plan de arreglos — Auditoría del 26/08/2026

> **Si sos Claude y estás retomando esto en una sesión nueva: leé la sección
> "Cómo retomar" de abajo ANTES de tocar nada.**

Informe completo de la auditoría (los 27 hallazgos, con el detalle de cada uno):
https://claude.ai/code/artifact/437e8ecc-2c6b-4ac8-917b-839a7dee9055

Los números entre corchetes —`[7]`, `[15]`— son el número de hallazgo del informe.

---

## Cómo retomar

1. Mirar la tabla **Estado** de acá abajo: la primera fase sin tildar es la que sigue.
2. Abrir esa fase y hacer **solo esa**. Cada fase es una sesión de trabajo y una
   sola publicación.
3. Al terminar: tildar la fase, anotar la fecha en la tabla, y dejar en "Notas"
   cualquier cosa rara que haya pasado.
4. Si una fase queda a medio hacer, tildar los ítems que sí quedaron y anotar en
   "Notas" en qué punto se cortó. **No publicar una fase a medias** salvo que los
   ítems hechos funcionen solos (está aclarado fase por fase cuándo se puede).

### Reglas de trabajo

- **Una fase = una publicación.** No mezclar fases: si algo sale mal, así se sabe
  qué lo rompió.
- **Probar antes de publicar.** Cada fase dice cómo probarla.
- **No tocar lo que anda.** El informe marcó cinco áreas limpias (escapado de HTML,
  secretos, proxys, dependencias, compatibilidad). No hay que tocarlas.
- Si un arreglo obliga a cambiar los dos workers, se publica **primero cr-proxy y
  después vivo-worker** (está aclarado en la fase que corresponde).

### Los tres caminos de publicación

| Qué | Cómo se publica | Cuánto tarda |
|---|---|---|
| `vivo-worker/src/index.js` | `cd vivo-worker` y `npm run deploy` | ~30 s |
| `cloudflare-worker/cr-proxy-worker.js` | Panel de Cloudflare → el Worker `cr-proxy` → **Edit code** → pegar el archivo entero → **Deploy** | ~2 min, a mano |
| `index.html` / `editar.html` | `publicar-web.cmd` (hace el pull del teléfono y el push) | ~1-2 min de redeploy |

---

## Estado

| Fase | Qué arregla | Toca | Tamaño | Hecha |
|---|---|---|---|---|
| 1 | Los dos agujeros críticos, con parche rápido | cr-proxy + vivo + web | corta | ☑ **EN VIVO 26/08/2026** |
| 2 | Las salas de partida sobreviven a la siesta | vivo | **larga** | ☑ **EN VIVO 26/08/2026** |
| 3 | Frenos de abuso del chat y los desafíos | vivo | media | ☑ **EN VIVO 26/08/2026** |
| 4 | Frenos de abuso y limpieza de la base | cr-proxy + web | media | ☑ **EN VIVO 26/08/2026** |
| 5 | Que el baneo y el bloqueo muerdan de verdad | cr-proxy + vivo (+ 12 líneas de web) | media | ⏳ **hecha y probada 26/08 — FALTA PUBLICAR** |
| 6 | Velocidad del backend y progreso de ejercicios | cr-proxy | media | ☐ |
| 7 | Los arreglos de la web (+ pedido del autor: volver al salón sin perder el desafío) | index.html | media | ☐ |
| 8 | Prolijidad y código muerto | los tres | corta | ☐ |

> **Con las fases 1 y 2 hechas, los dos hallazgos CRÍTICOS quedan cerrados.** De acá
> en adelante no hay nada urgente: las fases 3 a 8 se pueden hacer en el orden que
> convenga, no dependen entre sí. La única atadura es que la **Fase 7** termina dos
> cosas que empiezan en la 3 y en la 4 (está aclarado en cada una).

### Notas de las sesiones

**26/08/2026 — Fase 1 escrita, sin publicar todavía.** Tres cosas para tener en cuenta:

1. **La Fase 1 terminó tocando también `index.html`**, cosa que el plan original no
   preveía. Motivo: el navegador reconecta solo cuando se le cae la sala, así que el
   cierre por inactividad se revertía en un bucle y el parche no servía para nada —
   justo el caso de la pestaña olvidada que tumbó el sitio el 23/08. Ahora el navegador
   reconoce el código de cierre 4002 y no reconecta. **Son tres publicaciones, y el
   orden importa** (ver abajo).
2. **Apareció un bug al probar**, que el banco de pruebas cazó: el plazo de
   inactividad se cuenta desde la última actividad, así que una partida que caía por
   bandera después de una pensada larga tenía el plazo ya vencido y la sala se habría
   cerrado en el acto, sin que los jugadores vieran el resultado ni pudieran pedir
   revancha. Arreglado: terminar la partida cuenta como actividad.
3. **Quedó un banco de pruebas: `vivo-worker/test-salas.mjs`.** Se corre con
   `cd vivo-worker` y `node test-salas.mjs`. Correrlo antes y después de tocar esta
   parte avisa enseguida si se rompió algo.

**26/08/2026 — Fase 2 EN VIVO.** Publicada y probada a mano por el autor: cerró la
pestaña en medio de una partida, volvió a entrar por el link y el reloj siguió donde
iba (antes se reseteaba). Resumen: las salas de partida ahora hibernan —las tres clases del worker ya lo hacen— y se guarda la
partida entera, no solo las jugadas. Probado contra el runtime real de Cloudflare,
incluido el caso de publicar el worker con una partida en curso. El banco de pruebas
creció a 54 comprobaciones y cazó **dos bugs antes de que llegaran a producción**
(al dar mate no se guardaba el final; y la misma partida se podía ratear dos veces).
Detalle completo en la sección de la Fase 2.

**26/08/2026 — Fase 3 EN VIVO.** Publicada y probada por el autor. (`cd vivo-worker` y
`npm run deploy`; una sola publicación). Los frenos del chat ahora cuentan **por persona
y no por conexión**, así que abrir pestañas ya no multiplica el cupo: 20 intentos de
inundar desde dos pestañas entran 4. El chat de la partida, que no tenía ningún freno,
ahora tiene el mismo. Además: el nombre y el rating de un desafío los pone el servidor
(no se puede firmar con el nombre de otro), sólo el destinatario puede rechazar un
desafío, los desafíos dirigidos vencen sin temporizadores (que impedían dormir al lobby),
y el chat avisa `ready` / `not-ready` en vez de tragarse el primer mensaje. Bancos de
pruebas: 61 + 31 comprobaciones. **La mitad del navegador del aviso `ready` queda para
la Fase 7** — hasta entonces no rompe nada, el navegador viejo ignora lo que no conoce.

**26/08/2026 — Fase 4 EN VIVO.** Probada por el autor: la IA **no** redacta sin estar
logueado y **sí** redacta con la cuenta de moderador — que es exactamente el
comportamiento nuevo buscado, no un error. Verificado además contra el Worker real:
`POST /noticia` sin sesión y con un token inventado devuelven 403, y el login sigue
rechazando un `redirect_uri` ajeno (Fase 1 intacta).

Cambios: el redactor con IA ahora exige **la sesión de moderador del autor** (no el PIN: la
computadora no lo tiene, el PIN vive sólo en el teléfono); frenos de frecuencia por usuario
en los cinco endpoints que escriben en la base; el freno del PIN pasó a contarse **por IP**;
las sesiones vencidas y los reportes ya atendidos se limpian solos; y se sumó el **tope de 10
partidas rateadas por día entre las mismas dos cuentas** (ítem 4.5, que venía de la Fase 3).
Banco de pruebas nuevo: `cloudflare-worker/test-cuentas.mjs`, 18 comprobaciones.

**Ojo:** de ahora en más hay que estar logueado con la cuenta de moderador para usar la IA,
también en el modo autor local.

**26/08/2026 — Fase 5 hecha y probada, falta publicar.** Los dos ítems (5.1 y 5.2) están hechos,
con el camino **A** del 5.1 (revalidar cada tanto), que es el más simple y el que no obliga a que un
worker le hable al otro. Resumen en criollo: **antes cada chat se sacaba una foto de "quién sos y si
estás sancionado" al conectarte y no la volvía a mirar nunca**; ahora la vuelve a mirar, como mucho una
vez por minuto, justo antes de procesar lo que mandás. Y el bloqueo en el chat **dejó de ser
maquillaje**: el mensaje del bloqueado ya no le llega al que lo bloqueó (antes llegaba igual y el
navegador lo tapaba con una regla de estilo; con el inspector abierto se leía lo mismo).

Tres cosas para tener en cuenta:

1. **Terminó tocando también `index.html`**, doce líneas. Motivo: el que bloquea es el navegador, así
   que si no le avisa al servidor, el corte recién se nota cuando vence el minuto de la revalidación o
   al recargar. Ahora, al bloquear/desbloquear, los chats abiertos mandan un `refresh-me` y el corte es
   instantáneo. Si ese aviso se pierde, en un minuto se acomoda solo. **Son tres publicaciones** (ver el
   orden abajo).
2. **Nada de temporizadores.** La revalidación se dispara cuando la persona manda algo, nunca por reloj:
   un temporizador impediría que el Durable Object se duerma, que es lo que costó caro el 23/08.
   Si el servidor de cuentas no contesta (sin red), **no se toca nada**: nadie se queda sin escribir por
   un problema de red.
3. **El chat de la partida (PvP) es el único que no patea la conexión.** Ahí la revalidación corre en
   segundo plano y sólo le corta el chat: cortarle la conexión a alguien en medio de una partida sería
   peor que el spam que se quiere frenar.
4. **El baneado volvía "de invitado" — encontrado probando en producción.** Al patear a un baneado,
   su navegador **se reconecta solo**; como el baneo le borró la sesión, volvía sin identidad, o sea
   como un invitado. Un invitado no puede escribir en el chat (bien), pero **sí podía publicar
   desafíos** —eso es así desde siempre, para la gente que juega sin cuenta— y como el nombre del
   invitado lo elige el navegador, el desafío seguía saliendo con su mismo nombre. Arreglado por los
   dos lados: el servidor no le acepta desafíos a una conexión que trajo un token que ya no vale
   (`hadAuth` sin `userId`), y el navegador, ante el cierre 4003, **deja de reconectar** y avisa
   "Tu cuenta está suspendida". El invitado de verdad (el que nunca tuvo cuenta) sigue jugando igual.
   Se cazó mirando el registro en vivo de cr-proxy (`npx wrangler tail cr-proxy --method POST`), que
   mostró que la revalidación **sí** se estaba haciendo y que el agujero estaba después.
5. **Cuánto tarda en notarse el baneo, por si vuelve la pregunta.** La cuenta se cierra en la base al
   instante (por eso al recargar la persona sale del sitio), pero una **pestaña ya abierta** tiene
   inercia: publicar/aceptar un desafío se corta **en el acto**, y el chat, **hasta un minuto**. Ojo
   además con esto al probar: una conexión abierta desde ANTES de publicar el worker sigue con el
   código viejo hasta que se reconecta, así que conviene recargar la pestaña después del deploy.

Los bancos de pruebas crecieron: **test-lobby.mjs de 31 a 62 comprobaciones** (nueve escenarios nuevos)
y **test-cuentas.mjs de 18 a 30**. Se corren con `cd vivo-worker && node test-lobby.mjs`,
`node test-salas.mjs`, y `cd ajedrez-argentino/cloudflare-worker && node test-cuentas.mjs`.

> ⚠️ **Cómo se publicó la mitad de la web (para que quede registrado).** El 26/08 se ejecutó
> `publicar-web.cmd` **por accidente**, desde un comando de Claude cuyo escapado se rompió y
> terminó ejecutando el script como si fuera texto. Se publicaron `index.html` (sólo el cambio
> de la IA: mandar el token, 13 líneas puramente agregadas), el plan y los tests. No rompió
> nada —el Worker viejo ignora un header que no conoce— y de hecho es el orden correcto: la
> web va primero. Pero conviene saberlo. **Lección para futuras sesiones: no meter texto con
> comillas invertidas dentro de comandos de shell; para eso usar la herramienta de escritura
> de archivos.**

---

## FASE 1 — Tapar los dos críticos (parche rápido)

**Objetivo:** cortar hoy el riesgo real, sin meterse todavía en el trabajo grande.

### 1.1 · Validar la dirección de vuelta del login `[2]` — CRÍTICO

- Archivo: `cloudflare-worker/cr-proxy-worker.js:1102-1104`
- Hoy: `const clientId = redirectUri;` — el `redirect_uri` llega del navegador y
  se usa tal cual, sin comprobar que sea una dirección tuya.
- Arreglo: antes de canjear el código con Lichess, comprobar que `redirect_uri`
  empiece con `https://chessargentino.ar`, `https://chessargentino.pages.dev`,
  `https://<algo>.chessargentino.pages.dev` o `http://localhost`. Si no, cortar
  con error 400.
- Cuidado: la dirección real que manda la web es `location.origin + location.pathname`
  (`index.html:33308`), o sea que incluye la ruta. La comprobación tiene que ser
  por **inicio de la dirección**, no igualdad exacta, o se rompe el login.

### 1.2 · Que una sala de partida no quede despierta para siempre `[1]` — CRÍTICO (parche)

- Archivo: `vivo-worker/src/index.js` (clase `GameRoom`)
- Hoy: la sala queda viva mientras haya alguien conectado, sin tope de tiempo, y
  cualquiera puede abrir salas nuevas inventando el nombre (`:1377`).
- Arreglo hecho (parche, no la solución final):
  - `waiting` (nadie llegó de rival) pasados **15 min** → se cierra.
  - `finished` y nadie pidió revancha pasados **10 min** → se cierra.
  - `playing` **sin reloj** pasados **45 min** sin una sola señal → se aborta y se
    cierra. Hacía falta: con reloj la bandera corta la partida sola, pero sin reloj
    no hay nada que la corte — y "sin reloj" es justamente lo que le queda a una sala
    abierta a la fuerza, porque el ritmo lo elige el creador. Se aborta (no se
    abandona) a propósito: `abort` no ratea, así cerrar no le regala la partida a nadie.
  - Tope de **12 conexiones simultáneas** por sala; la 13ª recibe un 429.
  - Todo con la alarma que la clase ya tiene (`scheduleAlarm` / `alarm`), no con un
    `setTimeout` (un `setTimeout` pendiente impide dormir — ver hallazgo 13).

### 1.3 · Que el navegador no reviva la sala cerrada `[1]`

- Archivo: `index.html`, dentro de `connect(id)` → `ws.onclose`
- Sin esto el parche 1.2 no sirve: al cerrarse la sala, el navegador reconecta solo
  (hasta 8 veces) y la revive. Una pestaña olvidada la mantendría viva igual.
- Arreglo: si el cierre viene con el código **4002** ("sala inactiva"), no reconectar;
  llamar a `exit()` —que además retira el desafío del lobby, para que nadie entre a
  una sala muerta— y avisar con un cartelito.
- **Honestidad sobre este parche:** acota el daño (cada sala abusiva vive 15 min
  en vez de para siempre) pero **no lo elimina**: quien insista puede reconectarse.
  El arreglo de verdad es la Fase 2. Este parche compra tiempo.
- Lo que **no** sirve acá: las reglas de Rate Limiting del panel de Cloudflare no
  se aplican a las direcciones `workers.dev`, solo a dominios propios. Para poder
  usarlas habría que poner el worker en `vivo.chessargentino.ar` primero.

### Cómo se prueba la Fase 1

Ya corrido en esta PC antes de publicar:

- ✅ `node vivo-worker/test-salas.mjs` — 24 comprobaciones en verde (cierre por
  inactividad en los tres estados, bandera, reconexión con token, tope de conexiones,
  y que cerrar no le regale la partida a nadie).
- ✅ La lista de direcciones de vuelta del login probada con 15 casos, incluidos los
  tramposos (`chessargentino.ar.evil.com`, `evilchessargentino.ar`, `malo.pages.dev`).
- ✅ `index.html` abre sin un solo error de consola en el servidor local.

**Falta probar a mano, después de publicar:**

1. **Login:** salir de la cuenta y volver a entrar con Lichess desde
   `chessargentino.ar`. Tiene que entrar igual que siempre. Probar también desde el
   servidor local (`iniciar-servidor.cmd`), que usa `http://localhost:8099` y también
   está en la lista.
2. **Partida:** crear un desafío, entrar con otro navegador, jugar dos jugadas y
   terminarla. Que la revancha siga andando.
3. **Cierre por inactividad:** dejar un desafío esperando rival 16 minutos. Tiene que
   volver solo a la sala de Jugar con el cartelito, **sin** quedar reconectando.

### ✅ PUBLICADA Y VERIFICADA EN PRODUCCIÓN — 26/08/2026

Comprobado contra los servidores reales después de publicar:

- **Web** — `index.html` publicado trae el manejo del cierre 4002 y su cartelito.
- **cr-proxy** — `POST /auth/lichess` rechaza con 400 "redirect_uri no permitido"
  `https://evil.com/cb`, `https://malo.pages.dev/cb`,
  `https://chessargentino.ar.evil.com/cb` y `https://evilchessargentino.ar/cb`,
  **antes** de hablar con Lichess. Y deja pasar `https://chessargentino.ar/` y
  `http://localhost:8099/` (llegan a Lichess, que rechaza el código de prueba) →
  la lista blanca no rompe el login real.
- **vivo-worker** — 13 conexiones a una sala de prueba: entraron 12, la 13ª rechazada.

### Cómo se publicó (el orden importó)

Son **tres** publicaciones y **el orden importa**:

1. **La web** (`publicar-web.cmd`). Va primero porque le enseña al navegador a no
   reconectar cuando el servidor cierra una sala por inactividad. Si se publicara al
   final, los navegadores que ya están abiertos revivirían las salas en bucle y el
   parche no serviría de nada durante ese rato.
2. **`cr-proxy`** (panel de Cloudflare → Worker `cr-proxy` → Edit code → pegar el
   archivo entero → Deploy). Es independiente: se puede hacer en cualquier momento.
3. **`vivo-worker`** (`cd vivo-worker` y después `npm run deploy`). Va último.

Si la sesión se corta, cada publicación queda bien sola: no se rompe nada por tener
una hecha y las otras no.

---

## FASE 2 — Las salas de partida sobreviven a la siesta

**Objetivo:** el arreglo real del hallazgo `[1]`, que arrastra el `[15]`.
**Es la fase más larga y la más delicada. Reservar una sesión entera.**

### 2.1 · Guardar el estado de la partida `[15]`

- Archivo: `vivo-worker/src/index.js:222-228` (constructor) y `:781` (`persist`)
- Hoy: de una partida en curso solo se guarda la **lista de jugadas**. Los asientos,
  la identidad de cada jugador, el reloj, el estado y las marcas `gameId` /
  `ratedGameId` viven solo en memoria.
- Arreglo: guardar también todo eso, y recuperarlo al despertar. Consecuencia visible
  hoy: si Cloudflare recicla la sala o vos publicás el worker con gente jugando, el
  reloj vuelve al tiempo inicial y la partida se puede ratear dos veces.
- Ojo: el asiento guarda el objeto `ws` (la conexión), que **no se puede guardar**.
  Hay que separar "datos del asiento" (se guardan) de "conexión viva" (no).

### 2.2 · Pasar la sala al esquema dormilón `[1]`

- Archivo: `vivo-worker/src/index.js:248`
- Hoy: `server.accept()` + `addEventListener`, que mantiene la sala despierta.
- Arreglo: `this.state.acceptWebSocket(server)` + los métodos `webSocketMessage`,
  `webSocketClose` y `webSocketError`, igual que ya hacen `Lobby` (`:898`) y
  `TourChat` (`:1222`). **Copiar el patrón de esos dos**, que ya funcionan bien.
- La identidad de cada conexión va en el `serializeAttachment` del WebSocket, como
  en los otros dos.
- Sacar el parche de auto-cierre de la Fase 1 si quedó redundante, o dejarlo (no
  molesta y sigue siendo una buena higiene).

### Estado: hecha y probada el 26/08/2026 — **falta publicar**

Publicar con: `cd vivo-worker` y después `npm run deploy`. Es **una sola publicación**
y no depende de nada más.

**Probado con el runtime real de Cloudflare (`wrangler dev`), no solo con simulaciones:**

- Partida completa por WebSocket: colores, ritmo, jugadas, reloj. Todo por los
  handlers nuevos (`webSocketMessage`), o sea que la hibernación quedó bien cableada.
- **Publicación del worker EN MEDIO de una partida** (que es el caso que hoy falla):
  el reloj quedó en 607441 ms, exactamente donde estaba — antes se reseteaba a 600000.
  Jugadas, ritmo, colores y nombres intactos, y la partida siguió jugándose.
- Caída de las dos conexiones y vuelta con el token: cada uno a su asiento.
- `node test-salas.mjs`: **54 comprobaciones en verde**, incluidas cinco de "siesta"
  (partida en curso, esperando rival, después de una revancha con los colores
  cambiados, la marca de "ya rateada", y la reconexión con token).

**Dos bugs que cazaron las pruebas antes de llegar a producción:**

- Al dar **mate**, la partida se guardaba ANTES de marcarse como terminada. Si la sala
  dormía justo ahí, al despertar creía que se seguía jugando y el resultado se perdía.
- La marca de "esta partida ya se rateó" no se guardaba, así que una siesta después
  de terminar podía **ratear la misma partida dos veces**.

### Cómo se prueba a mano (opcional, ya cubierto arriba)

Con dos navegadores:

1. Partida completa de 3+2: que el reloj corra bien, que la bandera caiga bien.
2. **Cerrar una pestaña en medio de la partida y volver dentro de los 30 s:** tiene
   que retomar el mismo asiento, con el reloj donde estaba.
3. Dejar la partida quieta 2-3 minutos (para que la sala se duerma) y después hacer
   una jugada: tiene que andar sin perder nada.
4. Revancha, tablas, abandono, abortar.
5. Con los dos jugadores logueados: que el rating se actualice **una sola vez**.
6. **Publicar el worker en medio de una partida** y confirmar que no se resetea el
   reloj (esto es lo que hoy falla).

### Nota sobre las partidas que estén en curso al publicar

El formato de guardado cambió (antes se guardaban solo las jugadas, ahora la partida
entera). El código lee **los dos**: una partida que esté en curso justo cuando publiques
recupera igual su tablero. Lo que no puede recuperar es el reloj y los asientos de esa
partida puntual, porque en el formato viejo nunca se guardaron. De ahí en adelante,
todas las partidas nuevas quedan cubiertas.

---

## FASE 3 — Frenos de abuso del chat y los desafíos

**Objetivo:** que el sitio aguante a una persona con mala intención.
Todo en `vivo-worker/src/index.js`, **una sola publicación**.

### 3.1 · Contar los mensajes por persona, no por conexión `[5]`

- `vivo-worker/src/index.js:1098` (chat del lobby), `:1279` (La hinchada),
  `:1120` y `:1302` (reacciones)
- Hoy: el contador vive en la conexión (`session._chatTimes`), así que con dos
  pestañas se tienen dos contadores. En La hinchada, además, se pierde cada vez que
  la sala se duerme.
- Arreglo: un `Map` de `userId → últimos envíos` guardado en la sala. Sirve para los
  dos chats y para las reacciones de una.

### 3.2 · Frenar también el chat de la partida `[6]`

- `vivo-worker/src/index.js:410-424`
- Hoy: sin ningún contador. Y el espectador sin cuenta escribe, y el jugador
  invitado elige el nombre que quiera (`:239`), incluso el tuyo.
- Arreglo: mismo contador de 3.1. Y decidir: si el espectador sin cuenta puede
  escribir, que su nombre sea siempre "Espectador".

### 3.3 · Que solo el destinatario pueda rechazar un desafío `[7]`

- `vivo-worker/src/index.js:1047-1055`
- Hoy: `challenge-decline` borra el desafío sin mirar quién lo pidió, y los ids de
  los desafíos abiertos se anuncian a toda la sala.
- Arreglo: un `if` — rechazar solo si `ch.target === session.userId`, o si el que
  manda es el dueño del desafío. **Dos líneas.**

### 3.4 · Que el nombre y el rating del desafío los ponga el servidor `[8]`

- `vivo-worker/src/index.js:967-985` (`create`) y `:1004-1010` (`challenge-direct`)
- Hoy: llegan del navegador. Se puede publicar un desafío firmado con el nombre de
  otro y rating 2400.
- Arreglo: si la conexión está identificada, usar `session.username` y el rating
  real. Dejar que el cliente ponga el nombre **solo** cuando no hay cuenta.

### 3.5 · Que un desafío dirigido no mantenga el lobby despierto `[13]`

- `vivo-worker/src/index.js:1023-1029`
- Hoy: un `setTimeout` de 10 minutos, que impide que el lobby duerma (justo lo que
  se arregló el 23/08) y que se pierde si igual duerme, dejando el desafío colgado.
- Arreglo: sacar el `setTimeout`. Ya se guarda `createdAt`: descartar los vencidos
  cuando alguien pasa por ahí, igual que hace `pruneChat()`.

### 3.6 · Pedir un mínimo de jugadas para ratear `[9]`

- `vivo-worker/src/index.js:618-632`
- Hoy: `if (this.game.history().length < 1) return` — con una sola jugada la partida
  cuenta, así que con dos cuentas se hace una partida cada cinco segundos.
- Arreglo hecho: mínimo de **6 jugadas**, salvo que la partida haya terminado sola en el
  tablero (mate, ahogado, tablas por regla), que cuenta igual aunque sea más corta.
- **Lo que este mínimo NO resuelve, dicho claro:** frena el farmeo a mano, pero a un
  script no lo frena — jugar 6 jugadas legales automáticamente es trivial. Lo que corta
  el boosteo de verdad es limitar cuántas partidas rateadas se pueden jugar por día entre
  **el mismo par de cuentas**, y eso vive en la base de datos, no acá. Quedó anotado como
  **ítem 4.5**, en la fase de cr-proxy.

### 3.7 · Avisar cuando el chat todavía no sabe quién sos `[14]`, mitad servidor

- `vivo-worker/src/index.js:1091` y `:1272`
- Hoy: si el mensaje llega antes de que se resuelva la identidad, se descarta **sin
  avisar** — por eso el primer saludo al entrar a un torneo a veces desaparece.
- Arreglo (mitad servidor): cuando `attachIdentity` termina, mandar
  `{type:'ready'}`. Y si llega un `chat` sin identidad, responder
  `{type:'not-ready'}` en vez de callarse.
- La mitad del navegador va en la **Fase 7**. Mientras tanto no rompe nada: el
  navegador viejo ignora los mensajes que no conoce.

### Estado: hecha y probada el 26/08/2026 — **falta publicar**

Publicar con `cd vivo-worker` y después `npm run deploy`. **Una sola publicación.**

- `node test-salas.mjs` → 61 comprobaciones · `node test-lobby.mjs` → 31 (banco nuevo,
  para el lobby y los chats, que no tenían ninguno).
- Prueba de humo contra el runtime real de Cloudflare (`wrangler dev`): el aviso
  `need-login`, que un invitado no pueda inventarse un rating, que un tercero no pueda
  borrar un desafío ajeno, y el freno del chat de la partida (10 mensajes seguidos →
  entró 1).

**Cosas que aparecieron al hacerla:**

- El tope de "6 mensajes cada 10 segundos" **nunca llega a aplicarse en el chat**: con
  3 segundos obligatorios entre mensajes, como mucho entran 4 en esa ventana. Queda como
  red de seguridad, pero el que frena de verdad es el modo lento. En las **reacciones**
  sí manda el tope de 20, porque ahí no hay espera mínima.
- El punto 3.2 pedía que el espectador sin cuenta se llamara siempre "Espectador":
  **ya era así**, no hubo que tocarlo. Lo que faltaba era el freno de frecuencia.
- El mínimo de jugadas para ratear tiene una **excepción a propósito**: si la partida
  terminó sola en el tablero (mate, ahogado, tablas por regla) cuenta igual aunque sea
  cortita — si no, un mate del loco (4 jugadas) no sumaría, y eso castigaría al que gana
  rápido de verdad. Ver la nota de abajo sobre lo que este mínimo NO resuelve.

### Cómo se prueba a mano (opcional, ya cubierto arriba)

1. Escribir rápido en los tres chats: que el freno de 3 segundos se sienta.
2. Abrir dos pestañas con la misma cuenta y escribir rápido en las dos: **ahora
   tiene que frenar igual** (antes no frenaba).
3. Desafío abierto: publicarlo, verlo desde otro navegador, aceptarlo.
4. Desafío dirigido desde un perfil: que llegue, que se pueda rechazar, y que el
   que rechaza sea el único que puede.
5. Que el nombre del desafío sea el de la cuenta y no uno inventado.
6. Partida de 4 jugadas → **no** tiene que ratear. De 10 jugadas → sí.

---

## FASE 4 — Frenos de abuso y limpieza de la base

**Objetivo:** que nadie pueda vaciarte la cuota gratis de Cloudflare.
Todo en `cloudflare-worker/cr-proxy-worker.js`, **una sola publicación**.

### 4.1 · Cerrar el redactor de noticias con IA `[10]`

- `cr-proxy-worker.js:759-763`
- Hoy: la única protección es mirar de qué sitio dice venir el pedido, dato que
  cualquier programa escribe como quiere (el propio comentario del código lo dice).
  Confirmado contra el servidor real: responde sin pedir nada.
- Arreglo: es una herramienta que usás solo vos → pedirle el mismo PIN del teléfono
  (`EDIT_PIN`), con `adminCheckPin`, que ya existe. **Cinco minutos.**
- Después hay que pasarle el PIN desde `index.html` en la llamada a `/noticia`
  (buscar `_noticiaAIGenerate`) — ese cambio del navegador va en la **Fase 7**, así
  que **entre la Fase 4 y la 7 el botón de IA no va a andar**. Si molesta, hacer las
  dos mitades el mismo día.

### 4.2 · Límite de frecuencia en los endpoints con cuenta `[11]`

- `cr-proxy-worker.js:1891` (`/puz/progress`), `:1594` (`/profile`), `:1622`
  (`/follow`), `:1693` (`/block`), `:1322` (`/report`)
- Hoy: sin freno. Cada llamada escribe en la base, y el plan gratis trae unas
  100.000 escrituras por día: un script las agota en media hora. Cuando se agotan,
  deja de andar entrar al sitio, guardar el rating de una partida y moderar.
- Arreglo: un contador por usuario y por minuto. La tabla `admin_rl` que ya existe
  para el PIN sirve de modelo.

### 4.3 · Que el freno del PIN no te deje afuera a vos `[18]`

- `cr-proxy-worker.js:1987-2013`
- Hoy: el contador de PIN errados se guarda en **una sola fila** llamada `pinfail`.
  Doce fallos en una hora bloquean la edición para todo el mundo, vos incluido.
- Arreglo: contar por dirección IP (`request.headers.get('CF-Connecting-IP')`), así
  el que falla se bloquea a sí mismo.
- Lo bueno que hay que **no** romper: doce intentos por hora hace que adivinar el PIN
  sea imposible en la práctica. Mantener ese número.

### 4.4 · Limpiar sesiones y reportes viejos `[19]`

- `cr-proxy-worker.js:1170` (`INSERT INTO sessions`) y `:1322-1348`
- Hoy: las sesiones vencen a los 6 meses pero la fila nunca se borra, y los reportes
  marcados como vistos quedan para siempre.
- Arreglo: al crear una sesión, borrar las vencidas
  (`DELETE FROM sessions WHERE expires < ?`). Los reportes vistos, borrarlos pasados
  30 días.

### 4.5 · Tope de partidas rateadas por día entre las mismas dos cuentas `[9]`

- Viene de la **Fase 3.6**: el mínimo de jugadas frena el farmeo a mano pero no a un
  script. Esto sí lo frena.
- `cr-proxy-worker.js`, dentro de `ratingReport` (`:1742`), antes de aplicar el Elo.
- Arreglo: contar en `rated_games` cuántas partidas hay entre ese par de cuentas
  (en cualquier orden de colores) en las últimas 24 h. Pasado un tope razonable
  —**10** parece sensato para dos amigos que juegan mucho— guardar la partida en el
  historial pero **no** mover el rating.
- Es una sola consulta `SELECT COUNT(*) … WHERE (white_id=?1 AND black_id=?2) OR
  (white_id=?2 AND black_id=?1) AND ts > ?3`. La tabla ya tiene todo lo necesario.

### Cómo se prueba la Fase 4

1. Entrar y salir de la cuenta un par de veces.
2. Editar la ficha del perfil, seguir a alguien, bloquear y desbloquear.
3. Resolver un ejercicio y confirmar que el progreso se guarda.
4. Entrar desde el teléfono con el PIN correcto.
5. Probar el PIN mal tres veces desde el teléfono y después el bueno: tiene que
   entrar (el freno es por IP, no global).

---

## FASE 5 — Que el baneo y el bloqueo muerdan de verdad

**Objetivo:** que la moderación funcione en el momento en que hace falta.
Toca **los dos workers**: publicar primero cr-proxy, después vivo-worker.

### 5.1 · Revalidar las sanciones en vivo `[3]` y `[25]`

- `vivo-worker/src/index.js:127` (`applyLiveSanction`), `cr-proxy-worker.js:1243`
  (`/mod/ban`)
- Hoy: cada chat se guarda una foto de "quién sos y si estás sancionado" al
  conectarte y no la vuelve a mirar. Al banear desde el perfil se borra la sesión,
  pero **las pestañas ya abiertas siguen escribiendo** en los tres chats. Silenciar
  desde un chat solo llega a ese chat. Y "quitar silencio" desde el panel 🛡️ no se
  nota hasta que la persona reconecta.
- Arreglo (elegir uno):
  - **A, más simple:** que el chat revalide la sanción cada 60 segundos o cada N
    mensajes, en vez de confiar en la foto del momento.
  - **B, más prolijo:** que cr-proxy le avise a vivo-worker cuando hay un baneo, y
    que vivo cierre todas las conexiones de esa persona en todas las salas.
- El `[25]` se arregla solo con cualquiera de los dos.

### 5.2 · Aplicar el bloqueo en el servidor del chat `[4]`

- `index.html:32958` (`shouldHide`), `vivo-worker/src/index.js:1090` y `:1271`
- Hoy: bloquear sí funciona de verdad para desafíos y para seguir, pero en el chat
  es cosmético: el mensaje llega igual y solo se tapa con una regla de estilo.
- Arreglo: que el servidor no le mande el mensaje a quien tiene bloqueado al que
  escribe. Las listas ya están cargadas en `session.blocked` y `session.blockedBy`:
  es un `if` antes de enviar.
- **No romper la excepción que ya está pensada:** un moderador sigue leyendo a todos,
  así nadie se esconde de la moderación bloqueando al mod.

### Estado: hecha y probada el 26/08/2026 — **falta publicar**

**Qué se cambió, archivo por archivo.**

`cloudflare-worker/cr-proxy-worker.js` — un endpoint nuevo, `POST /mod/status`:

- Devuelve el estado de moderación **al día** de un usuario: baneado sí/no, hasta cuándo dura el
  silencio, si es moderador, y sus dos listas de bloqueo (a quiénes bloqueó y quiénes lo bloquearon).
- Es la versión **barata** de `/rating/me`: 3 consultas en vez de una docena (sin ratings, sin
  táctica, sin perfil). Justamente porque los chats la van a llamar seguido.
- **Sólo worker a worker** (header `X-Vivo-Secret`). No lo puede llamar el navegador, ni siquiera con
  la sesión del moderador: devuelve datos de cualquier usuario y no tiene por qué estar a mano.

`vivo-worker/src/index.js` — la revalidación y el reparto del chat:

- `fetchSanctionStatus()` + `sanctionStale()` + `recheckSanctions()`: la foto de sanciones ahora
  tiene fecha (`sanctionAt`) y se renueva **como mucho una vez por minuto**, disparada por el mensaje
  que manda la persona. Si sale baneada, se le cierra la conexión con el código 4003 y no se procesa
  nada más. Si le sacaron el silencio, escribe enseguida.
- `ACCIONES_SIN_ESPERA` = `create`, `challenge-direct`, `accept`: **esas tres no esperan al minuto**,
  se pregunta siempre. Son cosas que pasan una vez cada tanto, así que preguntar siempre no cuesta
  nada, y es donde peor queda que un baneado siga pudiendo (el autor lo probó y publicó un desafío con
  la cuenta que acababa de banear). El **chat** queda con el minuto a propósito: ahí son muchos
  mensajes seguidos y preguntar en cada uno le duplicaría la latencia y le sumaría consultas a la base.
- `broadcastChat()`: el reparto del chat saltea a quien tiene bloqueo cruzado con el que escribe. La
  **excepción pensada sigue en pie**: un moderador lee a todos, así nadie se esconde bloqueando al mod.
  Y el autor siempre se ve su propio mensaje.
- El mensaje nuevo `refresh-me`: el navegador avisa que acaba de bloquear a alguien y el servidor le
  refresca las listas en el acto (con un freno de 5 segundos para que no se pueda abusar).
- Los bloqueos ahora también viajan en el "attachment" del chat del torneo (antes sólo los tenía el
  lobby), así sobreviven a que el Durable Object se duerma.

`index.html` — al bloquear o desbloquear, avisarles a los chats abiertos; y ante el cierre 4003
(cuenta suspendida) **dejar de reconectar** en la sala de Jugar y en el chat del torneo, en vez de
volver como invitado.

**Lo que NO cambió a propósito:** el historial que se manda al entrar a un chat sigue filtrándose en el
navegador (el servidor lo manda antes de saber quién sos). No es un agujero nuevo: es exactamente lo que
había, y lo que se arregló es el mensaje que llega **en vivo**, que es el que molesta.

### Cómo se publica (el orden importa)

1. **cr-proxy primero** (panel de Cloudflare → Worker `cr-proxy` → **Edit code** → pegar
   `cr-proxy-worker.js` entero → **Deploy**). Sin esto, el paso 2 preguntaría por un endpoint que no
   existe: no rompería nada (la revalidación falla y se queda con lo que había), pero no serviría.
2. **vivo-worker después**: `cd vivo-worker` y `npm run deploy`.
3. **La web al final**: `publicar-web.cmd`. Es la parte menos importante (sin ella el bloqueo igual
   muerde, sólo que tarda hasta un minuto en notarse).

### Cómo se prueba la Fase 5

Hacen falta dos cuentas (la de mod y otra).

1. Con las dos conectadas al chat de un torneo, banear a la segunda desde su perfil:
   la segunda **no** tiene que poder escribir más, sin cerrar la pestaña.
2. Silenciar desde el chat del lobby y comprobar que tampoco puede escribir en
   La hinchada.
3. Quitar el silencio desde el panel 🛡️ y comprobar que puede escribir enseguida.
4. Bloquear a alguien y confirmar que sus mensajes **ya no llegan** (mirar con las
   herramientas del navegador que el mensaje no esté escondido, sino ausente).
5. Con la cuenta de mod, confirmar que sí se siguen viendo los mensajes de un
   bloqueado.

---

## FASE 6 — Velocidad del backend y progreso de ejercicios

Todo en `cloudflare-worker/cr-proxy-worker.js`, **una sola publicación**.

### 6.1 · Que "quién soy" no dispare doce consultas `[12]`

- `cr-proxy-worker.js:1485-1520` (`ratingMe`), `:1044`, `:1613`, `:1677`
  (las funciones `ensure*Table`)
- Hoy: `/rating/me` busca la sesión, crea-si-no-existe cinco tablas, lee tres
  ratings, lee "no molestar" y lee las dos listas de bloqueos. Unas doce idas y
  vueltas, una detrás de la otra. Y se llama en **cada** conexión de cada chat, en
  cada partida y en cada carga de página.
- Arreglo, en dos pasos:
  - Crear las tablas una sola vez por instancia. Ya lo hacés con `_usuariosMigrated`;
    falta hacerlo igual con las demás.
  - Juntar las lecturas en una consulta con `JOIN`, o mandarlas con `batch()`.
- Es la causa más probable de que "tarde en aparecer el chat".

### 6.2 · Que el progreso de ejercicios no se pise entre dispositivos `[16]`

- `cr-proxy-worker.js:1913-1930`
- Hoy: el progreso se guarda como un bloque entero que reemplaza al anterior. Si
  resolvés en el teléfono y después abrís la computadora que tenía una copia vieja,
  al guardar **borrás lo del teléfono**: rating, racha y calendario vuelven atrás.
- Arreglo mínimo: guardar la marca de tiempo de la última modificación y rechazar el
  guardado si el que llega es más viejo que el que ya está.
- Arreglo bueno: fusionar por ejercicio (quedarse con el mejor resultado de cada
  uno) en vez de reemplazar el bloque.

### Cómo se prueba la Fase 6

1. Cronometrar cuánto tarda en aparecer el chat de un torneo, antes y después.
2. Resolver un ejercicio en el teléfono, después abrir la computadora y resolver
   otro: al recargar los dos, **los dos** tienen que estar contados.

---

## FASE 7 — Los arreglos de la web

Todo en `index.html` (y `editar.html` si toca), **una sola publicación** con
`publicar-web.cmd`.

### 7.1 · Que al visitante no le salten carteles del modo autor `[17]`

- `index.html:21249` (`liberarEspacioLS`) y `:5100-5107` (`crDataSave`)
- Hoy: la web guarda en el navegador los cruces de cada torneo que abrís (en una
  visita nueva ya son 109 KB). Cuando eso llena el navegador, el sitio ofrece
  "liberar espacio", el visitante dice que sí, y la función contesta *"Esto es del
  modo autor (tu carpeta), no de la web publicada"* y no borra nada. Después salta
  un segundo cartel que le pide usar un botón que en la web no existe. Queda
  atrapado en un bucle.
- Arreglo: en modo publicado, cuando no entra, borrar en silencio los cruces más
  viejos (la mitad, por ejemplo) y reintentar. Sin ningún cartel: los datos se
  vuelven a bajar solos cuando hagan falta.
- Se llega ahí con unos 150-400 torneos abiertos, o sea que le pasa a los que más
  usan el sitio.

### 7.2 · Que no se pierda el primer mensaje del chat `[14]`, mitad navegador

- Depende de la **Fase 3.7** (que el servidor mande `ready` / `not-ready`).
- Arreglo: tener el cuadro de escribir deshabilitado hasta que llegue el `ready`, y
  reintentar una vez si llega un `not-ready`.

### 7.3 · Pasarle el PIN al redactor de noticias

- Depende de la **Fase 4.1**. Buscar `_noticiaAIGenerate` en `index.html` y sumar el
  PIN al cuerpo del pedido.
- **Si la Fase 4 ya se hizo, este ítem es urgente**: hasta que se haga, el botón de
  IA no anda.

### 7.4 · Sacar los tres archivos que dan 404 `[24]`

- `index.html:2015`, `:2022`, `:2024`
- Hoy: la web publicada pide `embedded-data.js`, `embedded-photos.js` y
  `embedded-flyers.js`, que solo existen en tu carpeta. Los tres fallan (verificado
  en vivo). Es a propósito, pero ensucia la consola y son tres viajes al pedo.
- Arreglo: el generador de publicación ya saca la etiqueta de `embedded-data.js`
  (`index.html:10525`); que saque también las otras dos.

### 7.5 · Achicar el caché de posiciones `[26]`

- `index.html:25062-25071` (`tdFinalFenCached`)
- Hoy: usa el PGN entero como clave, con tope de 500. Son fácilmente 2 MB de memoria
  en una sesión larga en un teléfono viejo.
- Arreglo: usar un resumen corto del PGN como clave, o bajar el tope a 200.

### 7.6 · Arreglar el comentario que miente `[23]`

- `index.html:33955`
- Dice "Bloquear = personal y del navegador (no viaja entre dispositivos, no afecta
  a los demás)". Es de la versión vieja: hoy el bloqueo se guarda en la cuenta,
  viaja entre dispositivos y sí afecta a los desafíos del otro.

### 7.7 · Poder volver al salón sin perder el desafío  ← pedido del autor, 26/08

**No es un hallazgo de la auditoría: lo pidió el autor.** Al crear un desafío se abre la
sala con el tablero. Si desde ahí querés volver al salón —por ejemplo para charlar en el
chat mientras esperás rival— el desafío se cancela. Navegar a **otras pestañas** del
sitio con el desafío abierto sí funciona bien; el problema es sólo volver al salón.

- Por qué pasa: el único camino de vuelta es el botón `#lv-exit` ("🏠 Volver al menú"),
  que está enganchado a `exit()` (`index.html:32385`), y `exit()` cancela el desafío y
  cierra la conexión de la sala a propósito.
- Arreglo, en tres partes:
  1. Un botón nuevo en la vista de la sala, visible **sólo mientras esperás rival**
     (algo como "💬 Ir al salón"), que llame a `showLobby()` **sin** pasar por `exit()`:
     no toca `lvMyChallenge` ni cierra el WebSocket de la sala. `#lv-exit` se queda como
     está: ése sí es irse de verdad.
  2. Que el salón muestre que tenés un desafío abierto y cómo volver. La píldora que ya
     existe (`updatePendingPill`, `:32328`) hoy se esconde cuando estás en la pestaña
     Jugar (`vivoActive`); hay que dejarla aparecer también ahí cuando se está viendo
     el salón y hay `lvMyChallenge`.
  3. **La trampa, y es la parte importante:** hoy el creador siempre está mirando el
     tablero cuando entra el rival. Con este cambio puede estar en el salón, y si nadie
     lo lleva de vuelta se pierde el arranque de su propia partida **con el reloj
     corriendo**. Hay que hacer que, cuando el estado pase a `playing`, se llame a
     `showGame()` automáticamente (en `handle()`, donde se procesa `state`/`newgame`).
- Ojo con el tope de inactividad de la Fase 1: una sala esperando rival se cierra a los
  15 minutos. Eso ya pasa hoy navegando por otras pestañas, así que no es nuevo — pero
  conviene probar que el aviso se vea bien también desde el salón.

### Cómo se prueba la Fase 7

1. Abrir la web publicada y mirar la consola: **no** tiene que haber errores rojos.
2. Entrar a un torneo con cruces y confirmar que la tabla aparece.
3. Entrar a "La hinchada" y escribir enseguida: el primer mensaje tiene que salir.
4. Probar el botón de la noticia con IA (si ya se hizo la Fase 4).

---

## FASE 8 — Prolijidad y código muerto

La fase de "dejar limpio". Nada de esto cambia cómo funciona el sitio.

### 8.1 · Moderadores por identificador, no por nombre `[22]`

- `cr-proxy-worker.js:1037`, `vivo-worker/src/index.js:76`, `index.html:32801`
- Hoy: los dos nombres de moderador están copiados a mano en tres lugares que hay que
  mantener sincronizados, y la comparación es por nombre de usuario, que puede
  cambiar, en vez de por identificador de cuenta, que no.
- Arreglo: una columna `is_mod` en la tabla de usuarios, y leerla.
- **Dato útil:** `vivo-worker` no hay que tocarlo — ya lee `is_mod` de `/rating/me`,
  así que el cambio le llega solo. El de `index.html` puede quedar como está (solo
  decide quién ve los botones; el que manda es el servidor).
- Se cruza con el hallazgo `[2]` de la Fase 1: es defensa en profundidad.

### 8.2 · Borrar las quince funciones muertas `[20]`

Están escritas y no las llama nadie. Antes de borrar cada una, buscar el nombre en
el archivo para confirmar que sigue sin aparecer.

`index.html` — `_vsBase`:8197 · `pgnDetectTourName`:9353 · `pgnShowResult`:9359 ·
`_fsClearHandle`:10575 · `crShowStatus`:10944 · `crParseHtml`:10984 ·
`crShowPreview`:11000 · `_lookupOpeningByEpds`:16084 · `openMasterGame`:17110 ·
`_card3Heading`:21219 · `_openWithArgFilter`:21859 · `flyerImgHtml`:22791 ·
`lvRatTxt`:30875 · `whoWins`:31336 · `copyLink`:34381

> Los números de línea van a moverse a medida que se hagan las otras fases. Buscar
> por nombre, no por línea.

### 8.3 · Avisar del código duplicado `[21]`

- `editar.html:753-1200` vs `index.html:14821-15260` (el bloque `gc*` / `_bd*`)
- Hay **23 funciones idénticas letra por letra** y **24 que comparten el nombre pero
  ya tienen el cuerpo distinto**. Las divergentes son en buena parte legítimas (cada
  página saca los datos de otro lado), pero es el terreno donde nacen los bugs de
  "lo arreglé en el teléfono y en la compu sigue mal".
- No vale la pena reestructurarlo. Lo práctico: un comentario grande arriba del
  bloque en los dos archivos, avisando que está duplicado.

### 8.4 · Sin acción: el identificador de sala de 8 caracteres `[27]`

Son 4.000 millones de combinaciones: adivinar una sala concreta es inviable. Queda
anotado nada más para que sepas que una partida "privada" es en realidad "no
listada": si alguien comparte el link, entra quien sea. **No hay que hacer nada.**

---

## Lo que NO hay que tocar

El informe encontró cinco áreas limpias. Si en alguna fase aparece la tentación de
"aprovechar y mejorar" alguna de estas, la respuesta es no:

- **El escapado de HTML de los chats y los perfiles.** No hay un solo agujero.
- **Cómo se guardan los secretos.** Están todos donde tienen que estar.
- **Las listas blancas de los cinco proxys.** Probadas contra el servidor real.
- **Que no haya dependencias de CDN.** Es una ventaja grande, no un descuido.
- **El JavaScript "viejo" con comprobaciones previas.** Es lo que hace que ande en
  cualquier teléfono.
