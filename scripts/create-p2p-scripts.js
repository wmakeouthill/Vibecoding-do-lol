const fs = require('fs');

console.log('📋 Criando scripts P2P para produção...');

// Criar diretório dist se não existir
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Script BAT para iniciar (apenas por conveniência, não necessário)
const startP2P = `@echo off
echo 🚀 Iniciando LoL Matchmaking...
echo.
echo ✨ TUDO AUTOMÁTICO: P2P + Backend + Frontend integrados!
echo.
echo 🎮 Iniciando aplicação...
start "" "LoL Matchmaking.exe"
echo.
echo ✅ Aplicação iniciada com P2P automático!
echo.
echo 💡 O P2P é iniciado automaticamente quando você abre o app:
echo    1️⃣ Servidor P2P (porta 8080) - 2 segundos
echo    2️⃣ Backend principal (porta 3000) - 3 segundos  
echo    3️⃣ Interface gráfica
echo.
echo 🌐 Status P2P visível na interface do app!
echo.
pause`;

// Script BAT alternativo (funciona igual, tudo é automático)
const startNormal = `@echo off
echo 🎮 Iniciando LoL Matchmaking...
echo.
echo ✨ Sistema P2P totalmente automático!
echo.
start "" "LoL Matchmaking.exe"
echo.
echo ✅ Aplicação iniciada!
echo.
echo 💡 P2P, Backend e Frontend iniciam automaticamente!`;

fs.writeFileSync('dist/start-p2p.bat', startP2P);
fs.writeFileSync('dist/start-normal.bat', startNormal);
console.log('✅ Script start-p2p.bat criado em dist/');
console.log('✅ Script start-normal.bat criado em dist/');

// README para usuário
const readme = `# LoL Matchmaking - Sistema P2P Automático

## 🚀 COMO USAR:

### ⭐ SUPER SIMPLES - Apenas clique no executável:
1. **Execute: LoL Matchmaking.exe** 
2. **PRONTO!** Tudo funciona automaticamente:
   - ✅ P2P inicia automaticamente (porta 8080)
   - ✅ Backend inicia automaticamente (porta 3000)  
   - ✅ Interface abre automaticamente
3. **RESULTADO:** Sistema completo funcionando em 5-8 segundos!

### 📱 Scripts BAT (opcionais):
- **start-p2p.bat**: Mesma coisa, mas com mensagens no console
- **start-normal.bat**: Mesma coisa também (tudo é automático agora!)

---

## 🌐 CONECTAR COM AMIGOS:

### Para jogar com amigos em outros computadores:
1. **Compartilhe esta pasta completa** com seus amigos
2. **Todos clicam em:** LoL Matchmaking.exe
3. **RESULTADO:** Vocês se conectarão automaticamente na rede P2P!
4. **Na interface:** Verão "Peers Conectados: 1, 2, 3..." em vez de 0

---

## 🛠️ SOLUÇÃO DE PROBLEMAS:

### "Erro de porta 8080":
- Verifique se não há outro programa usando a porta
- Reinicie o computador se necessário

### "Peers não conectam":
- Aguarde até 30 segundos para conexão automática
- Verifique firewall/antivírus
- Certifique-que todos têm a mesma versão

### "Para testar localmente":
- Abra múltiplas instâncias do LoL Matchmaking.exe
- Aguarde alguns segundos e elas se conectarão

---

## 🎯 SEQUÊNCIA AUTOMÁTICA DE INICIALIZAÇÃO:

1. **0-2s:** P2P Signaling Server inicia (porta 8080)
2. **2-5s:** Backend principal inicia (porta 3000)  
3. **5-8s:** Interface gráfica carrega e conecta
4. **8s+:** Sistema totalmente funcional!

---

## 🔧 DETALHES TÉCNICOS:

### O que acontece automaticamente ao abrir o .exe:
- **Electron** detecta que está em produção
- **Inicia o P2P signaling** via spawn do Node.js
- **Inicia o backend principal** via spawn do Node.js  
- **Carrega a interface** Angular do backend
- **Conecta tudo** automaticamente

### Arquivos importantes:
- **signaling-server-standalone.js**: Servidor P2P independente
- **server.js**: Backend principal com API e arquivos estáticos
- **browser/**: Interface Angular buildada
- **node_modules/**: Todas as dependências empacotadas

🎮 **Divirta-se! Agora é só clicar e usar!**`;

fs.writeFileSync('dist/P2P-README.txt', readme);
console.log('✅ P2P-README.txt criado em dist/');
console.log('');
console.log('🎉 Scripts P2P criados com sucesso!');
console.log('💡 Agora o P2P funciona 100% automático no executável!');
