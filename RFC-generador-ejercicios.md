# RFC: Generador de ejercicios tácticos para ChessArgentino

**Estado:** diseño cerrado (decisiones tomadas) · **Fecha:** 2026-06-19 · **Autor:** Matías + análisis Claude

> Documento de diseño técnico. Todavía NO se implementa nada. Esto es el plan acordado.

---

## 1. Veredicto

- ✅ **App/herramienta separada de autor.** El esquema de datos es el contrato estable; la herramienta es desechable.
- ✅ **Pipeline importar→analizar→detectar→filtrar→revisar→aprobar→exportar.** Correcto, con un cambio clave: la detección se basa en "jugada única que castiga un error", NO en "swing de evaluación".
- ⚠️ **Rating dinámico (Elo/Glicko):** idea correcta, pero con bajo tráfico converge lento y ruidoso → prior fuerte del motor + ajuste amortiguado. Va en Fase 2/3.
- ✅ **Calidad ≠ dificultad.** Ortogonales. La calidad es editorial (humana), no auto-derivable.
- 🔗 **Esto es la herramienta de autor del plan ya existente** (pestaña Ejercicios + crowd-stats con Cloudflare Worker). No es un proyecto nuevo: unificar backend.

---

## 2. Decisiones cerradas

| # | Tema | Decisión |
|---|------|----------|
| 1 | Motor | **Stockfish 18 nativo** (binario UCI ya descargado) para el batch. La web del visitante sigue con WASM-16. Se guarda `engine`+`genDepth` por puzzle. |
| 2 | UI de revisión | **Reusar el tablero/visor existente de ChessArgentino** (opción A: script + página local). Aprobar/descartar/editar tema y nivel con teclado. Sin Electron, sin stack nuevo. |
| 3 | Mates cortos | **Dos carriles.** Táctica general exige ≥2 jugadas del solucionador. Mates en 1/2/3 limpios entran aunque sean cortos, pero a una **sub-sección "Mates"** separada. |
| 4 | Dificultad | **El motor sugiere nivel; el autor acepta o ajusta.** Se guardan `suggested`, `final` y `adjustedByAuthor`. |

### Nota sobre Stockfish 18 nativo vs WASM-16
No hay contradicción con la nota histórica "SF se queda en 16": eso era sobre el build **WASM single-file** que corre en el navegador del visitante (esos builds empaquetados quedaron en versiones viejas). El **binario nativo** es independiente, más profundo y mucho más rápido, ideal para análisis batch nocturno. La app web no cambia.

---

## 3. Arquitectura

**Herramienta separada, contrato compartido.** Razones:
1. Compute pesado (Stockfish profundo sobre torneos enteros) no tiene nada que ver con el runtime del visitante.
2. Stockfish nativo (UCI por stdin/stdout) >> WASM para batch.
3. Es flujo de autor (igual que se gatea con `!_ondemand`).

**Condición crítica:** la herramienta puede cambiar; **el esquema de `puzzles.json` es permanente.** Diseñar el formato de salida primero.

**Stack:** Node.js + `chess.js` (ya conocido) + binario Stockfish 18 nativo vía proceso UCI + página de revisión local que **reusa el tablero/visor de ChessArgentino**.

```
PGN torneo  ─▶  Analizador (SF18 nativo)  ─▶  candidates.json (cola)
                                                      │
                                                      ▼
                                   UI de revisión (tablero existente,
                                   aprobar/descartar/editar tema+nivel)
                                                      │
                                                      ▼
                                              puzzles.json (contrato estable)
                                                      │
                                                      ▼
                                       ChessArgentino (solo lee)
```

---

## 4. Pipeline de detección

Por cada partida, recorrer jugadas y correr Stockfish con **MultiPV ≥ 2** (mejor + segunda mejor).

**Paso 1 — Detectar el error del rival (disparador).**
La posición candidata es la de **justo después del error del rival**. La solución es el castigo.
- Mate forzado que aparece donde no lo había.
- Eval pasa de rango "no decidido" `[-1.0, +2.0]` a `≥ +5.0` o mate, a favor del lado a mover.

**Paso 2 — Validar solución FORZADA y ÚNICA (filtro clave).**
Reproducir la línea (mejores propias, mejores del rival). En cada jugada del solucionador exigir:
- **Unicidad:** la mejor supera a la segunda por margen grande (la 2ª no gana / gap ≥ 2.0). Si hay 2 jugadas que ganan → no es puzzle (o baja unicidad).
- **Profundidad mínima:** ver carriles (sección 6).
- **Terminación clara:** mate, ganancia material decisiva, o eval estabilizada en ganado.

**Paso 3 — Etiquetar tema (heurístico, revisable):**
`mate`, `mateInN`, `fork`, `pin`, `skewer`, `discoveredAttack`, `doubleCheck`, `sacrifice`, `hangingPiece`, `trappedPiece`, `backRankMate`, `smotheredMate`; fase `opening/middlegame/endgame`; longitud `short/long`.

**Criterios por valor (orden):**
1. Mate forzado único.
2. Sacrificio que gana.
3. Combinación forzada con tema claro.
4. Error grave castigado con jugada única.
5. Ganancia de material simple (nivel principiante → marcar fácil).

---

## 5. Evitar falsos positivos

De barato a caro:
1. Descartar swings sin unicidad (≥2 jugadas ganadoras → fuera).
2. Descartar "ya estaba ganado" (el error debe cambiar el resultado, no aumentarlo).
3. Descartar finales triviales/técnicos (eval sube pero sin línea forzada corta).
4. **Re-verificar el finalista a depth ALTO** (se detecta a depth medio sobre todo; se confirma a depth alto). Acá mueren muchos falsos positivos.
5. Filtrar por estabilidad temporal de la eval en la línea.
6. Deduplicar por FEN (reusar lógica de dedup del pool de partidas).
7. **Humano = último filtro.** Apuntar a 70-80% de aprobables en la cola; si es menos, endurecer 1-5.

**Regla de oro:** ante la duda, el filtro automático descarta. Falso negativo (perder un buen puzzle) es barato; falso positivo es caro.

---

## 6. Carriles: Táctica general vs Mates

- **Táctica general:** solución de **≥2 jugadas del solucionador** + unicidad fuerte. Descarta los de 1 jugada (obvios).
- **Mates:** `mateIn1` / `mateIn2` / `mateIn3` limpio y forzado **entra aunque sea corto**, pero se rutea a la **sub-sección "Mates"**, no al pool de táctica general.
- Implementación: cae natural en `themes` + un campo de categoría/sección. ChessArgentino filtra la sub-pestaña por tema.

---

## 7. Esquema de datos por ejercicio

Separar **inmutable** (generado) de **dinámico** (uso). Las stats NO van acá (ver sección 8).

```jsonc
{
  // === IDENTIDAD ===
  "id": "arg_2026_continental_r5_b12_p1",
  "schemaVersion": 1,
  "section": "tactics",            // "tactics" | "mates"

  // === POSICIÓN Y SOLUCIÓN (inmutable) ===
  "fen": "....",                   // posición inicial (post-error)
  "sideToMove": "w",
  "solution": ["d5d6", "e7e8", "f3f7"],   // UCI: jugadas propias + respuestas
  "solutionSan": ["d6", "...Re8", "Qxf7#"],
  "lines": { /* variantes alternativas aceptables, opcional */ },

  // === CLASIFICACIÓN ===
  "themes": ["sacrifice", "backRankMate", "short"],
  "phase": "middlegame",

  // === DIFICULTAD (decisión 4) ===
  "difficulty": {
    "suggested": 1650,             // propuesto por el motor
    "final": 1500,                 // confirmado/ajustado por el autor
    "adjustedByAuthor": true
  },
  "priorBasis": { "depth": 30, "uniqueness": 3.2, "solutionLen": 3 },

  // === CALIDAD EDITORIAL (humana) ===
  "quality": 4,                    // 1-5, puesto al aprobar
  "qualityNote": "sacrificio temático limpio",

  // === PROCEDENCIA (activo diferencial) ===
  "source": {
    "tournamentId": "continental_2026",
    "tournamentName": "Continental 2026",
    "round": 5, "board": 12,
    "white": "Pérez, Juan", "black": "Gómez, Ana",
    "whiteFideId": "...", "blackFideId": "...",
    "date": "2026-05-..",
    "gameRef": "?torneo=continental_2026&partida=137",  // deep-link a partida completa
    "ply": 41
  },

  // === TRAZABILIDAD ===
  "engine": "Stockfish 18 NNUE",
  "genDepth": 30,
  "generatedAt": "2026-06-19",
  "reviewedBy": "autor"

  // === STATS DINÁMICAS: NO van acá → backend (sección 8) ===
}
```

El `gameRef` con deep-link reusa el sistema `?torneo=<id>&partida=<idx>` ya existente: cada puzzle linkea a la partida completa del pool. "¿Cómo siguió la partida real?" → un clic.

---

## 8. Estructura de datos y consumo

Dos planos separados.

### Plano estático (publicado, ChessArgentino solo lee)
- `puzzles.json` (particionar por torneo/dificultad si crece, igual que `games_0/games_1`).
- **Inmutable + cacheable agresivo** (como `/assets/*` immutable vs `/*` no-cache).
- Se lee on-demand igual que `games_N.json`.

### Plano dinámico (stats de uso → backend)
**Cloudflare Worker + D1** (el mismo backend candidateado para crowd-stats — NO construir dos veces).

```
Worker:
  POST /attempt  { puzzleId, userId/anon, solved, attemptNum, timeMs, hintsUsed, gaveUp }
  GET  /stats    → ratings + agregados por puzzle
D1 (SQLite):
  attempts(puzzleId, userId, solved, timeMs, hints, gaveUp, ts)   -- crudo
  puzzle_stats(puzzleId, rating, rd, nAttempts, pctSolved, medianTimeMs)  -- agregado
```

**D1 sobre KV** porque se necesitan agregaciones (`AVG`, `COUNT`, percentiles). Free tier sobra para el volumen actual.

ChessArgentino al abrir la pestaña: lee `puzzles.json` (estático) + `GET /stats` (dinámico) y los mergea en runtime. Mismo patrón "estático + overlay dinámico" ya usado.

---

## 9. Dificultad dinámica + rating (Fase 2/3)

Intuición correcta (prior + evolución por uso), pero **el bajo tráfico es el problema duro.**

Diseño:
1. **Prior del motor** (`difficulty.suggested`): fórmula simple y transparente
   ```
   prior = base
         + longitud_solución * k1
         + (es_sacrificio ? +250 : 0)
         - unicidad * k2                  // más obvio = más fácil
         + profundidad_para_ver_la_idea
         + rareza_de_la_jugada_clave
   ```
2. **Glicko-2 con prior como "partidas virtuales"**: inicializar con `difficulty.final` y **RD bajo** → los primeros intentos lo mueven poco. Solo con volumen real se despega del prior.
3. **Solo el PRIMER intento de cada usuario cuenta para el rating** (como Lichess). Requiere id anónimo persistente en localStorage.
4. **No mostrar rating numérico hasta N mínimo** (~20 primeros intentos). Antes, etiqueta cualitativa.
5. **Tiempo, pistas, abandonos NO entran al rating** — entran a diagnóstico/calidad. El rating se calcula solo con resuelto/no-resuelto del primer intento.

**Tiempo:** los PGN de Chess-Results no traen relojes confiables. El tiempo sale del **cronómetro del solver** de la app, no del PGN.

**Veredicto:** Fase 1 publica con dificultad = `final` (estática). El rating dinámico llega cuando haya backend Y tráfico suficiente. No optimizar prematuramente.

---

## 10. Calidad vs dificultad

- **Dificultad** = qué tan duro es (cuántos lo resuelven). Auto-derivable del uso.
- **Calidad** = qué tan instructivo/lindo. **Casi NO auto-derivable** → editorial (campo `quality` 1-5 al aprobar).

Señales que pueden *sugerir* calidad (no reemplazarla): abandono alto + acierto bajo = posible "injusto"; muchas pistas y luego resuelto = buen ejercicio de aprendizaje; tema limpio (mate/sacrificio) suele correlacionar. Decisión final humana.

Uso en ChessArgentino: ordenar/priorizar por calidad; "selección curada"/"puzzle del día" con `quality ≥ 4`; publicar todos pero mostrar primero los buenos.

---

## 11. Roadmap

- **Fase 0 — Contrato (1 día):** congelar el esquema de `puzzles.json` (sección 7).
- **Fase 1 — Generador + revisión, dificultad estática (la grande):**
  - Script Node: PGN → SF18 nativo UCI → detección → `candidates.json`.
  - Filtros estrictos (sección 5).
  - UI de revisión reusando el tablero existente: aprobar/descartar/editar tema/aceptar-o-ajustar nivel por teclado.
  - Export a `puzzles.json` con `difficulty.final`.
  - **Resultado:** pestaña Ejercicios (con sub-sección Mates) usable y publicable, con deep-link a la partida. Producto completo.
- **Fase 2 — Backend de stats:** Cloudflare Worker + D1 (unificado con crowd-stats). Mostrar % aciertos, tiempo, dificultad cualitativa.
- **Fase 3 — Rating dinámico:** Glicko-2 con prior fuerte + amortiguación; solo primer intento; recálculo nocturno (cron Worker).
- **Fase 4 — Refinamientos:** "puzzle del día", colecciones por jugador argentino / por torneo / por tema.

---

## 12. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Falsos positivos inundan la revisión | Filtros estrictos + re-verificación a depth alto del finalista |
| Rating ruidoso por bajo tráfico | Prior fuerte + RD bajo inicial + esconder hasta N intentos |
| Re-publicar todo al cambiar un stat | Stats fuera de `puzzles.json` (backend); estático inmutable |
| Cambio de versión de Stockfish invalida unicidad | Guardar `engine`+`genDepth`; re-validar al actualizar motor |
| Sesgo de un usuario fuerte | Solo primer intento por usuario; id anónimo persistente |
| Calidad de partidas amateur | Humano-en-el-loop obligatorio; filtros que descartan de más |

---

## 13. Pendiente / próximos pasos

1. Congelar esquema (Fase 0).
2. Definir umbrales numéricos finales de detección (depth medio vs alto, gap de unicidad).
3. Afinar fórmula del prior con los primeros ajustes manuales (`adjustedByAuthor`).
