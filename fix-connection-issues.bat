@echo off
title LoL Matchmaking - Corretor de Problemas de Conexao
echo ===============================================
echo LOL MATCHMAKING - CORRETOR DE PROBLEMAS
echo ===============================================
echo.

echo [1/5] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERRO: Node.js nao encontrado!
    echo.
    echo 💡 SOLUCAO:
    echo    1. Baixe Node.js LTS de: https://nodejs.org/
    echo    2. Execute o instalador
    echo    3. Reinicie este programa
    echo.
    echo ⚠️  IMPORTANTE: Escolha a versao LTS (recomendada)
    echo.
    pause
    start https://nodejs.org/
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js encontrado: %NODE_VERSION%

echo.
echo [2/5] Verificando porta 3000...
netstat -an | findstr :3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  Porta 3000 em uso - tentando liberar...
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 2 >nul
    netstat -an | findstr :3000 >nul 2>&1
    if %errorlevel% equ 0 (
        echo ❌ Nao foi possivel liberar a porta 3000
        echo 💡 Reinicie o computador ou finalize processos manualmente
    ) else (
        echo ✅ Porta 3000 liberada
    )
) else (
    echo ✅ Porta 3000 livre
)

echo.
echo [3/5] Verificando arquivos da aplicacao...
if not exist "dist\backend\server.js" (
    echo ❌ Backend nao encontrado!
    echo 💡 Execute: npm run build:complete
    pause
    exit /b 1
)
echo ✅ Backend encontrado

if not exist "dist\backend\node_modules" (
    echo ❌ Dependencias do backend nao encontradas!
    echo 💡 Execute: npm run build:complete
    pause
    exit /b 1
)
echo ✅ Dependencias encontradas

echo.
echo [4/5] Testando inicializacao do backend...
echo 🔄 Iniciando backend em modo teste...
cd /d "%~dp0\dist\backend"
start /B node server.js
cd /d "%~dp0"

echo ⏳ Aguardando 10 segundos...
timeout /t 10 >nul

echo 🔍 Testando conectividade...
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Backend funcionando corretamente!
    echo 🛑 Finalizando backend de teste...
    taskkill /F /IM node.exe >nul 2>&1
) else (
    echo ❌ Backend nao esta respondendo
    echo.
    echo 💡 POSSIVEIS CAUSAS:
    echo    - Firewall bloqueando Node.js
    echo    - Antivirus bloqueando execucao
    echo    - Dependencias faltando
    echo    - Permissoes insuficientes
    echo.
    echo 🔧 SOLUCOES:
    echo    1. Execute como Administrador
    echo    2. Adicione excecao no firewall para Node.js
    echo    3. Temporariamente desabilite o antivirus
    echo    4. Execute: npm run build:complete
    echo.
    taskkill /F /IM node.exe >nul 2>&1
)

echo.
echo [5/5] Verificando Electron...
if not exist "dist\electron\main.js" (
    echo ❌ Electron nao encontrado!
    echo 💡 Execute: npm run build:complete
    pause
    exit /b 1
)
echo ✅ Electron encontrado

echo.
echo ===============================================
echo RELATORIO FINAL
echo ===============================================

echo ✅ Todas as verificacoes concluidas!
echo.
echo 🎮 Para iniciar a aplicacao:
echo    - Execute o arquivo .exe na pasta release/
echo    - OU execute: npm run electron:prod
echo.
echo 🔧 Se ainda houver problemas:
echo    1. Execute como Administrador
echo    2. Execute: npm run diagnose (para diagnostico detalhado)
echo    3. Verifique o arquivo error-report.txt se houver
echo.
echo 📧 Para suporte, inclua o arquivo error-report.txt

pause
