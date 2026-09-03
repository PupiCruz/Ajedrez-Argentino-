@echo off
title Publicar web - Ajedrez Argentino

:: Agregar Git al PATH para esta sesion
set PATH=%PATH%;C:\Program Files\Git\cmd

cd /d "%~dp0"

echo.
echo ==========================================
echo   Publicar web - Ajedrez Argentino
echo   (baja lo del telefono + sube lo tuyo, todo junto)
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

:: ------------------------------------------------------------------
:: 1) Si hay archivos sin guardar (datos nuevos, etc.), commitearlos.
:: ------------------------------------------------------------------
git status --short > "%TEMP%\gitstatus.txt" 2>&1
set /a size=0
for %%F in ("%TEMP%\gitstatus.txt") do set /a size=%%~zF
if %size%==0 goto sync

echo Archivos con cambios en esta PC:
git status --short
echo.

set MSG=
set /p MSG=Descripcion del cambio (Enter = "Actualizar datos"):
if "%MSG%"=="" set MSG=Actualizar datos

git add .

git commit -m "%MSG%"
echo.

:sync
:: ------------------------------------------------------------------
:: 2) Consultar GitHub (trae, si hay, lo que se edito desde el telefono)
:: ------------------------------------------------------------------
echo Consultando GitHub...
git fetch origin >nul 2>&1
if errorlevel 1 (
    echo No se pudo conectar con GitHub. Revisa la conexion a internet.
    echo.
    pause
    exit /b
)

:: AHEAD  = commits que esta PC tiene y GitHub no (cambios propios sin publicar)
:: BEHIND = commits que GitHub tiene y esta PC no (tipicamente, ediciones del telefono)
set AHEAD=0
for /f %%i in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%i
set BEHIND=0
for /f %%i in ('git rev-list --count HEAD..origin/main 2^>nul') do set BEHIND=%%i

:: --- Caso: ya esta todo al dia (nada nuevo por ningun lado) ---
if "%BEHIND%"=="0" if "%AHEAD%"=="0" (
    echo No hay cambios para publicar. La web ya esta al dia.
    echo.
    pause
    exit /b
)

:: ------------------------------------------------------------------
:: 3) Si el telefono metio cambios, bajarlos y combinarlos primero.
:: ------------------------------------------------------------------
if not "%BEHIND%"=="0" (
    if "%AHEAD%"=="0" (
        echo Bajando novedades del telefono...
        git merge --ff-only origin/main
    ) else (
        echo Hay cambios en los dos lados:
        echo   - Esta PC:   %AHEAD% cambio^(s^)
        echo   - Telefono:  %BEHIND% cambio^(s^) desde el celular
        echo   Los combino ^(no se pierde nada de ningun lado^)...
        echo.
        git merge origin/main --no-edit
        if errorlevel 1 (
            echo.
            echo ==========================================
            echo   Los cambios se pisan entre si ^(mismo dato tocado en los dos lados^).
            echo   Deshago la combinacion para no dejar nada roto.
            echo ==========================================
            git merge --abort
            echo.
            echo   Nada se modifico. Pedile ayuda a Claude para resolver este caso.
            echo.
            pause
            exit /b
        )
    )
    echo.
)

:: ------------------------------------------------------------------
:: 4) Publicar: subir todo lo que todavia no esta en la web.
:: ------------------------------------------------------------------
set AHEAD=0
for /f %%i in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%i

if "%AHEAD%"=="0" (
    echo ==========================================
    echo   Listo! Esta PC quedo igual a GitHub.
    echo   ^(Solo se bajaron cambios del telefono, no habia nada tuyo para subir.^)
    echo ==========================================
    echo.
    pause
    exit /b
)

echo Subiendo %AHEAD% cambio^(s^) a la web...
echo.
git push origin HEAD:main

if errorlevel 1 (
    echo.
    echo ==========================================
    echo   ERROR al subir. Revisa la conexion y volve a correr este comando.
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
