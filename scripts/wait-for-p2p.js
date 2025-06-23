const net = require('net');

async function waitForP2P(port = 8080, maxAttempts = 30, delay = 1000) {
  console.log(`⏳ Aguardando servidor P2P na porta ${port}...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        
        socket.setTimeout(2000);
        
        socket.connect(port, 'localhost', () => {
          socket.destroy();
          resolve();
        });
        
        socket.on('error', reject);
        socket.on('timeout', reject);
      });
      
      console.log(`✅ Servidor P2P está pronto na porta ${port}!`);
      return;
    } catch (error) {
      if (attempt < maxAttempts) {
        console.log(`⏳ Tentativa ${attempt}/${maxAttempts} - aguardando...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.warn(`⚠️ Timeout aguardando servidor P2P na porta ${port}`);
  console.log(`📝 Continuando sem aguardar P2P...`);
}

// Executar se chamado diretamente
if (require.main === module) {
  const port = process.argv[2] || 8080;
  waitForP2P(port).then(() => {
    console.log(`🎯 Verificação P2P concluída para porta ${port}`);
  });
}

module.exports = waitForP2P;
