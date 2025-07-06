const axios = require('axios');
const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

const BASE_URL = 'http://localhost:3000/api';

async function checkAcceptanceStatusColumn() {
  let connection;
  
  try {
    console.log('🔍 [Test] Verificando coluna acceptance_status na tabela queue_players...');
    
    // Conectar ao MySQL
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL');
    
    // 1. Verificar estrutura da tabela
    console.log('\n1️⃣ Verificando estrutura da tabela queue_players...');
    const [columns] = await connection.execute('DESCRIBE queue_players');
    
    console.log('📋 Colunas da tabela:');
    columns.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? '(NULL)' : '(NOT NULL)'} ${col.Extra}`);
    });
    
    // Verificar se acceptance_status existe
    const hasAcceptanceStatus = columns.some(col => col.Field === 'acceptance_status');
    console.log(`\n📊 Coluna acceptance_status: ${hasAcceptanceStatus ? '✅ EXISTE' : '❌ NÃO EXISTE'}`);
    
    if (!hasAcceptanceStatus) {
      console.log('\n⚠️ PROBLEMA ENCONTRADO: Coluna acceptance_status não existe!');
      console.log('🔧 Adicionando coluna acceptance_status...');
      
      await connection.execute(`
        ALTER TABLE queue_players 
        ADD COLUMN acceptance_status TINYINT(1) DEFAULT 0 
        COMMENT '0=pendente, 1=aceito, 2=recusado'
      `);
      
      console.log('✅ Coluna acceptance_status adicionada!');
    }
    
    // 2. Verificar dados atuais
    console.log('\n2️⃣ Verificando dados atuais...');
    const [players] = await connection.execute(`
      SELECT id, player_id, summoner_name, acceptance_status, is_active 
      FROM queue_players 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    console.log('📋 Últimos 5 registros:');
    players.forEach(player => {
      console.log(`   - ID: ${player.id}, Player: ${player.summoner_name}, Status: ${player.acceptance_status}, Ativo: ${player.is_active}`);
    });
    
    // 3. Testar criação de bots e matchmaking
    console.log('\n3️⃣ Testando aceitação automática de bots...');
    
    // Limpar fila primeiro
    await connection.execute('UPDATE queue_players SET is_active = 0');
    console.log('✅ Fila limpa');
    
    // Adicionar 10 bots
    console.log('\n4️⃣ Adicionando 10 bots para teste...');
    const botPromises = [];
    for (let i = 1; i <= 10; i++) {
      const promise = axios.post(`${BASE_URL}/queue/join`, {
        player: {
          summonerName: `AcceptBot${i}`,
          gameName: `AcceptBot${i}`,
          tagLine: 'TEST',
          region: 'br1',
          customLp: 1200
        },
        preferences: {
          primaryLane: 'fill',
          secondaryLane: 'fill'
        }
      });
      botPromises.push(promise);
    }
    
    await Promise.allSettled(botPromises);
    console.log('✅ Bots adicionados');
    
    // Aguardar matchmaking
    console.log('\n5️⃣ Aguardando matchmaking automático...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Verificar se partida foi criada
    const matches = await axios.get(`${BASE_URL}/matches/recent`);
    const recentMatches = matches.data.filter(m => {
      const createdTime = new Date(m.created_at);
      const now = new Date();
      const diffMinutes = (now - createdTime) / (1000 * 60);
      return diffMinutes < 2; // Criada nos últimos 2 minutos
    });
    
    console.log(`📊 Partidas recentes: ${recentMatches.length}`);
    
    if (recentMatches.length > 0) {
      const match = recentMatches[0];
      console.log(`🎮 Partida encontrada: ${match.id} - Status: ${match.status}`);
      
      // Verificar acceptance_status dos bots
      console.log('\n6️⃣ Verificando acceptance_status dos bots...');
      const [botStatuses] = await connection.execute(`
        SELECT summoner_name, acceptance_status, is_active 
        FROM queue_players 
        WHERE summoner_name LIKE 'AcceptBot%'
        ORDER BY summoner_name
      `);
      
      console.log('🤖 Status de aceitação dos bots:');
      botStatuses.forEach(bot => {
        const statusText = bot.acceptance_status === 0 ? 'Pendente' : 
                          bot.acceptance_status === 1 ? 'Aceito' : 
                          bot.acceptance_status === 2 ? 'Recusado' : 'Desconhecido';
        console.log(`   - ${bot.summoner_name}: ${statusText} (${bot.acceptance_status})`);
      });
      
      const acceptedBots = botStatuses.filter(b => b.acceptance_status === 1).length;
      const pendingBots = botStatuses.filter(b => b.acceptance_status === 0).length;
      
      console.log(`\n📊 Resumo: ${acceptedBots} aceitos, ${pendingBots} pendentes`);
      
      if (acceptedBots > 0) {
        console.log('✅ SUCESSO: Alguns bots aceitaram automaticamente!');
      } else {
        console.log('❌ PROBLEMA: Nenhum bot aceitou automaticamente');
        console.log('🔍 Verificando logs do backend...');
      }
      
      // Aguardar progressão
      if (acceptedBots < 10) {
        console.log('\n7️⃣ Aguardando mais aceitações...');
        for (let i = 1; i <= 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const [currentStatuses] = await connection.execute(`
            SELECT COUNT(*) as accepted_count 
            FROM queue_players 
            WHERE summoner_name LIKE 'AcceptBot%' AND acceptance_status = 1
          `);
          
          const currentAccepted = currentStatuses[0].accepted_count;
          console.log(`   [${i}s] Bots aceitos: ${currentAccepted}/10`);
          
          if (currentAccepted >= 10) {
            console.log('✅ Todos os bots aceitaram!');
            break;
          }
        }
      }
    } else {
      console.log('❌ Nenhuma partida foi criada');
    }
    
    console.log('\n✅ [Test] Teste concluído!');
    
  } catch (error) {
    console.error('❌ [Test] Erro:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkAcceptanceStatusColumn();
