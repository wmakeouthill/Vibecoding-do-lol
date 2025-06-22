@echo off
echo =========================================
echo   LoL Matchmaking - Teste Executavel
echo =========================================

echo.
echo Verificando se o executavel existe...
if exist "release\LoL Matchmaking-1.0.0-portable.exe" (
    echo ✅ Executavel encontrado!
    echo.
    echo Tamanho do arquivo:
    dir "release\LoL Matchmaking-1.0.0-portable.exe" | findstr "LoL Matchmaking"
    echo.
    echo Deseja executar o aplicativo? (S/N)
    set /p choice=
    if /i "%choice%"=="S" (
        echo.
        echo 🚀 Iniciando aplicativo...
        start "" "release\LoL Matchmaking-1.0.0-portable.exe"
    )
) else (
    echo ❌ Executavel nao encontrado!
    echo Execute primeiro: build-portable.bat
)

echo.
pause
