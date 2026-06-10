@echo off
title Publicar web - Ajedrez Argentino

:: Agregar Git al PATH para esta sesion
set PATH=%PATH%;C:\Program Files\Git\cmd

cd /d "%~dp0"

echo.
echo ==========================================
echo   Publicar web - Ajedrez Argentino
echo ==========================================
echo.

:: Verificar que git funciona
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: No se encontro Git instalado.
    echo Instala Git desde https://git-scm.com
    echo.
    pause
    exit /b
)

:: Ver si hay cambios
git status --short > "%TEMP%\gitstatus.txt" 2>&1
set /a size=0
for %%F in ("%TEMP%\gitstatus.txt") do set /a size=%%~zF
if %size%==0 (
    echo No hay cambios para publicar.
    echo La web ya esta al dia.
    echo.
    pause
    exit /b
)

echo Archivos con cambios:
git status --short
echo.

set MSG=
set /p MSG=Descripcion del cambio (Enter = "Actualizar datos"):
if "%MSG%"=="" set MSG=Actualizar datos

echo.
echo Subiendo a GitHub...
echo.

git add .
git commit -m "%MSG%"
git push origin HEAD:main

if errorlevel 1 (
    echo.
    echo ==========================================
    echo   ERROR al subir. Revisa la conexion.
    echo ==========================================
) else (
    echo.
    echo ==========================================
    echo   Listo! La web se esta actualizando.
    echo   En 1-2 min estara disponible en:
    echo   https://chessargentino.netlify.app
    echo ==========================================
)

echo.
pause
