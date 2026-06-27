@echo off
title Corregir nombres - Ajedrez Argentino
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0corregir-nombre.ps1"
