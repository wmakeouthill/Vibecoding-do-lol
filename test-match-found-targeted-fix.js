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

// Simulação de clientes WebSocket
class TestClient {
  constructor(playerData) {
    this.playerData = playerData;
    this.ws = null;
    this.receivedMessages = [];
    this.isIdentified = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('ws://localhost:3000');
      
      this.ws.on('open', () => {
        console.log(`✅ [${this.playerData.displayName}] Conectado ao WebSocket`);
        this.identifyPlayer();
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.receivedMessages.push(message);
        this.handleMessage(message);
      });

      this.ws.on('error', (error) => {
        console.error(`❌ [${this.playerData.displayName}] Erro WebSocket:`, error);
        reject(error);
      });
    });
  }

  identifyPlayer() {
    console.log(`🆔 [${this.playerData.displayName}] Identificando jogador...`);
    const message = {
      type: 'identify_player',
      playerData: this.playerData
    };
    this.ws.send(JSON.stringify(message));
  }

  handleMessage(message) {
    console.log(`📨 [${this.playerData.displayName}] Recebeu:`, message.type);
    
    switch (message.type) {
      case 'player_identified':
        if (message.success) {
          console.log(`✅ [${this.playerData.displayName}] Identificado com sucesso`);
          this.isIdentified = true;
        } else {
          console.log(`❌ [${this.playerData.displayName}] Erro na identificação:`, message.error);
        }
        break;
        
      case 'match_found':
        console.log(`🎮 [${this.playerData.displayName}] MATCH FOUND RECEBIDO!`);
        console.log(`🎯 [${this.playerData.displayName}] MatchId:`, message.data.matchId);
        break;
        
      default:
        // Outros tipos de mensagem
        break;
    }
  }

  joinQueue() {
    console.log(`⏳ [${this.playerData.displayName}] Entrando na fila...`);
    const message = {
      type: 'join_queue',
      data: {
        id: this.playerData.id,
        summonerName: this.playerData.displayName,
        gameName: this.playerData.gameName,
        tagLine: this.playerData.tagLine,
        region: 'br1',
        currentMMR: this.playerData.mmr || 1200,
        preferences: {
          primaryLane: this.playerData.primaryLane || 'fill',
          secondaryLane: this.playerData.secondaryLane || 'fill'
        }
      }
    };
    this.ws.send(JSON.stringify(message));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }

  getMatchFoundCount() {
    return this.receivedMessages.filter(msg => msg.type === 'match_found').length;
  }
}

async function testTargetedMatchFoundNotifications() {
  console.log('🧪 [Test] === TESTE: NOTIFICAÇÕES DIRECIONADAS DE MATCH FOUND ===');
  
  let connection;
  const clients = [];
  
  try {
    // Conectar ao banco de dados
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ [Test] Conectado ao MySQL');
    
    // Limpar fila atual
    await connection.execute('DELETE FROM queue_players');
    console.log('✅ [Test] Fila limpa');
    
    // Criar jogadores de teste - alguns humanos e alguns bots
    const testPlayers = [
      // Jogadores humanos
      { id: 1, displayName: 'TestPlayer1#BR1', gameName: 'TestPlayer1', tagLine: 'BR1', mmr: 1200, primaryLane: 'top', isBot: false },
      { id: 2, displayName: 'TestPlayer2#BR1', gameName: 'TestPlayer2', tagLine: 'BR1', mmr: 1220, primaryLane: 'jungle', isBot: false },
      { id: 3, displayName: 'TestPlayer3#BR1', gameName: 'TestPlayer3', tagLine: 'BR1', mmr: 1180, primaryLane: 'mid', isBot: false },
      { id: 4, displayName: 'TestPlayer4#BR1', gameName: 'TestPlayer4', tagLine: 'BR1', mmr: 1250, primaryLane: 'bot', isBot: false },
      { id: 5, displayName: 'TestPlayer5#BR1', gameName: 'TestPlayer5', tagLine: 'BR1', mmr: 1190, primaryLane: 'support', isBot: false },
      
      // Bots (não devem receber notificação)
      { id: 6, displayName: 'Bot1#BR1', gameName: 'Bot1', tagLine: 'BR1', mmr: 1200, primaryLane: 'top', isBot: true },
      { id: 7, displayName: 'Bot2#BR1', gameName: 'Bot2', tagLine: 'BR1', mmr: 1200, primaryLane: 'jungle', isBot: true },
      { id: 8, displayName: 'Bot3#BR1', gameName: 'Bot3', tagLine: 'BR1', mmr: 1200, primaryLane: 'mid', isBot: true },
      { id: 9, displayName: 'Bot4#BR1', gameName: 'Bot4', tagLine: 'BR1', mmr: 1200, primaryLane: 'bot', isBot: true },
      { id: 10, displayName: 'Bot5#BR1', gameName: 'Bot5', tagLine: 'BR1', mmr: 1200, primaryLane: 'support', isBot: true }
    ];

    // Criar clientes WebSocket apenas para jogadores humanos
    const humanPlayers = testPlayers.filter(p => !p.isBot);
    console.log(`🎮 [Test] Criando ${humanPlayers.length} clientes para jogadores humanos...`);
    
    for (const player of humanPlayers) {
      const client = new TestClient(player);
      await client.connect();
      clients.push(client);
      await sleep(500); // Aguardar conexão
    }

    console.log(`✅ [Test] ${clients.length} clientes conectados`);

    // Aguardar identificação de todos os clientes
    await sleep(2000);
    
    // Verificar se todos foram identificados
    const identifiedCount = clients.filter(c => c.isIdentified).length;
    console.log(`🆔 [Test] ${identifiedCount}/${clients.length} clientes identificados`);

    // Inserir todos os jogadores na fila diretamente no banco (incluindo bots)
    console.log('📥 [Test] Inserindo jogadores na fila no banco...');
    for (const player of testPlayers) {
      await connection.execute(`
        INSERT INTO queue_players (
          player_id, summoner_name, region, custom_lp, 
          primary_lane, secondary_lane, join_time, queue_position
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
      `, [
        player.id,
        player.displayName,
        'br1',
        player.mmr,
        player.primaryLane,
        player.secondaryLane || 'fill',
        player.id
      ]);
    }

    console.log('✅ [Test] 10 jogadores inseridos na fila');

    // Aguardar o matchmaking processar (normalmente demora 5-10 segundos)
    console.log('⏱️ [Test] Aguardando processamento do matchmaking...');
    await sleep(12000);

    // Verificar quantos clientes receberam match_found
    let matchFoundReceivedCount = 0;
    console.log('\n📊 [Test] === RESULTADOS ===');
    
    for (const client of clients) {
      const matchFoundCount = client.getMatchFoundCount();
      if (matchFoundCount > 0) {
        matchFoundReceivedCount++;
        console.log(`✅ [Test] ${client.playerData.displayName}: Recebeu ${matchFoundCount} match_found`);
      } else {
        console.log(`❌ [Test] ${client.playerData.displayName}: NÃO recebeu match_found`);
      }
    }

    console.log(`\n🎯 [Test] RESUMO:`);
    console.log(`   • Jogadores humanos conectados: ${clients.length}`);
    console.log(`   • Jogadores que receberam match_found: ${matchFoundReceivedCount}`);
    console.log(`   • Expectativa: TODOS os jogadores humanos devem receber`);

    if (matchFoundReceivedCount === clients.length) {
      console.log('✅ [Test] SUCESSO: Todos os jogadores humanos receberam match_found!');
    } else if (matchFoundReceivedCount === 1) {
      console.log('❌ [Test] FALHA: Apenas 1 jogador recebeu (problema original)');
    } else if (matchFoundReceivedCount === 0) {
      console.log('⚠️ [Test] NENHUM recebeu: Possível problema de matchmaking');
    } else {
      console.log(`⚠️ [Test] PARCIAL: ${matchFoundReceivedCount}/${clients.length} receberam`);
    }

  } catch (error) {
    console.error('❌ [Test] Erro durante o teste:', error);
  } finally {
    // Limpar
    if (connection) {
      await connection.execute('DELETE FROM queue_players');
      await connection.end();
    }
    
    for (const client of clients) {
      client.disconnect();
    }
    
    console.log('🧹 [Test] Limpeza concluída');
  }
}

// Executar o teste
testTargetedMatchFoundNotifications().catch(console.error); 