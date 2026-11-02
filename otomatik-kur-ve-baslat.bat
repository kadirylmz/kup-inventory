@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title KUP INVENTORY - Otomatik Kurulum ve Baslatici
color 0A

echo ================================================================
echo      KUP INVENTORY - Tam Otomatik Kurulum ve Baslatici
echo ================================================================
echo.

cd /d "%~dp0"

:: ------------------------------------------------------------------
:: 1. .env Dosyasi Kontrolu
:: ------------------------------------------------------------------
echo [1/5] Ayar dosyalari kontrol ediliyor...
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo       .env dosyasi olusturuldu.
    )
)

if not exist backend\.env (
    if exist .env (
        copy .env backend\.env >nul
        echo       backend\.env dosyasi senkronize edildi.
    )
)
echo       Ayar dosyalari hazir.
echo.

:: ------------------------------------------------------------------
:: 2. PostgreSQL Servis Kontrolu ve Baslatma
:: ------------------------------------------------------------------
echo [2/5] PostgreSQL veritabani kontrol ediliyor...
set "PG_DIR="
if exist "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" set "PG_DIR=C:\Program Files\PostgreSQL\18"
if not defined PG_DIR if exist "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" set "PG_DIR=C:\Program Files\PostgreSQL\17"
if not defined PG_DIR if exist "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" set "PG_DIR=C:\Program Files\PostgreSQL\16"

if defined PG_DIR (
    set "PG_BIN=!PG_DIR!\bin"
    set "PG_DATA=!PG_DIR!\data"
    
    if not exist "!PG_DATA!\PG_VERSION" (
        echo       Ilk kez veritabani kumesi olusturuluyor [UTF-8]...
        "!PG_BIN!\initdb.exe" -D "!PG_DATA!" -U postgres -E UTF8 --locale=C -A scram-sha-256 >nul 2>&1
    )
    
    "!PG_BIN!\pg_ctl.exe" -D "!PG_DATA!" status >nul 2>&1
    if errorlevel 1 (
        echo       PostgreSQL sunucusu baslatiliyor...
        "!PG_BIN!\pg_ctl.exe" -D "!PG_DATA!" -l "!PG_DATA!\logfile" start >nul 2>&1
        timeout /t 2 >nul
    ) else (
        echo       PostgreSQL zaten calisiyor.
    )

    set PGPASSWORD=123456
    "!PG_BIN!\psql.exe" -h 127.0.0.1 -U postgres -lqt 2>nul | findstr /i "kup_inventory" >nul
    if errorlevel 1 (
        echo       kup_inventory veritabani olusturuluyor...
        "!PG_BIN!\createdb.exe" -h 127.0.0.1 -U postgres kup_inventory >nul 2>&1
        echo       kup_inventory veritabani basariyla olusturuldu.
    ) else (
        echo       kup_inventory veritabani hazir.
    )
) else (
    echo       Standart PostgreSQL dizini kontrol edildi.
)
echo.

:: ------------------------------------------------------------------
:: 3. Backend Ortami ve Bagimliliklari Kontrolu
:: ------------------------------------------------------------------
echo [3/5] Backend Python ortami kontrol ediliyor...
if not exist backend\.venv (
    echo       Python sanal ortami olusturuluyor, lutfen bekleyin...
    python -m venv backend\.venv
)

if not exist backend\.venv\Lib\site-packages\fastapi (
    echo       Backend paketleri yukleniyor...
    backend\.venv\Scripts\pip.exe install -r backend\requirements.txt >nul 2>&1
    backend\.venv\Scripts\pip.exe install uvicorn fastapi sqlalchemy alembic pydantic pydantic-settings email-validator argon2-cffi PyJWT cryptography python-multipart httpx qrcode pillow >nul 2>&1
    echo       Backend paketleri basariyla kuruldu.
) else (
    echo       Backend sanal ortami ve paketleri hazir.
)
echo.

:: ------------------------------------------------------------------
:: 4. Frontend Paketleri Kontrolu
:: ------------------------------------------------------------------
echo [4/5] Frontend web paketleri kontrol ediliyor...
if not exist frontend\node_modules (
    echo       Frontend paketleri yukleniyor, lutfen bekleyin...
    cd frontend
    call npm install >nul 2>&1
    cd ..
    echo       Frontend paketleri yuklendi.
) else (
    echo       Frontend paketleri hazir.
)
echo.

:: ------------------------------------------------------------------
:: 5. Servisleri Baslatma
:: ------------------------------------------------------------------
echo [5/5] Sistem servisleri baslatiliyor...
echo.
echo       -> Backend API baslatiliyor [http://localhost:8000]...
start "KUP INVENTORY - Backend API" cmd /k "cd /d %~dp0backend && set PYTHONPATH=. && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo       -> Frontend Web baslatiliyor [http://localhost:5173]...
start "KUP INVENTORY - Frontend Web" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5173"

echo.
echo ================================================================
echo   TEBRIKLER! KUP INVENTORY BASARIYLA CALISTIRILDI.
echo ================================================================
echo.
echo   Tarayici Adresi     : http://localhost:5173
echo   API Dokumantasyonu  : http://localhost:8000/api/docs
echo   Yonetici E-Posta    : admin@kup.local
echo   Yonetici Parola     : ChangeMe!12345
echo.
echo   (Bu pencereyi kapatabilirsiniz, servisler arka planda calisacaktir)
echo ================================================================
echo.
pause
