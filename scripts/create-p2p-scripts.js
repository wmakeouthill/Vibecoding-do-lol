const fs = require('fs');

console.log('📋 Criando scripts P2P para produção...');

// Criar diretório dist se não existir
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Script BAT para iniciar P2P
const startP2P = `@echo off
echo 🚀 Iniciando sistema P2P...
echo.
echo 📡 Iniciando servidor de sinalização na porta 8080...
start "Servidor P2P" cmd /k "cd backend && node signaling-server-standalone.js"
echo.
echo ⏳ Aguardando servidor inicializar...
timeout /t 3 /nobreak > nul
echo.
echo 🎮 Iniciando aplicação...
start "" "LoL Matchmaking.exe"
echo.
echo ✅ Sistema P2P iniciado!
pause`;

fs.writeFileSync('dist/start-p2p.bat', startP2P);
console.log('✅ Script start-p2p.bat criado em dist/');

// README para usuário
const readme = `# Sistema P2P - Instruções

## Executar com P2P:
1. Execute: start-p2p.bat
2. Aguarde servidor inicializar
3. Use o app normalmente

## Executar sem P2P:
1. Execute: LoL Matchmaking.exe
2. Use apenas fila central

O sistema P2P permite conexão entre computadores diferentes!

## Compartilhar com Amigos:
1. Envie todo o conteúdo da pasta para seus amigos
2. Eles executam start-p2p.bat
3. Vocês se conectarão automaticamente na rede P2P!

## Solução de Problemas:
- Se der erro de porta 8080, verifique se não há outro programa usando
- Para testar entre computadores, configure o IP no arquivo de configuração
- Certifique-se que o firewall permite conexões na porta 8080`;

fs.writeFileSync('dist/P2P-README.txt', readme);
console.log('✅ P2P-README.txt criado em dist/');
