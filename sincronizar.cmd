@echo off
title Sincronizar - Ajedrez Argentino

:: Agregar Git al PATH para esta sesion
set PATH=%PATH%;C:\Program Files\Git\cmd

cd /d "%~dp0"

echo.
echo ==========================================
echo   Sincronizar con GitHub
echo   (junta los cambios del telefono con esta PC)
echo ==========================================
echo.

git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: No se encontro Git instalado.
    echo Instalalo desde https://git-scm.com
    echo.
    pause
    exit /b
)

echo Consultando GitHub...
git fetch origin >nul 2>&1
if errorlevel 1 (
    echo No se pudo conectar con GitHub. Revisa la conexion a internet.
    echo.
    pause
    exit /b
)

:: --- Radiografia del estado ---
:: DIRTY = hay cambios sin commitear en la carpeta (archivos a medio guardar)
:: AHEAD = commits que esta PC tiene y GitHub no (cambios propios sin publicar)
:: BEHIND = commits que GitHub tiene y esta PC no (t?picamente, ediciones del telefono)
set DIRTY=0
git status --porcelain > "%TEMP%\syncchk.txt" 2>&1
for %%F in ("%TEMP%\syncchk.txt") do if not %%~zF==0 set DIRTY=1

set AHEAD=0
for /f %%i in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%i
set BEHIND=0
for /f %%i in ('git rev-list --count HEAD..origin/main 2^>nul') do set BEHIND=%%i

:: --- Caso 1: ya esta todo al dia ---
if "%BEHIND%"=="0" if "%AHEAD%"=="0" (
    echo Todo al dia. Esta PC ya tiene lo mismo que GitHub.
    echo.
    pause
    exit /b
)

:: --- Caso 2: nada del telefono para bajar, pero SI hay cambios propios sin publicar ---
if "%BEHIND%"=="0" (
    echo No hay novedades del telefono para bajar.
    echo Pero esta PC tiene %AHEAD% cambio^(s^) propio^(s^) sin publicar.
    echo Para subirlos a la web, corre:  publicar-web.cmd
    echo.
    pause
    exit /b
)

:: --- Caso 3: hay cambios sin guardar en la carpeta: no tocar nada ---
if %DIRTY%==1 (
    echo ATENCION: esta PC tiene cambios SIN GUARDAR en la carpeta:
    echo.
    git status --short
    echo.
    echo   Guarda o descarta esos cambios antes de sincronizar, para no mezclarlos
    echo   sin querer. Si son datos de la app, usa "Guardar datos en mi carpeta".
    echo.
    pause
    exit /b
)

:: --- Caso 4: solo hay novedades del telefono (esta PC no agrego nada) ---
::           Se bajan sin riesgo (avance directo, no se combina nada).
if "%AHEAD%"=="0" (
    echo Bajando las novedades del telefono...
    git merge --ff-only origin/main
    echo.
    echo ==========================================
    echo   Listo. Esta PC quedo igual a GitHub.
    echo ==========================================
    echo.
    pause
    exit /b
)

:: --- Caso 5: DIVERGENCIA (el caso del telefono) ---
::   Esta PC tiene cambios propios (%AHEAD%) y el telefono tambien commiteo (%BEHIND%).
::   Casi siempre tocan archivos distintos, asi que se COMBINAN sin perder nada.
echo Hay cambios en los dos lados:
echo   - Esta PC:   %AHEAD% cambio^(s^) sin publicar
echo   - Telefono:  %BEHIND% cambio^(s^) hecho^(s^) desde el celular
echo.
echo Los voy a COMBINAR (no se pierde nada de ningun lado).
echo.
set RESP=
set /p RESP=Combinar y publicar ahora? (S = si, Enter = cancelar):
if /I not "%RESP%"=="S" (
    echo.
    echo Cancelado. No se toco nada.
    echo.
    pause
    exit /b
)

echo.
echo Combinando...
git merge origin/main --no-edit
if errorlevel 1 (
    echo.
    echo ==========================================
    echo   Los cambios se pisan entre si (mismo dato tocado en los dos lados).
    echo   Deshago la combinacion para no dejar nada roto.
    echo ==========================================
    git merge --abort
    echo.
    echo   Nada se modifico. Pedile ayuda a Claude para resolver este caso.
    echo.
    pause
    exit /b
)

echo.
echo Combinado OK. Subiendo a la web...
git push origin HEAD:main
if errorlevel 1 (
    echo.
    echo ==========================================
    echo   Se combino bien en esta PC, pero fallo al subir.
    echo   Revisa la conexion y corre  publicar-web.cmd
    echo ==========================================
) else (
    echo.
    echo ==========================================
    echo   Listo. Todo combinado y publicado.
    echo   La web se actualiza en 1-2 min.
    echo ==========================================
)
echo.
pause
