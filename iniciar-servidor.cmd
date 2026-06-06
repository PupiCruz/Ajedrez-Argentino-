@echo off
title Servidor Ajedrez Argentino
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
