@echo off
title Servidor Ajedrez Argentino
echo Iniciando servidor en http://localhost:8099/ ...
echo Abri esa direccion en tu navegador.
echo NO cierres esta ventana mientras uses la app.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0serve.ps1"
