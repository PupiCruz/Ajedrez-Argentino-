param([int]$Port = 8098)
# Servidor del LABORATORIO: sirve la misma carpeta pero abre _lab.html (la copia de pruebas).
# Usa un puerto distinto al real (8099) para poder tener las dos webs abiertas a la vez.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "LAB sirviendo $root en http://localhost:$Port/_lab.html"
# Abrir directamente la web de pruebas (_lab.html), no el index real.
try { Start-Process "http://localhost:$Port/_lab.html" } catch {}
$mime = @{ ".html"="text/html"; ".js"="application/javascript"; ".css"="text/css"; ".json"="application/json"; ".svg"="image/svg+xml"; ".png"="image/png"; ".pgn"="text/plain"; ".wasm"="application/wasm"; ".mp3"="audio/mpeg" }
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($rel)) { $rel = "_lab.html" }
    $path = Join-Path $root $rel
    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      # Sin caché: que el navegador siempre baje la versión fresca (igual que el servidor real).
      $ctx.Response.Headers.Add("Cache-Control","no-store, no-cache, must-revalidate, max-age=0")
      $ctx.Response.Headers.Add("Pragma","no-cache")
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch {}
}
