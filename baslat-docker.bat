@echo off
chcp 65001 >nul
echo ===================================================
echo   KÜP INVENTORY - Docker Kurumsal Sunucu Başlatıcı
echo ===================================================
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\Docker\Docker\resources\bin

if not exist .env (
    echo [.env] dosyasi bulunamadi, .env.example dosyasindan olusturuluyor...
    copy .env.example .env >nul
    echo [.env] dosyasi basariyla olusturuldu.
    echo.
)

docker compose up -d --build
echo.
echo Sistem http://localhost ve yerel ağ IP adresiniz üzerinden yayında!
echo İlk Giriş E-posta : admin@kup.local
echo İlk Giriş Parola  : ChangeMe!12345
pause
