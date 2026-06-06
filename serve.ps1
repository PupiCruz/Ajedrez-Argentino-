param([int]$Port = 8099)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"
# Abrir la app sola en el navegador predeterminado (el listener ya esta escuchando).
try { Start-Process "http://localhost:$Port/" } catch {}
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
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch {}
}
