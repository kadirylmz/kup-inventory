@echo off
chcp 65001 >nul
title KUP INVENTORY - Yerel Sunucu Baslatici
echo ===================================================
echo   KUP INVENTORY - Kurumsal Varlik Yonetim Sistemi
echo ===================================================
echo.

if exist "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" (
    "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\18\data" status >nul 2>&1
    if errorlevel 1 (
        echo [PostgreSQL] Veritabani servisi baslatiliyor...
        "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\18\data" -l "C:\Program Files\PostgreSQL\18\data\logfile" start
        timeout /t 2 >nul
    )
)

echo [1/2] Backend API baslatiliyor (http://localhost:8000)...
start "KUP INVENTORY - Backend API" cmd /k "cd /d %~dp0backend && set PYTHONPATH=. && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Frontend Web Arayuzu baslatiliyor (http://localhost:5173)...
start "KUP INVENTORY - Frontend Web" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5173"

echo.
echo Sistem baslatildi! Tarayicinizdan http://localhost:5173 adresine gidebilirsiniz.
echo Varsayilan Yonetici: admin@kup.local  /  Sifre: ChangeMe!12345
pause
