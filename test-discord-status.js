/**
 * Script simples para testar status do Discord Bot
 */

const http = require('http');

function testDiscordStatus() {
  console.log('🔧 [Test] Testando status do Discord Bot...\n');

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/discord/status',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('Status Code:', res.statusCode);
      console.log('Response:', data);
      
      try {
        const jsonData = JSON.parse(data);
        console.log('\n📊 Status do Discord Bot:');
        console.log('  Conectado:', jsonData.connected);
        console.log('  Username:', jsonData.username);
        console.log('  Fila:', jsonData.queueSize);
        console.log('  Matches:', jsonData.activeMatches);
        
        if (jsonData.connected) {
          console.log('\n✅ Discord Bot está conectado e funcionando!');
          console.log('\n🎯 PRÓXIMOS PASSOS PARA TESTAR:');
          console.log('1. Entre no canal #lol-matchmaking no Discord');
          console.log('2. Use /vincular no Discord para vincular seu LoL nickname');
          console.log('3. Aceite uma partida no matchmaking');
          console.log('4. Observe os logs do backend para ver se createDiscordMatch é chamado');
        } else {
          console.log('\n❌ Discord Bot NÃO está conectado!');
          console.log('💡 Verifique:');
          console.log('  - Token do Discord Bot está configurado?');
          console.log('  - Token é válido?');
          console.log('  - Bot tem permissões no servidor?');
        }
      } catch (error) {
        console.log('\n❌ Erro ao parsear resposta:', error.message);
        console.log('Resposta bruta:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ Erro ao conectar:', error.message);
    console.log('💡 Certifique-se de que o backend está rodando na porta 3001');
  });

  req.end();
}

testDiscordStatus();
