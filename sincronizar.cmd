@echo off
title Sincronizar - Ajedrez Argentino

:: Agregar Git al PATH para esta sesion
set PATH=%PATH%;C:\Program Files\Git\cmd

cd /d "%~dp0"

echo.
echo ==========================================
echo   Sincronizar con GitHub
echo   (deja ESTA PC igual a lo publicado)
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

:: Cambios locales sin guardar?
set DIRTY=0
git status --porcelain > "%TEMP%\syncchk.txt" 2>&1
for %%F in ("%TEMP%\syncchk.txt") do if not %%~zF==0 set DIRTY=1

:: Commits locales sin publicar?
set AHEAD=0
for /f %%i in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%i

if %DIRTY%==1 goto haylocal
if not "%AHEAD%"=="0" goto haylocal

:: Todo limpio: traer lo ultimo de GitHub (sin riesgo de pisar nada propio)
echo Bajando lo ultimo de GitHub...
git merge --ff-only origin/main
echo.
echo ==========================================
echo   Listo. Esta PC quedo igual a GitHub.
echo ==========================================
echo.
pause
exit /b

:haylocal
echo.
echo ATENCION: esta PC tiene cambios propios que todavia NO estan en GitHub:
echo.
git status --short
echo.
echo   - Si esos cambios los queres CONSERVAR y publicar,
echo     cerra esta ventana y corre primero  publicar-web.cmd
echo.
echo   - Si NO te importan y queres que esta PC quede EXACTAMENTE
echo     igual a GitHub (se PIERDEN esos cambios locales),
echo     escribi:  IGUALAR
echo.
set RESP=
set /p RESP=Que hago? (Enter = cancelar, no toca nada):
if /I "%RESP%"=="IGUALAR" (
    git reset --hard origin/main
    echo.
    echo Listo. Esta PC quedo EXACTAMENTE igual a GitHub.
) else (
    echo.
    echo Cancelado. No se toco nada.
)
echo.
pause
