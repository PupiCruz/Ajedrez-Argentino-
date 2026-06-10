@echo off
chcp 65001 >nul
title Publicar web — Ajedrez Argentino

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Publicar web — Ajedrez Argentino       ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Esto sube los archivos a GitHub y
echo  Netlify actualiza la web automaticamente.
echo.

cd /d "%~dp0"

:: Verificar que hay archivos para subir
git status --short >nul 2>&1
if errorlevel 1 (
    echo  ERROR: No se encontro Git o no es un repositorio.
    pause
    exit /b
)

git status --short > "%TEMP%\gitstatus.txt" 2>&1
for /f %%i in ("%TEMP%\gitstatus.txt") do set size=%%~zi
if "%size%"=="0" (
    echo  No hay cambios para publicar.
    echo  La web ya esta al dia.
    echo.
    pause
    exit /b
)

echo  Archivos con cambios:
git status --short
echo.

set /p MSG= Descripcion del cambio (Enter para usar "Actualizar datos"):
if "%MSG%"=="" set MSG=Actualizar datos

echo.
echo  Subiendo a GitHub...
echo.

git add .
git commit -m "%MSG%"
git push origin HEAD:main

if errorlevel 1 (
    echo.
    echo  ╔══════════════════════════════════════════╗
    echo  ║   ERROR al subir. Revisa la conexion.    ║
    echo  ╚══════════════════════════════════════════╝
) else (
    echo.
    echo  ╔══════════════════════════════════════════╗
    echo  ║   Listo! La web se esta actualizando.    ║
    echo  ║   En 1-2 minutos estara disponible en:   ║
    echo  ║   https://chessargentino.netlify.app     ║
    echo  ╚══════════════════════════════════════════╝
)

echo.
pause
