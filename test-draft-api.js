// Teste simples de pick/ban via REST API
const axios = require('axios');

const API_BASE = 'http://localhost:3001';

async function testDraftDataPersistence() {
  console.log('🧪 [Test] Testando persistência de dados do draft via API...');
  
  try {
    // 1. Verificar se servidor está rodando
    console.log('🔍 [Test] Verificando servidor...');
    const healthCheck = await axios.get(`${API_BASE}/health`).catch(() => null);
    
    if (!healthCheck) {
      console.log('❌ [Test] Servidor não está rodando. Inicie o servidor primeiro.');
      return;
    }
    
    console.log('✅ [Test] Servidor está rodando');
    
    // 2. Buscar uma partida em status 'draft'
    console.log('🔍 [Test] Buscando partidas em draft...');
    const matchesResponse = await axios.get(`${API_BASE}/api/matches/status/draft`);
    const draftMatches = matchesResponse.data;
    
    console.log(`📋 [Test] Encontradas ${draftMatches.length} partidas em draft`);
    
    if (draftMatches.length === 0) {
      console.log('⚠️ [Test] Nenhuma partida em draft encontrada. Crie uma partida primeiro.');
      return;
    }
    
    const matchId = draftMatches[0].id;
    console.log(`🎯 [Test] Testando partida ${matchId}`);
    
    // 3. Verificar dados iniciais
    console.log('📊 [Test] Verificando dados iniciais...');
    const initialMatch = await axios.get(`${API_BASE}/api/matches/${matchId}`);
    const initialData = initialMatch.data;
    
    console.log('📋 [Test] Dados iniciais:', {
      matchId,
      status: initialData.status,
      hasDraftData: !!initialData.draft_data,
      hasPickBanData: !!initialData.pick_ban_data
    });
    
    if (initialData.draft_data) {
      const draftData = typeof initialData.draft_data === 'string' 
        ? JSON.parse(initialData.draft_data) 
        : initialData.draft_data;
      
      console.log('👥 [Test] Times do draft:', {
        team1Count: draftData.team1?.length || 0,
        team2Count: draftData.team2?.length || 0,
        team1Players: draftData.team1?.map(p => ({ 
          name: p.summonerName, 
          lane: p.assignedLane, 
          teamIndex: p.teamIndex,
          championId: p.championId 
        })) || [],
        team2Players: draftData.team2?.map(p => ({ 
          name: p.summonerName, 
          lane: p.assignedLane, 
          teamIndex: p.teamIndex,
          championId: p.championId 
        })) || []
      });
    }
    
    // 4. Simular ação de pick
    console.log('🎮 [Test] Simulando pick...');
    
    // Assumir que teamIndex 0 é primeiro jogador do team1
    const pickPayload = {
      matchId,
      playerId: 0, // teamIndex
      championId: 1, // Annie
      action: 'pick'
    };
    
    console.log('📝 [Test] Enviando pick:', pickPayload);
    
    const pickResponse = await axios.post(`${API_BASE}/api/draft/action`, pickPayload);
    console.log('✅ [Test] Pick enviado:', pickResponse.status);
    
    // 5. Verificar se dados foram salvos
    console.log('🔍 [Test] Verificando dados após pick...');
    
    // Aguardar um pouco para garantir que foi salvo
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const updatedMatch = await axios.get(`${API_BASE}/api/matches/${matchId}`);
    const updatedData = updatedMatch.data;
    
    console.log('📊 [Test] Dados após pick:', {
      hasPickBanData: !!updatedData.pick_ban_data,
      hasDraftData: !!updatedData.draft_data
    });
    
    if (updatedData.pick_ban_data) {
      const pickBanData = typeof updatedData.pick_ban_data === 'string' 
        ? JSON.parse(updatedData.pick_ban_data) 
        : updatedData.pick_ban_data;
      
      console.log('🎯 [Test] Pick/Ban data:', {
        hasPicksTeam1: !!pickBanData.picks?.team1,
        hasPicksTeam2: !!pickBanData.picks?.team2,
        picksTeam1Count: pickBanData.picks?.team1 ? Object.keys(pickBanData.picks.team1).length : 0,
        picksTeam2Count: pickBanData.picks?.team2 ? Object.keys(pickBanData.picks.team2).length : 0,
        totalActions: pickBanData.actions?.length || 0
      });
      
      if (pickBanData.picks?.team1) {
        console.log('👥 [Test] Picks team1:', pickBanData.picks.team1);
      }
    }
    
    if (updatedData.draft_data) {
      const draftData = typeof updatedData.draft_data === 'string' 
        ? JSON.parse(updatedData.draft_data) 
        : updatedData.draft_data;
      
      const playersWithChampions = [
        ...(draftData.team1 || []),
        ...(draftData.team2 || [])
      ].filter(p => p.championId);
      
      console.log('🏆 [Test] Jogadores com campeões no draft_data:', playersWithChampions.map(p => ({
        name: p.summonerName,
        lane: p.assignedLane,
        teamIndex: p.teamIndex,
        championId: p.championId
      })));
    }
    
    // 6. Testar pick para time vermelho
    console.log('🎮 [Test] Simulando pick para time vermelho...');
    
    const redPickPayload = {
      matchId,
      playerId: 5, // teamIndex para team2
      championId: 2, // Olaf
      action: 'pick'
    };
    
    console.log('📝 [Test] Enviando pick vermelho:', redPickPayload);
    
    const redPickResponse = await axios.post(`${API_BASE}/api/draft/action`, redPickPayload);
    console.log('✅ [Test] Pick vermelho enviado:', redPickResponse.status);
    
    // Aguardar e verificar
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const finalMatch = await axios.get(`${API_BASE}/api/matches/${matchId}`);
    const finalData = finalMatch.data;
    
    if (finalData.draft_data) {
      const draftData = typeof finalData.draft_data === 'string' 
        ? JSON.parse(finalData.draft_data) 
        : finalData.draft_data;
      
      const playersWithChampions = [
        ...(draftData.team1 || []),
        ...(draftData.team2 || [])
      ].filter(p => p.championId);
      
      console.log('🏆 [Test] Estado final - Jogadores com campeões:', playersWithChampions.map(p => ({
        name: p.summonerName,
        lane: p.assignedLane,
        teamIndex: p.teamIndex,
        championId: p.championId,
        team: p.teamIndex <= 4 ? 'team1' : 'team2'
      })));
      
      if (playersWithChampions.length >= 2) {
        console.log('✅ [Test] SUCESSO: draft_data está sendo atualizado com campeões!');
      } else {
        console.log('❌ [Test] FALHA: draft_data não está sendo atualizado corretamente');
      }
    }
    
    if (finalData.pick_ban_data) {
      const pickBanData = typeof finalData.pick_ban_data === 'string' 
        ? JSON.parse(finalData.pick_ban_data) 
        : finalData.pick_ban_data;
      
      const totalPicks = Object.keys(pickBanData.picks?.team1 || {}).length + 
                        Object.keys(pickBanData.picks?.team2 || {}).length;
      
      console.log('🎯 [Test] Estado final - Pick/Ban data:', {
        totalPicks,
        totalActions: pickBanData.actions?.length || 0,
        isNotNull: pickBanData !== null
      });
      
      if (totalPicks >= 2) {
        console.log('✅ [Test] SUCESSO: pick_ban_data está sendo salvo corretamente!');
      } else {
        console.log('❌ [Test] FALHA: pick_ban_data não está sendo salvo corretamente');
      }
    } else {
      console.log('❌ [Test] FALHA: pick_ban_data está retornando null!');
    }
    
  } catch (error) {
    console.error('❌ [Test] Erro:', error.response?.data || error.message);
  }
}

// Executar teste
testDraftDataPersistence().catch(console.error);
