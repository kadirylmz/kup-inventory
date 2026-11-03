@echo off
chcp 65001 >nul
title KUP INVENTORY - Kesin Baslatici
color 0A

echo ================================================================
echo           KUP INVENTORY - KESIN COZUM BASLATICI
echo ================================================================
echo.

:: Dogrudan bu dosyanin oldugu klasore git
cd /d "%~dp0"
echo Calisma Dizini: %CD%
echo.

:: 1. Postgres Kontrolu
echo [1/3] PostgreSQL kontrol ediliyor...
set "PG_DIR=C:\Program Files\PostgreSQL\18"
if exist "%PG_DIR%\bin\pg_ctl.exe" (
    if exist "%PG_DIR%\data\postmaster.pid" (
        "%PG_DIR%\bin\pg_ctl.exe" -D "%PG_DIR%\data" status >nul 2>&1
        if errorlevel 1 (
            echo       Kilitli postmaster.pid temizleniyor...
            del /f /q "%PG_DIR%\data\postmaster.pid" >nul 2>&1
        )
    )
    "%PG_DIR%\bin\pg_ctl.exe" -D "%PG_DIR%\data" status >nul 2>&1
    if errorlevel 1 (
        echo       PostgreSQL sunucusu baslatiliyor...
        "%PG_DIR%\bin\pg_ctl.exe" -D "%PG_DIR%\data" start >nul 2>&1
        timeout /t 2 >nul
    ) else (
        echo       PostgreSQL veritabani zaten calisiyor.
    )
)
echo.

:: 2. Backend Kontrolu ve Baslatma
echo [2/3] Backend API baslatiliyor...
cd /d "%~dp0backend"

set "PY_EXE="
if exist "%~dp0backend\.venv\Scripts\python.exe" set "PY_EXE=%~dp0backend\.venv\Scripts\python.exe"
if not defined PY_EXE if exist "%~dp0backend\.venv2\Scripts\python.exe" set "PY_EXE=%~dp0backend\.venv2\Scripts\python.exe"

if defined PY_EXE (
    echo       Python bulundu: %PY_EXE%
    start "KUP INVENTORY - Backend API" cmd /k "cd /d "%~dp0backend" && set PYTHONPATH=. && "%PY_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
) else (
    echo [HATA] Backend Python ortami bulunamadi!
)
echo.

:: 3. Frontend Baslatma
echo [3/3] Frontend Web baslatiliyor...
cd /d "%~dp0frontend"
start "KUP INVENTORY - Frontend Web" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --host 0.0.0.0 --port 5173"
echo.

echo ================================================================
echo   SISTEM BASLATILDI!
echo   Tarayicinizdan http://localhost:5173 adresini acabilirsiniz.
echo ================================================================
timeout /t 3 >nul
start http://localhost:5173
pause
