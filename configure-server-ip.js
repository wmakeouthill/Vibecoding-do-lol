const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Configuração do IP do Servidor para Produção');
console.log('================================================\n');

console.log('Este script irá configurar o IP do servidor para que os clientes');
console.log('possam se conectar ao servidor em produção.\n');

console.log('📋 Passos:');
console.log('1. Execute o servidor no PC principal');
console.log('2. Descubra o IP do PC principal (ipconfig no Windows)');
console.log('3. Configure o IP nos outros PCs usando este script\n');

rl.question('Digite o IP do servidor (ex: 192.168.1.100): ', (serverIP) => {
  if (!serverIP || serverIP.trim() === '') {
    console.log('❌ IP inválido');
    rl.close();
    return;
  }

  // Validar formato do IP
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(serverIP.trim())) {
    console.log('❌ Formato de IP inválido. Use o formato: 192.168.1.100');
    rl.close();
    return;
  }

  const cleanIP = serverIP.trim();
  
  console.log(`\n✅ Configurando IP do servidor: ${cleanIP}`);
  
  // Salvar no localStorage (será usado pelo frontend)
  const configData = {
    SERVER_IP: cleanIP,
    WEBSOCKET_URL: `ws://${cleanIP}:3000/ws`,
    timestamp: new Date().toISOString()
  };
  
  // Criar arquivo de configuração
  const configPath = path.join(process.cwd(), 'server-config.json');
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  
  console.log(`\n📁 Configuração salva em: ${configPath}`);
  console.log('\n📋 Conteúdo da configuração:');
  console.log(JSON.stringify(configData, null, 2));
  
  console.log('\n🔧 Como usar:');
  console.log('1. Copie o arquivo server-config.json para os outros PCs');
  console.log('2. Execute o aplicativo nos outros PCs');
  console.log('3. O aplicativo irá se conectar automaticamente ao servidor');
  
  console.log('\n💡 Alternativa manual:');
  console.log('1. Abra o console do navegador (F12)');
  console.log('2. Execute: localStorage.setItem("SERVER_IP", "' + cleanIP + '")');
  console.log('3. Recarregue a página');
  
  console.log('\n🧪 Teste de conectividade:');
  console.log(`Teste se o servidor está acessível: http://${cleanIP}:3000`);
  console.log(`Teste WebSocket: ws://${cleanIP}:3000/ws`);
  
  rl.close();
});

rl.on('close', () => {
  console.log('\n✅ Configuração concluída!');
  process.exit(0);
}); 