@echo off
chcp 65001 >nul
title KUP INVENTORY - Veritabani Yedekle ve GitHub'a Yukle
color 0A

echo ================================================================
echo    KUP INVENTORY - VERİTABANI YEDEKLEME VE GITHUB'A YÜKLEME
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. PostgreSQL pg_dump Aracını Bul
set "PG_DUMP="
if exist "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" set "PG_DUMP=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if not defined PG_DUMP if exist "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" set "PG_DUMP=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
if not defined PG_DUMP if exist "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" set "PG_DUMP=C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"

if not defined PG_DUMP (
    echo [HATA] pg_dump.exe bulunamadi! Lutfen PostgreSQL kurulum dizinini kontrol edin.
    pause
    exit /b 1
)

echo [1/3] PostgreSQL veritabani tam yedegi aliniyor...
set PGPASSWORD=123456

:: Veritabanı yedeğini oluştur
"%PG_DUMP%" -h localhost -p 5432 -U postgres -d kup_inventory -F p -f "kup_inventory_backup.sql"
if errorlevel 1 (
    echo [UYARI] localhost uzerinden baglanilamadi. Varsayilan ayarlarla deneniyor...
    "%PG_DUMP%" -U postgres -d kup_inventory -F p -f "kup_inventory_backup.sql"
)

if not exist "kup_inventory_backup.sql" (
    echo [HATA] Veritabani yedek dosyasi olusturulamadi!
    pause
    exit /b 1
)
echo       Veritabani basariyla yedeklendi: kup_inventory_backup.sql
echo.

:: 2. Git Durumu Kontrolu ve Commit
echo [2/3] Degisiklikler ve veritabani yedegi paketleniyor...
git add .
git commit -m "backup: tam veritabani yedegi ve guncel sistem surumu [%DATE% %TIME%]"
echo.

:: 3. GitHub'a Push
echo [3/3] GitHub sunucusuna yukleniyor (git push)...
git push origin main
if errorlevel 1 (
    echo.
    echo [HATA] GitHub'a yukleme basarisiz oldu. Internet baglantinizi veya yetkilerinizi kontrol edin.
    pause
    exit /b 1
)

echo.
echo ================================================================
echo   TEBRİKLER! TÜM VERİLER VE PROGRAM GITHUB'A BAŞARIYLA YÜKLENDİ!
echo ================================================================
echo.
echo   Yedek Dosyasi : kup_inventory_backup.sql
echo   Hedef Dal     : origin/main
echo.
pause
