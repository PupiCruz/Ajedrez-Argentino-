# Activar la edición desde el teléfono

> Guía para dejar andando `editar.html` (editar/crear torneos desde el celular).
> Son 3 pasos, se hacen UNA sola vez, tardan ~10 minutos.

## Cómo funciona (en una línea)

Teléfono → `editar.html` (pide un PIN) → Worker de Cloudflare (guarda el cambio en
GitHub, en `data/live-torneos.json`) → Cloudflare Pages republica la web sola (~1-2 min).

El token de GitHub vive SOLO dentro del Worker como secreto. El teléfono nunca lo ve.
El Worker solo puede escribir ese único archivo: aunque alguien adivinara el PIN,
no puede tocar `index.html` ni nada más. Y ese archivo se lee con red de seguridad:
si viniera roto, la web lo ignora y sigue normal.

---

## Paso 1 — Crear el token de GitHub (PAT fine-grained)

1. Entrá a https://github.com/settings/personal-access-tokens/new
   (o: GitHub → tu foto → **Settings** → **Developer settings** →
   **Fine-grained tokens** → **Generate new token**).
2. Completá:
   - **Token name**: `ajedrez-worker-edicion`
   - **Expiration**: 1 año (o Custom, lo más largo posible). *Anotá la fecha:
     cuando venza hay que repetir este paso.*
   - **Repository access**: ⚠️ **Only select repositories** → elegí SOLO
     `Ajedrez-Argentino-`.
   - **Permissions** → **Repository permissions** → **Contents** →
     **Read and write**. Nada más (todo lo demás en "No access").
3. **Generate token** y COPIÁ el token (empieza con `github_pat_…`).
   Se muestra una sola vez; si lo perdés, generás otro.

## Paso 2 — Cargar los secretos en el Worker

1. Dashboard de Cloudflare → **Workers & Pages** → tu worker **cr-proxy**.
2. **Settings** → **Variables and Secrets** → **Add**:
   - Type: **Secret** · Name: `GH_TOKEN` · Value: *(pegá el token del paso 1)*
   - Type: **Secret** · Name: `EDIT_PIN` · Value: *(inventá una FRASE larga,
     tipo `caballo-de-troya-en-mardel-2026`; es lo que vas a escribir en el
     teléfono la primera vez. Larga = imposible de adivinar.)*
3. Guardar.

## Paso 3 — Re-deployar el Worker y publicar la web

1. En el mismo worker → **Edit code** → borrá todo y pegá el contenido nuevo de
   `cloudflare-worker/cr-proxy-worker.js` → **Deploy**.
   (La base D1 no necesita nada: la tablita del rate-limit se crea sola.)
2. En la PC: `publicar-web.cmd` (sube `editar.html`, el `index.html` nuevo,
   `data/live-torneos.json` y `_headers` a GitHub → Pages redepliega).

---

## Usarlo desde el teléfono

- Abrí **https://chessargentino.pages.dev/editar.html** (guardala en la pantalla
  de inicio del teléfono).
- Escribí el PIN (podés tildar "Recordar en este teléfono").
- **Editar un torneo**: tocalo en la lista, cambiá lo que sea (típicamente pegar
  el link de Lichess / Chess-Results / info64) → **Guardar**.
- **Crear un torneo**: "➕ Crear torneo nuevo" → nombre, fechas, sede y el link →
  **Guardar**. Queda como tarjeta en la web; la tabla y las partidas en vivo las
  trae solas el link.
- En ~1-2 minutos el cambio está visible para todos.

## Después, en la PC (cuándo "adoptar")

Los cambios del teléfono viven en `data/live-torneos.json` (un archivo aparte);
la web publicada los fusiona sola. En la PC, la app te muestra un **banner en la
pestaña Torneos** cuando hay cambios del teléfono sin adoptar.

- Si el torneo va a recibir partidas PGN, fotos, etc.: rehacé esos datos en el
  editor de la PC (✏️), guardá y publicá como siempre.
- Cuando ya no hagan falta los cambios pendientes, vaciálos desde `editar.html`
  (botón 🧹 al final de la lista). Si no los vaciás, no pasa nada malo: solo
  seguirán "pisando" esos campos en la web publicada.
- `sincronizar.cmd` sigue sirviendo para traer a la PC los commits que hizo el
  teléfono (los hace el Worker con el mensaje "Teléfono: …").

## Si algo no anda

- **"PIN incorrecto"** → revisá el secreto `EDIT_PIN` del Worker.
- **"Demasiados intentos fallidos"** → esperá 1 hora (protección anti-adivinanza).
- **"Falta el secreto GH_TOKEN"** → paso 2.
- **"No se pudo guardar en GitHub: 401/403"** → el token venció o no tiene el
  permiso Contents Read/Write sobre el repo: repetí el paso 1.
- El guardado dice OK pero la web no cambia → esperá 2 min y recargá; si sigue,
  mirá en GitHub si apareció el commit "Teléfono: …" en `data/live-torneos.json`.
