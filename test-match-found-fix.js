const WebSocket = require('ws');
const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'admin',
  database: 'lol_matchmaking'
};

// Função para aguardar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testMatchFoundFix() {
  console.log('🧪 [Test] === TESTE: CORREÇÃO MATCH FOUND ===');
  
  let connection;
  
  try {
    // Conectar ao banco de dados
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ [Test] Conectado ao MySQL');
    
    // Limpar fila atual
    await connection.execute('DELETE FROM queue_players');
    console.log('✅ [Test] Fila limpa');
    
    // Criar jogadores de teste (incluindo um humano e alguns bots)
    const testPlayers = [
      { name: 'TestHuman#BR1', isBot: false },
      { name: 'TestBot1#BOT', isBot: true },
      { name: 'TestBot2#BOT', isBot: true },
      { name: 'TestBot3#BOT', isBot: true },
      { name: 'TestBot4#BOT', isBot: true },
      { name: 'TestBot5#BOT', isBot: true },
      { name: 'TestBot6#BOT', isBot: true },
      { name: 'TestBot7#BOT', isBot: true },
      { name: 'TestBot8#BOT', isBot: true },
      { name: 'TestBot9#BOT', isBot: true }
    ];
    
    console.log('🎮 [Test] Adicionando jogadores de teste à fila...');
    
    // Adicionar jogadores à fila
    for (let i = 0; i < testPlayers.length; i++) {
      const player = testPlayers[i];
      await connection.execute(`
        INSERT INTO queue_players (player_id, summoner_name, region, custom_lp, primary_lane, secondary_lane, join_time)
        VALUES (?, ?, 'BR1', 1200, 'fill', 'fill', NOW())
      `, [i + 1, player.name]);
      
      console.log(`✅ [Test] Adicionado: ${player.name} (${player.isBot ? 'Bot' : 'Humano'})`);
    }
    
    console.log('🎯 [Test] 10 jogadores adicionados à fila');
    
    // Aguardar o sistema processar automaticamente
    console.log('⏳ [Test] Aguardando sistema processar matchmaking...');
    await sleep(10000); // 10 segundos
    
    // Verificar se uma partida foi criada
    const [matches] = await connection.execute(
      'SELECT * FROM custom_matches WHERE status IN ("pending", "accepted") ORDER BY id DESC LIMIT 1'
    );
    
    if (matches.length > 0) {
      const match = matches[0];
      console.log('✅ [Test] Partida criada:', {
        id: match.id,
        status: match.status,
        team1_count: JSON.parse(match.team1_players || '[]').length,
        team2_count: JSON.parse(match.team2_players || '[]').length
      });
      
      // Verificar se o WebSocket está enviando notificações
      console.log('📡 [Test] Testando WebSocket...');
      
      const ws = new WebSocket('ws://localhost:3001');
      
      ws.on('open', () => {
        console.log('✅ [Test] WebSocket conectado');
        
        // Simular um jogador conectando
        ws.send(JSON.stringify({
          type: 'player_connect',
          data: {
            summonerName: 'TestHuman#BR1',
            region: 'BR1'
          }
        }));
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('📨 [Test] Mensagem WebSocket recebida:', {
            type: message.type,
            matchId: message.data?.matchId,
            hasTeammates: !!message.data?.teammates,
            hasEnemies: !!message.data?.enemies,
            teammatesCount: message.data?.teammates?.length || 0,
            enemiesCount: message.data?.enemies?.length || 0
          });
          
          if (message.type === 'match_found') {
            console.log('🎉 [Test] MATCH FOUND RECEBIDO!');
            console.log('🎉 [Test] Teammates:', message.data.teammates?.map(p => p.summonerName));
            console.log('🎉 [Test] Enemies:', message.data.enemies?.map(p => p.summonerName));
            
            // Verificar se TestHuman#BR1 está na partida
            const allPlayers = [
              ...(message.data.teammates || []),
              ...(message.data.enemies || [])
            ];
            const humanPlayer = allPlayers.find(p => p.summonerName === 'TestHuman#BR1');
            
            if (humanPlayer) {
              console.log('✅ [Test] SUCESSO: Jogador humano encontrado na partida!');
              console.log('✅ [Test] Dados do jogador:', humanPlayer);
            } else {
              console.log('❌ [Test] ERRO: Jogador humano não encontrado na partida!');
            }
            
            ws.close();
          }
        } catch (error) {
          console.error('❌ [Test] Erro ao processar mensagem WebSocket:', error);
        }
      });
      
      ws.on('error', (error) => {
        console.error('❌ [Test] Erro WebSocket:', error);
      });
      
      ws.on('close', () => {
        console.log('🔌 [Test] WebSocket desconectado');
      });
      
      // Aguardar mensagens WebSocket
      await sleep(5000);
      
    } else {
      console.log('❌ [Test] Nenhuma partida foi criada automaticamente');
      console.log('❌ [Test] Verifique se o backend está processando o matchmaking');
    }
    
  } catch (error) {
    console.error('❌ [Test] Erro no teste:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 [Test] Conexão MySQL fechada');
    }
  }
}

// Executar teste
testMatchFoundFix().catch(console.error); 