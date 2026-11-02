@echo off
chcp 65001 >nul
title KUP INVENTORY - Otomatik Baslatici
color 0B

echo ================================================================
echo           KUP INVENTORY - Otomatik Baslatma Sistemi
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. PostgreSQL Kontrolu
echo [1/3] PostgreSQL veritabani servisi kontrol ediliyor...
set "PG_BIN="
if exist "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" set "PG_BIN=C:\Program Files\PostgreSQL\18\bin"
if not defined PG_BIN if exist "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" set "PG_BIN=C:\Program Files\PostgreSQL\17\bin"
if not defined PG_BIN if exist "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" set "PG_BIN=C:\Program Files\PostgreSQL\16\bin"

if defined PG_BIN (
    set "PG_DATA=%PG_BIN:\bin=%\data"
    "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" status >nul 2>&1
    if errorlevel 1 (
        echo       PostgreSQL servisi baslatiliyor...
        "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_DATA%\logfile" start >nul 2>&1
        timeout /t 2 >nul
    ) else (
        echo       PostgreSQL veritabani calisiyor.
    )
) else (
    echo       Standart PostgreSQL dizini kontrol edildi.
)
echo.

:: 2. Backend Ortami Hazirlama
echo [2/3] Backend API hazirlaniyor...
cd /d "%~dp0backend"
if not exist .venv (
    echo       Python sanal ortami olusturuluyor...
    python -m venv .venv
    echo       Gerekli kutuphaneler yukleniyor, lutfen bekleyin...
    .venv\Scripts\pip.exe install -r requirements.txt
)

echo       Backend API baslatiliyor [http://localhost:8000]...
start "KUP INVENTORY - Backend API" cmd /k "cd /d %~dp0backend && set PYTHONPATH=. && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
echo.

:: 3. Frontend Ortami Hazirlama
echo [3/3] Frontend Arayuz hazirlaniyor...
cd /d "%~dp0frontend"
if not exist node_modules (
    echo       Frontend paketleri yukleniyor, lutfen bekleyin...
    call npm install
)

echo       Frontend Web baslatiliyor [http://localhost:5173]...
start "KUP INVENTORY - Frontend Web" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5173"
echo.

:: 4. Tarayiciyi Otomatik Ac
timeout /t 3 >nul
start http://localhost:5173

echo ================================================================
echo   SISTEM BASARIYLA ACILDI VE TARAYICIDA BASLATILDI!
echo ================================================================
echo.
echo   Web Adresi      : http://localhost:5173
echo   Yonetici E-Posta: admin@kup.local
echo   Yonetici Parola : ChangeMe!12345
echo.
echo   (Bu pencereyi kapatabilirsiniz, sistem arka planda calisacaktir)
echo ================================================================
pause
