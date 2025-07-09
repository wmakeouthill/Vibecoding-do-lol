/**
 * Teste simples para verificar Discord Match Creation
 */

const http = require('http');

async function testDiscordStatus() {
  console.log('🔍 [Test] Verificando status do Discord Bot...');
  
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/discord/status',
      method: 'GET'
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('✅ [Test] Status do Discord:', result);
          resolve(result);
        } catch (error) {
          console.error('❌ [Test] Erro ao parsear resposta:', error);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ [Test] Erro na requisição:', error);
      reject(error);
    });
    
    req.end();
  });
}

async function testDiscordLinks() {
  console.log('🔗 [Test] Verificando vinculações Discord...');
  
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/discord/links',
      method: 'GET'
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('🔗 [Test] Vinculações Discord:', result);
          resolve(result);
        } catch (error) {
          console.error('❌ [Test] Erro ao parsear resposta:', error);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ [Test] Erro na requisição:', error);
      reject(error);
    });
    
    req.end();
  });
}

async function runTests() {
  try {
    console.log('🚀 [Test] Iniciando testes do Discord...\n');
    console.log('⏰ [Test] Este teste será executado por 20 segundos e depois parará automaticamente\n');
    
    // Teste 1: Status do Discord
    const discordStatus = await testDiscordStatus();
    
    // Teste 2: Vinculações Discord
    const discordLinks = await testDiscordLinks();
    
    console.log('\n📊 [Test] Resumo dos testes:');
    console.log('   - Discord conectado:', discordStatus?.connected || false);
    console.log('   - Bot username:', discordStatus?.botUsername || 'N/A');
    console.log('   - Vinculações encontradas:', discordLinks?.links?.length || 0);
    
    if (discordLinks?.links?.length > 0) {
      console.log('\n🎮 [Test] Primeiras 5 vinculações:');
      discordLinks.links.slice(0, 5).forEach((link, index) => {
        console.log(`   ${index + 1}. ${link.game_name}#${link.tag_line} → Discord ID: ${link.discord_id}`);
      });
    }
    
    // Teste 3: Simular logs de match found
    console.log('\n⚠️ [Test] INSTRUÇÕES PARA DEBUG:');
    console.log('1. Aceite um match no frontend AGORA!');
    console.log('2. Procure nos logs do backend por:');
    console.log('   - "🎮 [DiscordService] ========== CRIANDO DISCORD MATCH =========="');
    console.log('   - "🔍 [DiscordService] Discord conectado:"');
    console.log('   - "📊 [DiscordService] Time 1:" e "📊 [DiscordService] Time 2:"');
    console.log('3. Se não aparecer nenhum log, o problema é que createDiscordMatch não está sendo chamado');
    console.log('4. Se aparecer os logs mas não criar canais, o problema é na criação dos canais Discord');
    
    // Configurar timeout de 20 segundos
    console.log('\n⏱️ [Test] Aguardando por logs... (20 segundos restantes)');
    
    let timeLeft = 20;
    const interval = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        process.stdout.write(`\r⏱️ [Test] Aguardando por logs... (${timeLeft} segundos restantes)`);
      }
    }, 1000);
    
    setTimeout(() => {
      clearInterval(interval);
      console.log('\n\n🔚 [Test] Timeout de 20 segundos atingido. Finalizando teste...');
      console.log('📋 [Test] Se você viu logs do Discord durante este período, ótimo!');
      console.log('📋 [Test] Se não viu logs, o createDiscordMatch não está sendo chamado.');
      process.exit(0);
    }, 20000);
    
  } catch (error) {
    console.error('❌ [Test] Erro nos testes:', error);
  }
}

runTests();
