# ============================================================================
#  Chequeo silencioso: Lichess ya deja buscar rival AL AZAR en blitz?
#  (Hecho el 02/10/2026. Hasta hoy la Board API solo deja rapida, clasica y
#  correspondencia al azar; el blitz solo en desafios directos.)
# ============================================================================
#  Lo llama iniciar-servidor.cmd cada vez que se abre la app, igual que
#  chequear-motor.ps1. El dia que Lichess cambie la regla, avisa solo.
#
#  QUE MIRA: el codigo de Lichess en GitHub (lichess-org/lila), que es lo que
#  de verdad decide; la documentacion puede quedar vieja. Dos renglones:
#
#   1) modules/core/src/main/game/misc.scala
#        def isBoardCompatible(clock: Clock.Config): Boolean = Speed(clock) >= Speed.Rapid
#      Es EL corte. Si dice Speed.Blitz -> ya se puede blitz al azar.
#
#   2) app/controllers/Setup.scala, en boardApiHook:
#        ctx.isMobileOauth || ctx.isTakex3 || (ctx.isAnon && HTTPRequest.isLichessMobile(ctx.req))
#      Son las excepciones: la app oficial de Lichess y un cliente firmado
#      ("takex3"). Si se suma algo, puede que nos alcance a nosotros.
#
#  Si cualquiera de los dos cambia, avisa y hay que pedirle a Claude que lo
#  mire (puede ser solo una reorganizacion del codigo). Ojo: que este en
#  GitHub no quiere decir que ya este en lichess.org; suelen tardar unos dias.
#
#  A PRUEBA DE FALLOS: sin internet o con GitHub caido no dice nada y la app
#  abre igual. Usa raw.githubusercontent.com (sin limite de consultas).
#
#  Codigos de salida:  0 = nada nuevo (o no se pudo consultar)   9 = cambio!
# ============================================================================

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $base = 'https://raw.githubusercontent.com/lichess-org/lila/master/'
    $hdr  = @{ 'User-Agent' = 'ajedrez-argentino-chequeo-blitz' }

    $misc  = (Invoke-WebRequest -Uri ($base + 'modules/core/src/main/game/misc.scala') -Headers $hdr -TimeoutSec 3 -UseBasicParsing).Content
    $setup = (Invoke-WebRequest -Uri ($base + 'app/controllers/Setup.scala') -Headers $hdr -TimeoutSec 3 -UseBasicParsing).Content

    # Archivo vacio o raro (GitHub devolvio otra cosa): mejor callarse.
    if (-not $misc -or -not $setup -or $misc.Length -lt 200 -or $setup.Length -lt 200) { exit 0 }

    $aviso = @()

    # 1) El corte de velocidad.
    if ($misc -match 'def\s+isBoardCompatible\s*\(\s*clock[^)]*\)\s*:\s*Boolean\s*=\s*Speed\(clock\)\s*>=\s*Speed\.(\w+)') {
        if ($Matches[1] -ne 'Rapid') {
            $aviso += "El corte de la Board API ahora es Speed.$($Matches[1]) (antes Rapid)."
        }
    } else {
        $aviso += 'Cambio el renglon que decide el ritmo minimo (isBoardCompatible).'
    }

    # 2) Las excepciones de boardApiHook (sacando espacios y saltos de linea).
    $plano = $setup -replace '\s+', ''
    $esperado = '.boardApiHook:ctx.isMobileOauth||ctx.isTakex3||(ctx.isAnon&&HTTPRequest.isLichessMobile(ctx.req)).bindFromRequest()'
    if (-not $plano.Contains($esperado)) {
        $aviso += 'Cambiaron las excepciones de quien puede jugar rapido (boardApiHook).'
    }

    if ($aviso.Count -gt 0) {
        Write-Host ''
        Write-Host '  ============================================================'
        Write-Host '     LICHESS CAMBIO LA REGLA DEL BLITZ EN LA BOARD API' -ForegroundColor Yellow
        Write-Host '  ============================================================'
        Write-Host ''
        foreach ($a in $aviso) { Write-Host "     - $a" }
        Write-Host ''
        Write-Host '     Puede ser que ya se pueda buscar rival al azar en blitz.'
        Write-Host '     Decile a Claude:  "cambio lo del blitz en Lichess, fijate"' -ForegroundColor Yellow
        Write-Host ''
        Write-Host '  ============================================================'
        Write-Host ''
        exit 9
    }
}
catch {
    # Sin internet / GitHub caido: silencio absoluto.
}

exit 0
