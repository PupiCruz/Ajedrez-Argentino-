# ============================================================================
#  Chequeo silencioso: ya salio el Stockfish 19 para navegador?
# ============================================================================
#  Lo llama iniciar-servidor.cmd cada vez que se abre la app. La idea es NO
#  tener que acordarse de nada: el dia que el build exista, avisa solo.
#
#  QUE PREGUNTA: la lista de archivos de los ultimos releases de
#  nmrugg/stockfish.js (el build que usa Chess.com, el mismo de assets/).
#  Busca por NOMBRE EXACTO el archivo que iria a assets/:
#
#        stockfish-19-lite-single.wasm    (o 20, 21... el regex sube solo)
#
#  Por que por nombre y no por numero de version: Stockfish 19 retiro la red
#  neuronal chica en la que se apoyaba el sabor "lite". Puede pasar que salga
#  el 19 grande y el "lite" -el unico que nos sirve- no salga nunca. Buscando
#  el archivo exacto, ese caso queda cubierto sin pensar.
#
#  A PRUEBA DE FALLOS: sin internet, con GitHub caido o pasado el limite de
#  consultas, no dice nada y la app abre igual. Nunca frena el arranque.
#
#  Codigos de salida:  0 = nada nuevo (o no se pudo consultar)   9 = salio!
# ============================================================================

try {
    # Windows 11 ya negocia TLS 1.2, pero GitHub rechaza cualquier cosa menor.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $rels = Invoke-RestMethod -Uri 'https://api.github.com/repos/nmrugg/stockfish.js/releases?per_page=5' `
                              -Headers @{ 'User-Agent' = 'ajedrez-argentino-chequeo-motor' } `
                              -TimeoutSec 3

    # Todos los archivos de todos esos releases, en una sola lista.
    $assets = @($rels | ForEach-Object { $_.assets } | Where-Object { $_ })

    # El que buscamos: lite + single, version 19 o mayor.
    $lite = $assets | Where-Object {
        $_.name -match '^stockfish-(\d+)(\.\d+)?-lite-single\.wasm$' -and [int]$Matches[1] -ge 19
    } | Select-Object -First 1

    if ($lite) {
        $mb = [math]::Round($lite.size / 1MB, 1)
        Write-Host ''
        Write-Host '  ============================================================'
        Write-Host '     SALIO EL MOTOR NUEVO PARA LA WEB' -ForegroundColor Yellow
        Write-Host '  ============================================================'
        Write-Host ''
        Write-Host "     Archivo:  $($lite.name)   ($mb MB)"
        Write-Host "     Reemplaza a:  assets/stockfish-18-lite-single.wasm"
        Write-Host ''
        Write-Host '     Decile a Claude:  "salio el motor nuevo, actualizalo"' -ForegroundColor Yellow
        Write-Host ''
        Write-Host '  ============================================================'
        Write-Host ''
        exit 9
    }

    # Sali por aca si aparecio el grande pero NO el lite: es exactamente el
    # riesgo de la red chica. Conviene saberlo, porque significa que hay que
    # decidir por otro lado (el build de Lichess) y no seguir esperando.
    $grande = $assets | Where-Object {
        $_.name -match '^stockfish-(\d+)(\.\d+)?-single\.wasm$' -and [int]$Matches[1] -ge 19
    } | Select-Object -First 1

    if ($grande) {
        Write-Host ''
        Write-Host '  ------------------------------------------------------------'
        Write-Host "     Salio $($grande.name), pero NO la version liviana." -ForegroundColor Yellow
        Write-Host '     (la liviana es la que necesita la web)'
        Write-Host ''
        Write-Host '     Contaselo a Claude para ver como seguimos.'
        Write-Host '  ------------------------------------------------------------'
        Write-Host ''
        exit 9
    }
}
catch {
    # Sin internet / GitHub caido / limite de consultas: silencio absoluto.
}

exit 0
