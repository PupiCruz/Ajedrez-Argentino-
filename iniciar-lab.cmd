@echo off
title Servidor LAB (pruebas) - Ajedrez Argentino
echo ===============================================
echo    Ajedrez Argentino - LABORATORIO (pruebas)
echo ===============================================
echo.
echo Esta es la web de PRUEBAS (_lab.html). NO es la web real.
echo Se va a abrir SOLA en tu navegador.
echo (si no se abre, entra a  http://localhost:8098/_lab.html )
echo.
echo Podes tener abierta esta y la web real al mismo tiempo.
echo NO cierres esta ventana mientras la uses. Cerrala para apagar el lab.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0serve-lab.ps1"
