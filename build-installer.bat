@echo off
echo 🚀 Iniciando build completo do LoL Matchmaking...
echo.

REM Limpar pastas anteriores
echo 🧹 Limpando pastas anteriores...
if exist "dist" rmdir /s /q "dist"
if exist "release" rmdir /s /q "release"
echo ✅ Pastas limpas
echo.

REM Instalar dependências do backend
echo 📦 Instalando dependências do backend...
cd src\backend
call npm install --omit=dev
if errorlevel 1 (
    echo ❌ Erro ao instalar dependências do backend
    pause
    exit /b 1
)
cd ..\..
echo ✅ Dependências do backend instaladas
echo.

REM Instalar dependências principais (incluindo electron-builder)
echo 📦 Verificando dependências principais...
call npm install
if errorlevel 1 (
    echo ❌ Erro ao instalar dependências principais
    pause
    exit /b 1
)
echo ✅ Dependências principais verificadas
echo.

REM Build do backend
echo 🔧 Compilando backend...
call npx tsc -p src\backend\tsconfig.json
if errorlevel 1 (
    echo ❌ Erro ao compilar backend
    pause
    exit /b 1
)
echo ✅ Backend compilado
echo.

REM Build do frontend
echo 🎨 Compilando frontend...
cd src\frontend
call ng build --configuration production
if errorlevel 1 (
    echo ❌ Erro ao compilar frontend
    cd ..\..
    pause
    exit /b 1
)
cd ..\..
echo ✅ Frontend compilado
echo.

REM Build do Electron
echo ⚡ Compilando Electron...
call npx tsc -p src\electron\tsconfig.json
if errorlevel 1 (
    echo ❌ Erro ao compilar Electron
    pause
    exit /b 1
)
echo ✅ Electron compilado
echo.

REM Copiar dependências do backend
echo 📁 Copiando dependências do backend...
if not exist "dist\backend" mkdir "dist\backend"
xcopy "src\backend\node_modules" "dist\backend\node_modules" /E /I /H /Y
if errorlevel 1 (
    echo ❌ Erro ao copiar dependências
    pause
    exit /b 1
)
echo ✅ Dependências copiadas
echo.

REM Copiar build do frontend
echo 🎨 Copiando build do frontend...
if not exist "dist\frontend" mkdir "dist\frontend"
if not exist "dist\frontend\dist" mkdir "dist\frontend\dist"
if not exist "dist\frontend\dist\lol-matchmaking" mkdir "dist\frontend\dist\lol-matchmaking"
xcopy "src\frontend\dist\lol-matchmaking" "dist\frontend\dist\lol-matchmaking" /E /I /H /Y
if errorlevel 1 (
    echo ❌ Erro ao copiar build do frontend
    pause
    exit /b 1
)
echo ✅ Build do frontend copiado
echo.

REM Copiar banco de dados se existir
if exist "database.sqlite" (
    echo 💾 Copiando banco de dados...
    if not exist "dist\backend\database" mkdir "dist\backend\database"
    copy "database.sqlite" "dist\backend\database\database.sqlite"
    echo ✅ Banco de dados copiado
    echo.
)

REM Gerar instalador
echo 📦 Gerando instalador Windows...
call npx electron-builder --win --publish=never
if errorlevel 1 (
    echo ❌ Erro ao gerar instalador
    pause
    exit /b 1
)

echo.
echo 🎉 Build completo! Instalador gerado em: release\
echo 📁 Arquivo: LoL Matchmaking Setup 1.0.0.exe
echo.
pause
