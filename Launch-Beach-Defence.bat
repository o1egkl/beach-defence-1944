@echo off
title Pacific Defence
echo ============================================================
echo   PACIFIC DEFENCE - WINDOWS DESKTOP APP LAUNCHER
echo ============================================================
echo Starting Pacific Defence in dedicated desktop window...

:: Check for local Electron desktop application
if exist "%~dp0node_modules\.bin\electron.cmd" (
  start "" "%~dp0node_modules\.bin\electron.cmd" "%~dp0."
  exit
)

:: Check for Microsoft Edge (Standard on Windows 10 & 11)
where msedge >nul 2>nul
if %ERRORLEVEL% equ 0 (
  start "" msedge --app=https://beach-defence-1944.vercel.app/ --start-fullscreen
  exit
)

:: Check for Google Chrome
where chrome >nul 2>nul
if %ERRORLEVEL% equ 0 (
  start "" chrome --app=https://beach-defence-1944.vercel.app/ --start-fullscreen
  exit
)

:: Fallback: Open in default browser
start "" "https://beach-defence-1944.vercel.app/"
