const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function testDiscordToken() {
  console.log('🔍 Testando persistência do token do Discord...');
  
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
    
    // Verificar se a tabela settings existe
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('📋 Tabelas encontradas:', tables.map(t => t.name));
    
    // Verificar se a tabela settings existe
    const settingsTable = tables.find(t => t.name === 'settings');
    if (!settingsTable) {
      console.error('❌ Tabela settings não encontrada!');
      return;
    }
    
    console.log('✅ Tabela settings encontrada');
    
    // Verificar configurações existentes
    const settings = await db.all('SELECT * FROM settings');
    console.log('⚙️ Configurações existentes:');
    settings.forEach(setting => {
      console.log(`  ${setting.key}: ${setting.value.substring(0, 20)}...`);
    });
    
    // Verificar especificamente o token do Discord
    const discordToken = await db.get('SELECT * FROM settings WHERE key = ?', ['discord_bot_token']);
    if (discordToken) {
      console.log('✅ Token do Discord encontrado no banco');
      console.log(`  Token: ${discordToken.value.substring(0, 20)}...`);
      console.log(`  Atualizado em: ${discordToken.updated_at}`);
    } else {
      console.log('❌ Token do Discord NÃO encontrado no banco');
    }
    
    // Testar inserção de um token
    const testToken = 'TEST_TOKEN_' + Date.now();
    await db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['discord_bot_token', testToken]
    );
    
    console.log('✅ Token de teste inserido');
    
    // Verificar se foi salvo
    const savedToken = await db.get('SELECT * FROM settings WHERE key = ?', ['discord_bot_token']);
    if (savedToken && savedToken.value === testToken) {
      console.log('✅ Token salvo corretamente');
    } else {
      console.log('❌ Falha ao salvar token');
    }
    
    await db.close();
    console.log('✅ Teste concluído');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  }
}

testDiscordToken(); 