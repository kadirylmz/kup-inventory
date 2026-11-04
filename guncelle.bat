@echo off
chcp 65001 >nul
title KUP INVENTORY - Guncelleyici
color 0E

echo ================================================================
echo           KUP INVENTORY - Otomatik Guncelleme
echo ================================================================
echo.

cd /d "%~dp0"

echo [1/3] Calisan servisler kapatiliyor...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

echo [2/3] GitHub uzerinden en son kodlar aliniyor (git pull)...
git pull origin main
if errorlevel 1 (
    echo [UYARI] Normal pull basarisiz oldu veya cakisma var. Kodlar sifirlanip aliniyor...
    git fetch origin main
    git reset --hard origin/main
)
echo.

echo [3/3] Pycache ve gecici derleme dosyalari temizleniyor...
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d" >nul 2>&1
echo.

echo ================================================================
echo   GUNCELLEME BASARIYLA TAMAMLANDI!
echo   Simdi KESIN-BASLAT.bat veya baslat.bat ile sistemi baslatabilirsiniz.
echo ================================================================
echo.
pause
