const net = require('net');

async function waitForDiscordBot(port = 8081, maxAttempts = 30, delay = 1000) {
  console.log(`⏳ Aguardando Discord Bot na porta ${port}...`);
  
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
      
      console.log(`✅ Discord Bot está pronto na porta ${port}!`);
      return;
    } catch (error) {
      if (attempt < maxAttempts) {
        console.log(`⏳ Tentativa ${attempt}/${maxAttempts} - aguardando Discord Bot...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log(`❌ Discord Bot não foi encontrado na porta ${port} após ${maxAttempts} tentativas`);
  console.log(`📝 Para usar a fila Discord, certifique-se de que o bot está rodando:`);
  console.log(`   1. Configure o token do bot no discord-bot.js`);
  console.log(`   2. Execute: node discord-bot.js`);
  console.log(`   3. O app funcionará apenas com fila centralizada sem o Discord Bot`);
}

if (require.main === module) {
  waitForDiscordBot().catch(console.error);
}

module.exports = waitForDiscordBot;
