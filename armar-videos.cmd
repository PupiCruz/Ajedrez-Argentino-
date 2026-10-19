@echo off
rem Armador de videos "Un dia como hoy": dejalo abierto mientras tengas la PC prendida.
rem Cuando tocas el boton "Video" de /hoy en el bot, esta ventana arma el video y el bot te lo manda por Telegram.
title Armador de videos - ChessArgentino
cd /d "%~dp0herramientas\video-hoy"
where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js. Instalalo desde https://nodejs.org y volve a abrir este archivo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Primera vez: instalando lo necesario...
  call npm install
)
node armador.mjs
echo.
echo El armador se detuvo.
pause
