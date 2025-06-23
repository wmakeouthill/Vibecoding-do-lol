const net = require('net');
const http = require('http');

async function waitForHTTP(port = 4200, maxAttempts = 30, delay = 1000) {
  console.log(`⏳ Aguardando servidor HTTP na porta ${port}...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
          resolve();
        });
        
        req.setTimeout(2000);
        req.on('error', reject);
        req.on('timeout', reject);
      });
      
      console.log(`✅ Servidor HTTP está pronto na porta ${port}!`);
      return;
    } catch (error) {
      if (attempt < maxAttempts) {
        console.log(`⏳ HTTP - Tentativa ${attempt}/${maxAttempts} - aguardando...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Timeout aguardando servidor HTTP na porta ${port}`);
}

async function waitForTCP(port = 8080, maxAttempts = 30, delay = 1000) {
  console.log(`⏳ Aguardando servidor TCP na porta ${port}...`);
  
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
      
      console.log(`✅ Servidor TCP está pronto na porta ${port}!`);
      return;
    } catch (error) {
      if (attempt < maxAttempts) {
        console.log(`⏳ TCP - Tentativa ${attempt}/${maxAttempts} - aguardando...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Timeout aguardando servidor TCP na porta ${port}`);
}

async function waitForAllServers() {
  console.log(`🚀 Aguardando todos os servidores...`);
  
  try {
    // Aguardar frontend (Angular)
    await waitForHTTP(4200);
    
    // Aguardar P2P signaling server
    await waitForTCP(8080);
    
    console.log(`🎉 Todos os servidores estão prontos!`);
    return true;
  } catch (error) {
    console.error(`❌ Erro aguardando servidores:`, error.message);
    console.log(`📝 Continuando mesmo assim...`);
    return false;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  waitForAllServers().then((success) => {
    console.log(`🎯 Verificação concluída: ${success ? 'Sucesso' : 'Com avisos'}`);
    process.exit(success ? 0 : 1);
  });
}

module.exports = { waitForAllServers, waitForHTTP, waitForTCP };
