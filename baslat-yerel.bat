@echo off
chcp 65001 >nul
title KUP INVENTORY - Yerel Sunucu Baslatici
echo ===================================================
echo   KUP INVENTORY - Kurumsal Varlik Yonetim Sistemi
echo ===================================================
echo.
echo [1/2] Backend API baslatiliyor (http://localhost:8000)...
start "KUP INVENTORY - Backend API" cmd /k "cd /d %~dp0backend && set PYTHONPATH=. && C:\Users\kadir\.gemini\antigravity\scratch\kup-inventory\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/2] Frontend Web Arayuzu baslatiliyor (http://localhost:5173)...
start "KUP INVENTORY - Frontend Web" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5173"

echo.
echo Sistem baslatildi! Tarayicinizdan http://localhost:5173 adresine gidebilirsiniz.
echo Varsayilan Yonetici: admin@kup.local  /  Sifre: ChangeMe!12345
pause
