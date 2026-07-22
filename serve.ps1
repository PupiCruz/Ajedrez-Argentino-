param([int]$Port = 8099)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"
# Abrir la app sola. Se prefiere CHROME porque Brave (el navegador por defecto de esta PC)
# desactiva la File System Access API por privacidad -> no aparece "Elegir carpeta data\" ni el
# guardado directo en la carpeta. Chrome la trae activada. Si Chrome no esta instalado, se cae al
# navegador por defecto (la app funciona igual, solo con la descarga de archivos de siempre).
$url = "http://localhost:$Port/"
$chrome = $null
foreach ($p in @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")) {
  if (Test-Path $p) { $chrome = $p; break }
}
if (-not $chrome) {
  try { $chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction Stop).'(default)' } catch {}
}
try {
  if ($chrome -and (Test-Path $chrome)) {
    Write-Host "Abriendo en Chrome (para el guardado directo en la carpeta)"
    Start-Process $chrome $url
  } else {
    Write-Host "Chrome no encontrado; abriendo en el navegador por defecto (sin guardado directo)"
    Start-Process $url
  }
} catch { try { Start-Process $url } catch {} }
$mime = @{ ".html"="text/html"; ".js"="application/javascript"; ".css"="text/css"; ".json"="application/json"; ".svg"="image/svg+xml"; ".png"="image/png"; ".pgn"="text/plain"; ".wasm"="application/wasm"; ".mp3"="audio/mpeg" }
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($rel)) { $rel = "index.html" }
    $path = Join-Path $root $rel
    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      # Sin caché: que el navegador siempre baje la versión fresca de los archivos. Evita que,
      # tras editar index.html, el navegador siga mostrando la versión vieja al recargar.
      $ctx.Response.Headers.Add("Cache-Control","no-store, no-cache, must-revalidate, max-age=0")
      $ctx.Response.Headers.Add("Pragma","no-cache")
      # Aislamiento (crossOriginIsolated) para la app: sin estos 2 headers el navegador no habilita
      # SharedArrayBuffer y el motor multi-hilo NUNCA se puede probar en el servidor local. Son los
      # mismos que manda Cloudflare en la web publicada (ver "_headers"), y por el mismo criterio se
      # aplican SOLO a index.html (no a editar.html ni 404.html).
      if ($rel -eq "index.html") {
        $ctx.Response.Headers.Add("Cross-Origin-Opener-Policy","same-origin")
        $ctx.Response.Headers.Add("Cross-Origin-Embedder-Policy","credentialless")
      }
      # Con la pagina aislada, el navegador exige que el archivo del MOTOR (corre como "worker")
      # traiga tambien el COEP, aunque sea del mismo sitio: si no, lo bloquea (ERR_BLOCKED_BY_RESPONSE)
      # y la app se cae al SF16 embebido. Mismo criterio que "/assets/*" en "_headers".
      if ($rel -like "assets/*") {
        $ctx.Response.Headers.Add("Cross-Origin-Embedder-Policy","credentialless")
      }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch {}
}
