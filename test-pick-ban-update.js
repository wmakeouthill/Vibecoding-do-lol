/**
 * Script para testar a atualização do pick_ban_data no banco de dados
 */

const { DatabaseManager } = require('./src/backend/database/DatabaseManager');

async function testPickBanUpdate() {
  const dbManager = new DatabaseManager();
  
  try {
    console.log('🔧 [Test] Inicializando DatabaseManager...');
    await dbManager.initialize();
    
    // Buscar uma partida de teste para atualizar
    console.log('🔍 [Test] Buscando partidas para teste...');
    const matches = await dbManager.getCustomMatches();
    
    if (matches.length === 0) {
      console.log('❌ [Test] Nenhuma partida encontrada para teste');
      return;
    }
    
    const testMatch = matches[0];
    console.log(`🎯 [Test] Usando partida ${testMatch.id} para teste`);
    
    // Dados de teste para pick/ban
    const testPickBanData = {
      picks: {
        team1: {
          top: { championId: 266, playerId: 0, playerName: 'TestPlayer1', lane: 'top', timestamp: Date.now() },
          jungle: { championId: 104, playerId: 1, playerName: 'TestPlayer2', lane: 'jungle', timestamp: Date.now() }
        },
        team2: {
          mid: { championId: 103, playerId: 5, playerName: 'TestPlayer6', lane: 'mid', timestamp: Date.now() }
        }
      },
      bans: {
        team1: [
          { championId: 555, playerId: 0, playerName: 'TestPlayer1', timestamp: Date.now() }
        ],
        team2: [
          { championId: 777, playerId: 5, playerName: 'TestPlayer6', timestamp: Date.now() }
        ]
      },
      actions: [
        { playerId: 0, playerName: 'TestPlayer1', championId: 555, action: 'ban', timestamp: Date.now() },
        { playerId: 5, playerName: 'TestPlayer6', championId: 777, action: 'ban', timestamp: Date.now() },
        { playerId: 0, playerName: 'TestPlayer1', championId: 266, action: 'pick', timestamp: Date.now() }
      ]
    };
    
    console.log('🔧 [Test] Dados de teste preparados:', {
      totalPicks: Object.keys(testPickBanData.picks.team1).length + Object.keys(testPickBanData.picks.team2).length,
      totalBans: testPickBanData.bans.team1.length + testPickBanData.bans.team2.length,
      totalActions: testPickBanData.actions.length,
      jsonLength: JSON.stringify(testPickBanData).length
    });
    
    // Verificar estado antes da atualização
    console.log('🔍 [Test] Estado antes da atualização:', {
      matchId: testMatch.id,
      hasPickBanData: !!testMatch.pick_ban_data,
      pickBanDataValue: testMatch.pick_ban_data
    });
    
    // Tentar atualizar
    console.log('🔧 [Test] Atualizando pick_ban_data...');
    await dbManager.updateCustomMatch(testMatch.id, {
      pick_ban_data: testPickBanData
    });
    
    // Verificar resultado
    console.log('🔍 [Test] Buscando resultado da atualização...');
    const updatedMatch = await dbManager.getCustomMatchById(testMatch.id);
    
    console.log('✅ [Test] Resultado:', {
      matchId: updatedMatch.id,
      hasPickBanData: !!updatedMatch.pick_ban_data,
      pickBanDataLength: updatedMatch.pick_ban_data ? updatedMatch.pick_ban_data.length : 0,
      pickBanDataIsNull: updatedMatch.pick_ban_data === null || updatedMatch.pick_ban_data === 'null',
      pickBanDataPreview: updatedMatch.pick_ban_data ? updatedMatch.pick_ban_data.substring(0, 200) : 'null'
    });
    
    // Tentar parsear os dados salvos
    if (updatedMatch.pick_ban_data && updatedMatch.pick_ban_data !== 'null') {
      try {
        const parsed = JSON.parse(updatedMatch.pick_ban_data);
        console.log('✅ [Test] Dados parseados com sucesso:', {
          hasPicks: !!parsed.picks,
          hasBans: !!parsed.bans,
          hasActions: !!parsed.actions,
          team1Picks: parsed.picks?.team1 ? Object.keys(parsed.picks.team1).length : 0,
          team2Picks: parsed.picks?.team2 ? Object.keys(parsed.picks.team2).length : 0,
          team1Bans: parsed.bans?.team1 ? parsed.bans.team1.length : 0,
          team2Bans: parsed.bans?.team2 ? parsed.bans.team2.length : 0,
          actionsCount: parsed.actions ? parsed.actions.length : 0
        });
      } catch (parseError) {
        console.error('❌ [Test] Erro ao parsear dados salvos:', parseError);
      }
    } else {
      console.error('❌ [Test] pick_ban_data ainda está nulo após atualização!');
    }
    
  } catch (error) {
    console.error('❌ [Test] Erro durante teste:', error);
  } finally {
    await dbManager.shutdown();
  }
}

// Executar teste
if (require.main === module) {
  testPickBanUpdate().catch(console.error);
}

module.exports = { testPickBanUpdate };
