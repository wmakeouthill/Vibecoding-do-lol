@echo off
echo =========================================
echo   LoL Matchmaking - Build Portable
echo =========================================

echo.
echo [1/6] Limpando diretorios de build...
if exist "dist" rmdir /s /q "dist"
if exist "release" rmdir /s /q "release"
if exist "src\frontend\dist" rmdir /s /q "src\frontend\dist"

echo.
echo [2/6] Instalando dependencias...
call npm install

echo.
echo [3/6] Compilando backend...
call npm run build:backend

echo.
echo [4/6] Compilando frontend...
call npm run build:frontend

echo.
echo [5/6] Compilando Electron...
call npm run build:electron

echo.
echo [6/6] Gerando executavel portable...
call npx electron-builder --config electron-builder-portable.json

echo.
echo =========================================
echo   Build concluido com sucesso!
echo =========================================
echo.
echo O executavel portable esta em: release\LoL Matchmaking-1.0.0-portable.exe
echo.
echo Este arquivo NAO precisa instalacao!
echo Basta executar e usar.
echo.
pause
