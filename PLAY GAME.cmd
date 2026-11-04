@echo off
title Viking Raiders Returns
cd /d "%~dp0game"

if not exist "node_modules" (
  echo Preparing the game for its first launch...
  node --use-system-ca "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo The game could not install its free supporting files.
    echo Please leave this window open and ask Codex for help.
    pause
    exit /b 1
  )
)

echo Starting Viking Raiders Returns...
echo Keep this window open while playing. Close it when you have finished.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5173/'"
npm run dev -- --host 127.0.0.1
