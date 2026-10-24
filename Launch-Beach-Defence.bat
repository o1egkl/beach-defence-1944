@echo off
title Beach Defence 1944
echo ============================================================
echo   BEACH DEFENCE 1944 - WINDOWS DESKTOP APP LAUNCHER
echo ============================================================
echo Starting Beach Defence in dedicated desktop window...

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
