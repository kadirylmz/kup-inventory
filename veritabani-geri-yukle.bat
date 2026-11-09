@echo off
chcp 65001 >nul
title KUP INVENTORY - Veritabani Geri Yukleyici
color 0C

echo ================================================================
echo    KUP INVENTORY - VERİTABANI YEDEĞİNİ GERİ YÜKLEME
echo ================================================================
echo.
echo [DIKKAT] Bu islem mevcut veritabanindaki verileri yedek dosyasindaki
echo          (kup_inventory_backup.sql) veriler ile esitleyecektir.
echo.
pause

cd /d "%~dp0"

if not exist "kup_inventory_backup.sql" (
    echo [HATA] kup_inventory_backup.sql yedek dosyasi bulunamadi!
    pause
    exit /b 1
)

set "PG_PSQL="
if exist "C:\Program Files\PostgreSQL\18\bin\psql.exe" set "PG_PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
if not defined PG_PSQL if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set "PG_PSQL=C:\Program Files\PostgreSQL\17\bin\psql.exe"
if not defined PG_PSQL if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set "PG_PSQL=C:\Program Files\PostgreSQL\16\bin\psql.exe"

if not defined PG_PSQL (
    echo [HATA] psql.exe bulunamadi!
    pause
    exit /b 1
)

set PGPASSWORD=123456
echo Veritabani geri yukleniyor, lutfen bekleyin...
"%PG_PSQL%" -h localhost -p 5432 -U postgres -d kup_inventory -f "kup_inventory_backup.sql"

echo.
echo ================================================================
echo   VERİTABANI BAŞARIYLA GERİ YÜKLENDİ!
echo ================================================================
pause
