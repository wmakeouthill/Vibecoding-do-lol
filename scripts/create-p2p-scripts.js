const fs = require('fs');

console.log('📋 Criando scripts P2P para produção...');

// Criar diretório dist se não existir
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Script BAT para iniciar P2P
const startP2P = `@echo off
echo 🚀 Iniciando LoL Matchmaking com P2P...
echo.
echo 📡 Iniciando servidor de sinalização na porta 8080...
start "Servidor P2P" cmd /k "cd backend && node signaling-server-standalone.js"
echo.
echo ⏳ Aguardando servidor inicializar...
timeout /t 3 /nobreak > nul
echo.
echo 🎮 Iniciando aplicação principal...
start "" "LoL Matchmaking.exe"
echo.
echo ✅ Sistema P2P iniciado com sucesso!
echo.
echo 💡 DICA: Para conectar com amigos em outros computadores:
echo    1. Compartilhe esta pasta completa
echo    2. Eles executam start-p2p.bat
echo    3. Vocês se conectarão automaticamente!
echo.
pause`;

// Script BAT alternativo (sem P2P)
const startNormal = `@echo off
echo 🎮 Iniciando LoL Matchmaking (Modo Central)...
echo.
echo ⚠️  Modo sem P2P - apenas fila central
echo.
start "" "LoL Matchmaking.exe"
echo.
echo ✅ Aplicação iniciada!`;

fs.writeFileSync('dist/start-p2p.bat', startP2P);
fs.writeFileSync('dist/start-normal.bat', startNormal);
console.log('✅ Script start-p2p.bat criado em dist/');
console.log('✅ Script start-normal.bat criado em dist/');
console.log('✅ Script start-p2p.bat criado em dist/');

// README para usuário
const readme = `# LoL Matchmaking - Sistema P2P

## 🚀 COMO EXECUTAR:

### ⭐ RECOMENDADO - Com P2P (Conecta com outros jogadores):
1. **Execute: start-p2p.bat**
2. Aguarde servidor P2P inicializar (3 segundos)  
3. Use o app normalmente
4. **BENEFÍCIO:** Conecta automaticamente com outros jogadores!

### 🏠 Alternativo - Modo Central (Local apenas):
1. **Execute: start-normal.bat** OU **LoL Matchmaking.exe**
2. Use apenas fila central
3. **LIMITAÇÃO:** Não conecta com outros jogadores

---

## 🌐 CONECTAR COM AMIGOS:

### Para jogar com amigos em outros computadores:
1. **Compartilhe esta pasta completa** com seus amigos
2. **Todos executam:** start-p2p.bat
3. **Resultado:** Vocês se conectarão automaticamente na rede P2P!
4. **Na interface:** Verão "Peers Conectados: 1, 2, 3..." em vez de 0

---

## 🛠️ SOLUÇÃO DE PROBLEMAS:

### "Erro de porta 8080":
- Verifique se não há outro programa usando a porta
- Reinicie o computador se necessário

### "Peers não conectam":
- Certifique-se que todos usaram start-p2p.bat
- Aguarde até 30 segundos para conexão
- Verifique firewall/antivírus

### "Para testar sozinho":
- Execute start-p2p.bat em múltiplas instâncias
- Ou use o comando: npm run test:p2p (se tiver Node.js)

---

🎮 **Divirta-se com o matchmaking P2P!**`;

fs.writeFileSync('dist/P2P-README.txt', readme);
console.log('✅ P2P-README.txt criado em dist/');
console.log('✅ P2P-README.txt criado em dist/');
