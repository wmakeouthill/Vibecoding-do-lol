const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function testConfigPriority() {
  console.log('🔍 Testando prioridade de carregamento das configurações...');
  
  // Caminho do banco de dados
  const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');
  console.log('📁 Caminho do banco:', dbPath);
  
  try {
    // Abrir banco de dados
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    console.log('✅ Banco de dados aberto com sucesso');
    
    // Verificar configurações existentes
    const settings = await db.all('SELECT * FROM settings');
    console.log('\n📋 Configurações atuais no banco:');
    settings.forEach(setting => {
      const value = setting.key.includes('token') || setting.key.includes('key') 
        ? setting.value.substring(0, 20) + '...' 
        : setting.value;
      console.log(`  ${setting.key}: ${value}`);
    });
    
    // Verificar variáveis de ambiente
    console.log('\n🌍 Variáveis de ambiente:');
    console.log(`  RIOT_API_KEY: ${process.env.RIOT_API_KEY ? process.env.RIOT_API_KEY.substring(0, 20) + '...' : 'não definida'}`);
    console.log(`  DISCORD_BOT_TOKEN: ${process.env.DISCORD_BOT_TOKEN ? process.env.DISCORD_BOT_TOKEN.substring(0, 20) + '...' : 'não definida'}`);
    
    // Simular teste de prioridade
    console.log('\n🎯 Ordem de prioridade implementada:');
    console.log('  1. Banco de dados (mais recente/confiável)');
    console.log('  2. localStorage (backup do frontend)');
    console.log('  3. .env (fallback para desenvolvimento)');
    
    // Verificar se há conflitos
    const riotApiKeyInDB = settings.find(s => s.key === 'riot_api_key')?.value;
    const discordTokenInDB = settings.find(s => s.key === 'discord_bot_token')?.value;
    
    console.log('\n⚠️ Análise de conflitos:');
    
    if (riotApiKeyInDB && process.env.RIOT_API_KEY) {
      if (riotApiKeyInDB === process.env.RIOT_API_KEY) {
        console.log('  ✅ Riot API Key: Banco e .env são iguais');
      } else {
        console.log('  ⚠️ Riot API Key: Banco e .env são diferentes (banco tem prioridade)');
      }
    }
    
    if (discordTokenInDB && process.env.DISCORD_BOT_TOKEN) {
      if (discordTokenInDB === process.env.DISCORD_BOT_TOKEN) {
        console.log('  ✅ Discord Token: Banco e .env são iguais');
      } else {
        console.log('  ⚠️ Discord Token: Banco e .env são diferentes (banco tem prioridade)');
      }
    }
    
    // Testar endpoint de configurações
    console.log('\n🌐 Testando endpoint de configurações...');
    const http = require('http');
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/config/settings',
      method: 'GET'
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            console.log('✅ Endpoint /api/config/settings funcionando');
            console.log('  Riot API Key:', response.settings.riotApiKey ? response.settings.riotApiKey.substring(0, 20) + '...' : 'não configurada');
            console.log('  Discord Token:', response.settings.discordBotToken ? response.settings.discordBotToken.substring(0, 20) + '...' : 'não configurado');
          } else {
            console.log('❌ Endpoint retornou erro:', response.error);
          }
        } catch (error) {
          console.log('❌ Erro ao parsear resposta do endpoint:', error.message);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log('⚠️ Servidor não está rodando ou endpoint não disponível');
    });
    
    req.end();
    
    await db.close();
    console.log('\n✅ Teste de prioridade concluído');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

testConfigPriority(); 