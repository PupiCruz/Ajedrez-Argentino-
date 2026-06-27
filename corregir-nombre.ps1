param(
  [string]$Buscar,
  [string]$Reemplazar,
  [switch]$Apply,      # con -Buscar/-Reemplazar: aplica de una (sin preguntar). Sin esto: solo cuenta (dry-run).
  [switch]$Yes         # en modo interactivo, no pedir confirmacion
)

# ============================================================================
#  Corregir nombres en la base de partidas (jugadores y torneos)
# ----------------------------------------------------------------------------
#  Reemplaza un nombre por otro en los archivos de datos (embedded-data.js y
#  hardcoded.js). Sirve para unificar variantes:
#     - Jugadores cortados:   Flores, Di      ->  Flores, Diego
#     - Torneos con 2 nombres: 5. Perez Chess Open 2026 -> V PEREZ CHESS OPEN...
#
#  SEGURO: solo cambia el VALOR COMPLETO entre comillas. Asi, cambiar
#  "Flores, Di" NO rompe a "Flores, Diego" (son valores distintos).
#  Los nombres viven en 2 formas dentro del archivo y se cubren las dos:
#     1) campo JSON:        "Flores, Di"
#     2) dentro del PGN:    \"Flores, Di\"   (comillas escapadas)
#
#  Despues de correrlo: abri la app (index) para ver el cambio, y publica con
#  "Preparar archivos para GitHub" + publicar-web.cmd.
# ============================================================================

$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @('data\embedded-data.js', 'data\hardcoded.js')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Cargar los archivos a memoria una sola vez (embedded-data.js es grande).
$texts = @{}
foreach ($rel in $files) {
  $p = Join-Path $root $rel
  if (Test-Path $p) { $texts[$rel] = [System.IO.File]::ReadAllText($p) }
}
if ($texts.Count -eq 0) {
  Write-Host "No encontre data\embedded-data.js ni data\hardcoded.js junto a este script." -ForegroundColor Red
  Read-Host "Enter para cerrar"; exit 1
}

$script:backupDone = $false

function Contar([string]$texto, [string]$buscar) {
  $patEsc = '\"' + $buscar + '\"'      # \"X\"  (dentro del PGN)
  $patRaw = '"'  + $buscar + '"'       # "X"    (campo JSON)
  $n1 = ([regex]::Matches($texto, [regex]::Escape($patEsc))).Count
  $n2 = ([regex]::Matches($texto, [regex]::Escape($patRaw))).Count
  return @($n1, $n2)
}

function Aplicar([string]$buscar, [string]$reemplazar) {
  # Backup (una sola vez por corrida) antes del primer cambio.
  if (-not $script:backupDone) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    foreach ($rel in @($texts.Keys)) {
      $src = Join-Path $root $rel
      Copy-Item $src ($src + ".bak-$stamp") -Force
    }
    Write-Host "  (respaldo creado: *.bak-$stamp)" -ForegroundColor DarkGray
    $script:backupDone = $true
  }
  $patEsc = '\"' + $buscar + '\"'; $repEsc = '\"' + $reemplazar + '\"'
  $patRaw = '"'  + $buscar + '"';  $repRaw = '"'  + $reemplazar + '"'
  $totalFile = 0
  foreach ($rel in @($texts.Keys)) {
    $c = Contar $texts[$rel] $buscar
    $n = $c[0] + $c[1]
    if ($n -gt 0) {
      $nuevo = $texts[$rel].Replace($patEsc, $repEsc).Replace($patRaw, $repRaw)
      [System.IO.File]::WriteAllText((Join-Path $root $rel), $nuevo, $utf8NoBom)
      $texts[$rel] = $nuevo
      $totalFile += $n
    }
  }
  return $totalFile
}

# -- Modo no interactivo: -Buscar y -Reemplazar por parametro --
if ($Buscar) {
  if (-not $Reemplazar) { Write-Host "Falta -Reemplazar." -ForegroundColor Red; exit 1 }
  $tot = 0
  foreach ($rel in @($texts.Keys)) { $c = Contar $texts[$rel] $Buscar; $tot += ($c[0] + $c[1]) }
  Write-Host ("'{0}'  ->  '{1}'   ({2} coincidencias)" -f $Buscar, $Reemplazar, $tot)
  if ($Apply -and $tot -gt 0) { $hechos = Aplicar $Buscar $Reemplazar; Write-Host "Reemplazados: $hechos" -ForegroundColor Green }
  elseif (-not $Apply) { Write-Host "(dry-run: no se escribio nada. Agrega -Apply para aplicar.)" -ForegroundColor Yellow }
  exit 0
}

# -- Modo interactivo (doble clic): bucle de reemplazos --
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Corregir nombres (jugadores y torneos)"     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Escribi el nombre TAL CUAL aparece y por que reemplazarlo."
Write-Host "Ej: buscar  Flores, Di      reemplazar  Flores, Diego"
Write-Host "Deja 'buscar' vacio y Enter para terminar."
Write-Host ""

while ($true) {
  $buscar = Read-Host "Buscar (vacio = salir)"
  if ([string]::IsNullOrWhiteSpace($buscar)) { break }
  $reemplazar = Read-Host "Reemplazar por"
  if ([string]::IsNullOrWhiteSpace($reemplazar)) { Write-Host "  Reemplazo vacio, salteado." -ForegroundColor Yellow; continue }
  if ($buscar -eq $reemplazar) { Write-Host "  Son iguales, salteado." -ForegroundColor Yellow; continue }

  $tot = 0
  foreach ($rel in @($texts.Keys)) { $c = Contar $texts[$rel] $buscar; $tot += ($c[0] + $c[1]) }
  if ($tot -eq 0) { Write-Host "  No encontre '$buscar' (revisa tildes/espacios)." -ForegroundColor Yellow; Write-Host ""; continue }

  Write-Host "  Encontre $tot coincidencia(s) de '$buscar'." -ForegroundColor White
  $ok = 's'
  if (-not $Yes) { $ok = Read-Host "  Cambiar todas por '$reemplazar'? (s/n)" }
  if ($ok -eq 's' -or $ok -eq 'S') {
    $hechos = Aplicar $buscar $reemplazar
    Write-Host "  OK: $hechos reemplazo(s)." -ForegroundColor Green
  } else {
    Write-Host "  Cancelado." -ForegroundColor Yellow
  }
  Write-Host ""
}

Write-Host ""
if ($script:backupDone) {
  Write-Host "Hecho. Ahora:" -ForegroundColor Green
  Write-Host "  1) Abri la app (index) y revisa que se vea bien."
  Write-Host "  2) Para que salga a la web: 'Preparar archivos para GitHub' + publicar-web.cmd."
  Write-Host "  (Si algo salio mal, los respaldos *.bak-... estan en la carpeta data\.)"
} else {
  Write-Host "No se hizo ningun cambio."
}
Write-Host ""
Read-Host "Enter para cerrar"
