@echo off
chcp 65001 >nul
echo ===================================================
echo   KÜP INVENTORY - Docker Kurumsal Sunucu Başlatıcı
echo ===================================================
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\Docker\Docker\resources\bin
docker compose up -d --build
echo.
echo Sistem http://localhost ve yerel ağ IP adresiniz üzerinden yayında!
echo İlk Giriş E-posta : admin@kup.local
echo İlk Giriş Parola  : ChangeMe!12345
pause
