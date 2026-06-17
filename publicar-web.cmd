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

:: 1) Si hay archivos sin guardar (datos nuevos, etc.), commitearlos.
git status --short > "%TEMP%\gitstatus.txt" 2>&1
set /a size=0
for %%F in ("%TEMP%\gitstatus.txt") do set /a size=%%~zF
if %size%==0 goto checkpush

echo Archivos con cambios:
git status --short
echo.

set MSG=
set /p MSG=Descripcion del cambio (Enter = "Actualizar datos"):
if "%MSG%"=="" set MSG=Actualizar datos

git add .
git commit -m "%MSG%"

:checkpush
:: 2) Hay commits locales que todavia NO estan en la web? (aunque no haya archivos sin guardar)
echo.
set AHEAD=0
for /f %%i in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%i
if "%AHEAD%"=="0" (
    echo No hay cambios para publicar. La web ya esta al dia.
    echo.
    pause
    exit /b
)

echo Hay %AHEAD% cambio(s) para subir a la web.
echo Subiendo a GitHub...
echo.

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
    echo   https://chessargentino.pages.dev
    echo ==========================================
)

echo.
pause
