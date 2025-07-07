/**
 * TESTE PRÁTICO DO FLUXO COMPLETO DE DRAFT
 * Cria uma nova partida, aceita com todos os jogadores e testa picks/bans
 */

// Função para aguardar
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Configurações
const BACKEND_URL = 'http://localhost:3000';

console.log('🎯 [TESTE] Iniciando teste completo do fluxo de draft...');

async function testeCompleto() {
  try {
    // 1. Adicionar jogadores à fila
    console.log('📝 [TESTE] 1. Adicionando jogadores à fila...');
    const jogadores = [
      { nome: 'TestPlayer1', lane1: 'top', lane2: 'jungle' },
      { nome: 'TestPlayer2', lane1: 'jungle', lane2: 'top' },
      { nome: 'TestPlayer3', lane1: 'mid', lane2: 'top' },
      { nome: 'TestPlayer4', lane1: 'adc', lane2: 'mid' },
      { nome: 'TestPlayer5', lane1: 'support', lane2: 'adc' },
      { nome: 'TestPlayer6', lane1: 'top', lane2: 'jungle' },
      { nome: 'TestPlayer7', lane1: 'jungle', lane2: 'top' },
      { nome: 'TestPlayer8', lane1: 'mid', lane2: 'jungle' },
      { nome: 'TestPlayer9', lane1: 'adc', lane2: 'mid' },
      { nome: 'TestPlayer10', lane1: 'support', lane2: 'adc' }
    ];

    for (const jogador of jogadores) {
      const response = await fetch(`${BACKEND_URL}/api/queue/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summonerName: jogador.nome,
          primaryLane: jogador.lane1,
          secondaryLane: jogador.lane2
        })
      });
      
      if (response.ok) {
        console.log(`✅ [TESTE] ${jogador.nome} adicionado à fila`);
      } else {
        console.log(`❌ [TESTE] Erro ao adicionar ${jogador.nome}: ${response.status}`);
      }
      
      await sleep(500); // Pequeno delay
    }

    // 2. Aguardar matchmaking
    console.log('⏳ [TESTE] 2. Aguardando matchmaking criar partida...');
    await sleep(10000); // 10 segundos para matchmaking

    // 3. Verificar se há partidas criadas
    console.log('🔍 [TESTE] 3. Verificando partidas criadas...');
    const statusResponse = await fetch(`${BACKEND_URL}/api/queue/status`);
    const statusData = await statusResponse.json();
    
    console.log('📊 [TESTE] Status da fila:', {
      jogadoresNaFila: statusData.playersInQueue,
      ultimasAtividades: statusData.recentActivities.slice(0, 3).map(a => a.message)
    });

    // Procurar por partidas criadas nas atividades recentes
    const partidaCriada = statusData.recentActivities.find(a => 
      a.type === 'match_created' && a.message.includes('Partida')
    );

    if (!partidaCriada) {
      console.log('❌ [TESTE] Nenhuma partida foi criada pelo matchmaking');
      return;
    }

    // Extrair ID da partida da mensagem
    const matchIdMatch = partidaCriada.message.match(/Partida (\d+)/);
    if (!matchIdMatch) {
      console.log('❌ [TESTE] Não foi possível extrair ID da partida');
      return;
    }

    const matchId = parseInt(matchIdMatch[1]);
    console.log(`🎯 [TESTE] Partida encontrada: ${matchId}`);

    // 4. Aceitar partida com todos os jogadores
    console.log('✅ [TESTE] 4. Aceitando partida com todos os jogadores...');
    for (const jogador of jogadores) {
      const response = await fetch(`${BACKEND_URL}/api/match/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          summonerName: jogador.nome
        })
      });
      
      if (response.ok) {
        console.log(`✅ [TESTE] ${jogador.nome} aceitou a partida`);
      } else {
        const errorText = await response.text();
        console.log(`❌ [TESTE] Erro ao aceitar por ${jogador.nome}: ${response.status} - ${errorText}`);
      }
      
      await sleep(1000); // 1 segundo entre aceitações
    }

    // 5. Aguardar draft iniciar
    console.log('⏳ [TESTE] 5. Aguardando draft iniciar...');
    await sleep(5000);

    // 6. Testar picks/bans
    console.log('🎯 [TESTE] 6. Testando picks e bans...');
    
    // Algumas ações de teste
    const acoes = [
      { playerId: 0, championId: 64, action: 'ban' },   // Team1 Top ban
      { playerId: 5, championId: 55, action: 'ban' },   // Team2 Top ban
      { playerId: 1, championId: 104, action: 'ban' },  // Team1 Jungle ban
      { playerId: 6, championId: 121, action: 'ban' },  // Team2 Jungle ban
      { playerId: 2, championId: 238, action: 'ban' },  // Team1 Mid ban
      { playerId: 7, championId: 91, action: 'ban' },   // Team2 Mid ban
      
      { playerId: 0, championId: 92, action: 'pick' },  // Team1 Top pick (Riven)
      { playerId: 5, championId: 23, action: 'pick' },  // Team2 Top pick (Tryndamere) ⭐ TESTE PRINCIPAL
      { playerId: 6, championId: 11, action: 'pick' },  // Team2 Jungle pick (Master Yi) ⭐ TESTE PRINCIPAL
      { playerId: 1, championId: 64, action: 'pick' },  // Team1 Jungle pick (Lee Sin)
    ];

    for (const acao of acoes) {
      console.log(`🔄 [TESTE] Testando ${acao.action} do campeão ${acao.championId} por jogador ${acao.playerId}...`);
      
      const response = await fetch(`${BACKEND_URL}/api/match/draft-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          playerId: acao.playerId,
          championId: acao.championId,
          action: acao.action
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ [TESTE] ${acao.action} realizado com sucesso:`, {
          jogador: acao.playerId,
          campeao: acao.championId,
          acao: acao.action,
          time: acao.playerId <= 4 ? 'azul' : 'vermelho'
        });
      } else {
        const errorText = await response.text();
        console.log(`❌ [TESTE] Erro ao realizar ${acao.action}: ${response.status} - ${errorText}`);
      }
      
      await sleep(2000); // 2 segundos entre ações
    }

    // 7. Verificar se dados foram salvos
    console.log('🔍 [TESTE] 7. Verificação concluída!');
    console.log('✅ [TESTE] Teste de picks do time vermelho completado');
    console.log('📝 [TESTE] Verifique os logs do backend para confirmar o salvamento');
    
  } catch (error) {
    console.error('❌ [TESTE] Erro durante o teste:', error.message);
  }
}

// Executar teste
testeCompleto();
