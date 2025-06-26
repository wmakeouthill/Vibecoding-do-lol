const WebSocket = require('ws');

console.log('🧪 Testando duplicação de conexões WebSocket...');

let connectionCount = 0;
const connections = [];

function createConnection(id) {
  console.log(`🔗 [${id}] Criando conexão #${id}...`);
  
  const ws = new WebSocket('ws://localhost:3000/ws');
  connections.push({ id, ws });

  ws.on('open', () => {
    connectionCount++;
    console.log(`✅ [${id}] Conexão #${id} aberta (Total: ${connectionCount})`);
    
    // Enviar mensagem de teste
    const message = { type: 'get_discord_status' };
    ws.send(JSON.stringify(message));
    console.log(`📤 [${id}] Enviado:`, message.type);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📥 [${id}] Recebido:`, message.type);
    } catch (error) {
      console.error(`❌ [${id}] Erro ao processar mensagem:`, error);
    }
  });

  ws.on('close', () => {
    connectionCount--;
    console.log(`🔌 [${id}] Conexão #${id} fechada (Total: ${connectionCount})`);
  });

  ws.on('error', (error) => {
    console.error(`❌ [${id}] Erro na conexão #${id}:`, error);
  });

  return ws;
}

// Criar múltiplas conexões para simular duplicação
console.log('🔄 Criando múltiplas conexões...');

const ws1 = createConnection('A');
setTimeout(() => createConnection('B'), 1000);
setTimeout(() => createConnection('C'), 2000);

// Fechar conexões após 10 segundos
setTimeout(() => {
  console.log('🔌 Fechando todas as conexões...');
  connections.forEach(({ id, ws }) => {
    console.log(`🔌 Fechando conexão ${id}...`);
    ws.close();
  });
  
  setTimeout(() => {
    console.log('⏰ Teste concluído');
    process.exit(0);
  }, 2000);
}, 10000); 