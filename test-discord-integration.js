const axios = require('axios');

async function testDiscordIntegration() {
  console.log('🧪 [Test] Testando integração Discord...');
  
  try {
    // 1. Verificar se o Discord está conectado
    console.log('1. Verificando conexão Discord...');
    const discordStatus = await axios.get('http://localhost:3000/api/discord/status');
    console.log('   Status Discord:', discordStatus.data);
    
    if (!discordStatus.data.isConnected) {
      console.log('❌ Discord não está conectado! Configure o token first.');
      return;
    }
    
    // 2. Verificar usuários no canal
    console.log('2. Verificando usuários no canal Discord...');
    const discordUsers = await axios.get('http://localhost:3000/api/discord/users');
    console.log('   Usuários no canal:', discordUsers.data.users?.length || 0);
    
    if (discordUsers.data.users) {
      discordUsers.data.users.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.username} (${user.displayName})`);
        if (user.linkedNickname) {
          console.log(`      ↳ Vinculado: ${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`);
        } else {
          console.log(`      ↳ ❌ SEM VINCULAÇÃO`);
        }
      });
    }
    
    // 3. Verificar vinculações existentes
    console.log('3. Verificando vinculações Discord...');
    const discordLinks = await axios.get('http://localhost:3000/api/discord/links');
    console.log('   Total de vinculações:', discordLinks.data.links?.length || 0);
    
    if (discordLinks.data.links) {
      discordLinks.data.links.forEach((link, i) => {
        console.log(`   ${i + 1}. ${link.discord_username} → ${link.game_name}#${link.tag_line}`);
      });
    }
    
    // 4. Verificar partidas ativas
    console.log('4. Verificando partidas ativas...');
    const matches = await axios.get('http://localhost:3000/api/matches');
    console.log('   Partidas ativas:', matches.data.length || 0);
    
    // 5. Verificar status da fila
    console.log('5. Verificando fila atual...');
    const queue = await axios.get('http://localhost:3000/api/queue');
    console.log('   Jogadores na fila:', queue.data.length || 0);
    
    console.log('\n✅ [Test] Teste de integração concluído!');
    console.log('\n📋 [Test] Resumo dos problemas potenciais:');
    
    if (!discordStatus.data.isConnected) {
      console.log('❌ Discord não conectado - configure o bot token');
    }
    
    if (!discordUsers.data.users || discordUsers.data.users.length === 0) {
      console.log('❌ Nenhum usuário no canal #lol-matchmaking');
    } else {
      const usersWithoutLink = discordUsers.data.users.filter(u => !u.linkedNickname);
      if (usersWithoutLink.length > 0) {
        console.log(`❌ ${usersWithoutLink.length} usuários sem vinculação Discord`);
      }
    }
    
    if (!discordLinks.data.links || discordLinks.data.links.length === 0) {
      console.log('❌ Nenhuma vinculação Discord encontrada');
    }
    
    console.log('\n💡 [Test] Para testar criação de match Discord:');
    console.log('   1. Certifique-se que o Discord bot está conectado');
    console.log('   2. Entre no canal #lol-matchmaking');
    console.log('   3. Use /vincular <seu_nick> <#sua_tag> no Discord');
    console.log('   4. Entre na fila e aceite uma partida');
    
  } catch (error) {
    console.error('❌ [Test] Erro no teste:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Executar teste
testDiscordIntegration();
