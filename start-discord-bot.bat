@echo off
echo 🎮 Iniciando Discord Bot para LoL Matchmaking...
echo.
echo 📋 Pré-requisitos:
echo   1. Bot criado no Discord Developer Portal
echo   2. Token configurado no discord-bot.js
echo   3. Bot convidado para o servidor
echo   4. Canal #lol-matchmaking criado
echo.
echo ⚠️  Editando discord-bot.js para adicionar seu token...
echo.

REM Verificar se o arquivo existe
if not exist "discord-bot.js" (
    echo ❌ Erro: discord-bot.js não encontrado!
    echo    Execute este script na pasta do projeto.
    pause
    exit /b 1
)

REM Verificar se o token está configurado
findstr /C:"SEU_BOT_TOKEN_AQUI" discord-bot.js >nul
if %errorlevel%==0 (
    echo ❌ ERRO: Token do bot não configurado!
    echo.
    echo 🔧 CONFIGURE PRIMEIRO:
    echo    1. Vá para: https://discord.com/developers/applications
    echo    2. Selecione seu bot
    echo    3. Vá para "Bot" e copie o Token
    echo    4. Edite discord-bot.js e substitua "SEU_BOT_TOKEN_AQUI" pelo seu token
    echo.
    pause
    exit /b 1
)

echo ✅ Token configurado! Iniciando bot...
echo.

REM Instalar dependências se necessário
if not exist "node_modules\discord.js" (
    echo 📦 Instalando dependências...
    npm install discord.js ws
    echo.
)

REM Iniciar o bot
echo 🚀 Iniciando Discord Bot...
echo.
node discord-bot.js

pause
