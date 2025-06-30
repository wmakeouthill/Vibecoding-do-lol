// Test script para verificar se os dados preliminares estão sendo salvos corretamente
const axios = require('axios');

// Simular dados de uma partida com campeões mapeados
const mockGameData = {
  team1: [
    { name: 'Bot3', champion: { id: '1', name: 'Annie' }, championId: '1', hasChampion: true, summonerName: 'Bot3', lane: 'top' },
    { name: 'Bot7', champion: { id: '4', name: 'Twisted Fate' }, championId: '4', hasChampion: true, summonerName: 'Bot7', lane: 'jungle' },
    { name: 'Bot5', champion: { id: '5', name: 'Xin Zhao' }, championId: '5', hasChampion: true, summonerName: 'Bot5', lane: 'mid' },
    { name: 'Bot8', champion: { id: '8', name: 'Sion' }, championId: '8', hasChampion: true, summonerName: 'Bot8', lane: 'bot' },
    { name: 'Bot9', champion: { id: '9', name: 'Janna' }, championId: '9', hasChampion: true, summonerName: 'Bot9', lane: 'support' }
  ],
  team2: [
    { name: 'Bot2', champion: { id: '2', name: 'Olaf' }, championId: '2', hasChampion: true, summonerName: 'Bot2', lane: 'top' },
    { name: 'Bot4', champion: { id: '3', name: 'Galio' }, championId: '3', hasChampion: true, summonerName: 'Bot4', lane: 'jungle' },
    { name: 'Bot6', champion: { id: '6', name: 'Urgot' }, championId: '6', hasChampion: true, summonerName: 'Bot6', lane: 'mid' },
    { name: 'Bot1', champion: { id: '7', name: 'Ryze' }, championId: '7', hasChampion: true, summonerName: 'Bot1', lane: 'bot' },
    { name: 'popcorn seller#coup', champion: { id: '10', name: 'Malphite' }, championId: '10', hasChampion: true, summonerName: 'popcorn seller#coup', lane: 'support' }
  ]
};

// Função para criar dados preliminares (simulando o método do frontend)
function createPreliminaryParticipantsData(gameData) {
  console.log('🎯 [createPreliminaryParticipantsData] Criando dados preliminares dos participantes');
  console.log('📊 Game data teams antes de criar participantes:');
  console.log('Team1:', gameData.team1.map(p => ({ name: p.name, champion: p.champion?.name, championId: p.championId, hasChampion: p.hasChampion })));
  console.log('Team2:', gameData.team2.map(p => ({ name: p.name, champion: p.champion?.name, championId: p.championId, hasChampion: p.hasChampion })));

  const participants = [];

  // Time 1 (Blue - teamId: 100)
  gameData.team1.forEach((player, index) => {
    const participant = {
      participantId: index + 1,
      teamId: 100,
      championId: player.championId || 0,
      championName: player.champion?.name || 'Unknown',
      summonerName: player.summonerName || player.name,
      lane: player.lane || 'unknown',
      kills: 0,
      deaths: 0,
      assists: 0,
      champLevel: 0,
      goldEarned: 0,
      totalMinionsKilled: 0,
      neutralMinionsKilled: 0,
      totalDamageDealt: 0,
      totalDamageDealtToChampions: 0,
      totalDamageTaken: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      visionScore: 0,
      firstBloodKill: false,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 0,
      item1: 0,
      item2: 0,
      item3: 0,
      item4: 0,
      item5: 0,
      item6: 0,
      summoner1Id: 0,
      summoner2Id: 0,
      win: false
    };
    participants.push(participant);
    console.log(`👤 [Team1] ${player.name}: championId=${participant.championId}, championName="${participant.championName}"`);
  });

  // Time 2 (Red - teamId: 200)
  gameData.team2.forEach((player, index) => {
    const participant = {
      participantId: gameData.team1.length + index + 1,
      teamId: 200,
      championId: player.championId || 0,
      championName: player.champion?.name || 'Unknown',
      summonerName: player.summonerName || player.name,
      lane: player.lane || 'unknown',
      kills: 0,
      deaths: 0,
      assists: 0,
      champLevel: 0,
      goldEarned: 0,
      totalMinionsKilled: 0,
      neutralMinionsKilled: 0,
      totalDamageDealt: 0,
      totalDamageDealtToChampions: 0,
      totalDamageTaken: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      visionScore: 0,
      firstBloodKill: false,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 0,
      item1: 0,
      item2: 0,
      item3: 0,
      item4: 0,
      item5: 0,
      item6: 0,
      summoner1Id: 0,
      summoner2Id: 0,
      win: false
    };
    participants.push(participant);
    console.log(`👤 [Team2] ${player.name}: championId=${participant.championId}, championName="${participant.championName}"`);
  });

  console.log('\n📊 Dados preliminares criados:', participants.length, 'participantes');
  console.log('📊 Resumo dos campeões:', participants.map(p => `${p.summonerName}: ${p.championName} (ID: ${p.championId})`));

  return participants;
}

// Função para salvar no backend (simulando a chamada da API)
async function saveCustomMatch(participantsData) {
  try {
    const matchData = {
      title: `Teste - Partida Customizada ${new Date().toLocaleDateString()}`,
      description: `Teste de dados preliminares com campeões`,
      team1Players: mockGameData.team1.map(p => p.summonerName),
      team2Players: mockGameData.team2.map(p => p.summonerName),
      createdBy: 'TestUser',
      gameMode: 'CLASSIC',
      participantsData,
      status: 'pending'
    };

    console.log('\n📤 Enviando dados para o backend...');
    console.log('📤 Match data:', JSON.stringify(matchData, null, 2));

    // Simular chamada para o backend (comentado para não executar)
    // const response = await axios.post('http://localhost:3000/api/custom-matches', matchData);
    // console.log('✅ Resposta do backend:', response.data);

    console.log('✅ Simulação de salvamento concluída');
    return { success: true, matchId: 999, message: 'Partida personalizada criada com sucesso' };
  } catch (error) {
    console.error('❌ Erro ao salvar:', error);
    return { success: false, error: error.message };
  }
}

// Executar teste
async function runTest() {
  console.log('🧪 Testando salvamento de dados preliminares com campeões...\n');
  
  // Criar dados preliminares
  const participantsData = createPreliminaryParticipantsData(mockGameData);
  
  // Salvar no backend
  const result = await saveCustomMatch(participantsData);
  
  console.log('\n🎯 Resultado do teste:', result);
  console.log('\n✅ Teste concluído!');
}

runTest(); 