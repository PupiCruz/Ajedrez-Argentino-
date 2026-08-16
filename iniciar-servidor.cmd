@echo off
title Servidor Ajedrez Argentino

:: Traer los cambios del telefono ANTES de abrir la app, para que aparezca el
:: cartel de "adoptar cambios" con lo ultimo. Aca SOLO se baja (nunca sube ni
:: commitea: eso es al final, con publicar-web.cmd). Es silencioso y a prueba de
:: fallos: si no hay internet o los cambios no se pueden combinar solos, no se
:: toca nada y la app se abre igual.
set PATH=%PATH%;C:\Program Files\Git\cmd
cd /d "%~dp0"
git --version >nul 2>&1 && (
    echo Trayendo cambios del telefono, si hay...
    git fetch origin >nul 2>&1 && git merge --ff-only origin/main >nul 2>&1
)

echo ===============================================
echo    Ajedrez Argentino - servidor local
echo ===============================================
echo.
echo La app se va a abrir SOLA en tu navegador.
echo (si no se abre, entra a  http://localhost:8099/ )
echo.
echo NO cierres esta ventana mientras uses la app.
echo Cuando termines, cerra esta ventana para apagar el servidor.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0serve.ps1"
