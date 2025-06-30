const axios = require('axios');

// Configuração
const API_BASE_URL = 'http://localhost:3000/api';

// Dados de teste para simular uma partida com draft
const testMatchData = {
  title: 'Teste - Dados Preliminares dos Participantes',
  description: 'Teste da funcionalidade de salvar dados preliminares durante confirmação da partida',
  team1Players: [
    'TestPlayer1#TAG1',
    'TestPlayer2#TAG2', 
    'TestPlayer3#TAG3',
    'TestPlayer4#TAG4',
    'TestPlayer5#TAG5'
  ],
  team2Players: [
    'TestPlayer6#TAG6',
    'TestPlayer7#TAG7',
    'TestPlayer8#TAG8', 
    'TestPlayer9#TAG9',
    'TestPlayer10#TAG10'
  ],
  createdBy: 'TestPlayer1#TAG1',
  gameMode: 'CLASSIC',
  winnerTeam: 1, // Time azul vence
  duration: 25, // 25 minutos
  pickBanData: JSON.stringify({
    blueTeamPicks: [
      { champion: { id: 55, name: 'Katarina' } },
      { champion: { id: 950, name: 'Malphite' } },
      { champion: { id: 79, name: 'Gragas' } },
      { champion: { id: 145, name: 'Kai\'Sa' } },
      { champion: { id: 412, name: 'Thresh' } }
    ],
    redTeamPicks: [
      { champion: { id: 86, name: 'Garen' } },
      { champion: { id: 8, name: 'Vladimir' } },
      { champion: { id: 166, name: 'Akshan' } },
      { champion: { id: 121, name: 'Kha\'Zix' } },
      { champion: { id: 16, name: 'Soraka' } }
    ],
    blueTeamBans: [
      { champion: { id: 157, name: 'Yasuo' } },
      { champion: { id: 238, name: 'Zed' } },
      { champion: { id: 64, name: 'Lee Sin' } },
      { champion: { id: 103, name: 'Ahri' } },
      { champion: { id: 245, name: 'Ekko' } }
    ],
    redTeamBans: [
      { champion: { id: 266, name: 'Aatrox' } },
      { champion: { id: 141, name: 'Kayn' } },
      { champion: { id: 202, name: 'Jhin' } },
      { champion: { id: 350, name: 'Yuumi' } },
      { champion: { id: 555, name: 'Pyke' } }
    ]
  }),
  participantsData: JSON.stringify([
    {
      participantId: 1,
      teamId: 100,
      championId: 55,
      championName: 'Katarina',
      summonerName: 'TestPlayer1#TAG1',
      riotIdGameName: 'TestPlayer1',
      riotIdTagline: 'TAG1',
      lane: 'MID',
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
      win: true
    },
    {
      participantId: 2,
      teamId: 100,
      championId: 950,
      championName: 'Malphite',
      summonerName: 'TestPlayer2#TAG2',
      riotIdGameName: 'TestPlayer2',
      riotIdTagline: 'TAG2',
      lane: 'TOP',
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
      win: true
    },
    {
      participantId: 3,
      teamId: 100,
      championId: 79,
      championName: 'Gragas',
      summonerName: 'TestPlayer3#TAG3',
      riotIdGameName: 'TestPlayer3',
      riotIdTagline: 'TAG3',
      lane: 'JUNGLE',
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
      win: true
    },
    {
      participantId: 4,
      teamId: 100,
      championId: 145,
      championName: 'Kai\'Sa',
      summonerName: 'TestPlayer4#TAG4',
      riotIdGameName: 'TestPlayer4',
      riotIdTagline: 'TAG4',
      lane: 'ADC',
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
      win: true
    },
    {
      participantId: 5,
      teamId: 100,
      championId: 412,
      championName: 'Thresh',
      summonerName: 'TestPlayer5#TAG5',
      riotIdGameName: 'TestPlayer5',
      riotIdTagline: 'TAG5',
      lane: 'SUPPORT',
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
      win: true
    },
    {
      participantId: 6,
      teamId: 200,
      championId: 86,
      championName: 'Garen',
      summonerName: 'TestPlayer6#TAG6',
      riotIdGameName: 'TestPlayer6',
      riotIdTagline: 'TAG6',
      lane: 'TOP',
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
    },
    {
      participantId: 7,
      teamId: 200,
      championId: 8,
      championName: 'Vladimir',
      summonerName: 'TestPlayer7#TAG7',
      riotIdGameName: 'TestPlayer7',
      riotIdTagline: 'TAG7',
      lane: 'MID',
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
    },
    {
      participantId: 8,
      teamId: 200,
      championId: 166,
      championName: 'Akshan',
      summonerName: 'TestPlayer8#TAG8',
      riotIdGameName: 'TestPlayer8',
      riotIdTagline: 'TAG8',
      lane: 'JUNGLE',
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
    },
    {
      participantId: 9,
      teamId: 200,
      championId: 121,
      championName: 'Kha\'Zix',
      summonerName: 'TestPlayer9#TAG9',
      riotIdGameName: 'TestPlayer9',
      riotIdTagline: 'TAG9',
      lane: 'ADC',
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
    },
    {
      participantId: 10,
      teamId: 200,
      championId: 16,
      championName: 'Soraka',
      summonerName: 'TestPlayer10#TAG10',
      riotIdGameName: 'TestPlayer10',
      riotIdTagline: 'TAG10',
      lane: 'SUPPORT',
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
    }
  ]),
  riotGameId: null,
  detectedByLCU: 0,
  status: 'completed'
};

async function testParticipantsData() {
  try {
    console.log('🧪 Iniciando teste de dados preliminares dos participantes...');
    
    // Teste 1: Criar partida com dados preliminares
    console.log('\n📝 Teste 1: Criando partida com dados preliminares...');
    const createResponse = await axios.post(`${API_BASE_URL}/matches/custom`, testMatchData);
    
    if (createResponse.data.success) {
      console.log('✅ Partida criada com sucesso!');
      console.log('🆔 Match ID:', createResponse.data.matchId);
      
      // Teste 2: Verificar se os dados foram salvos corretamente
      console.log('\n🔍 Teste 2: Verificando dados salvos...');
      const matchResponse = await axios.get(`${API_BASE_URL}/matches/custom/${testMatchData.createdBy}?limit=1`);
      
      if (matchResponse.data && matchResponse.data.length > 0) {
        const savedMatch = matchResponse.data[0];
        console.log('✅ Partida encontrada no histórico!');
        console.log('📊 Dados da partida:');
        console.log('  - ID:', savedMatch.id);
        console.log('  - Título:', savedMatch.title);
        console.log('  - Status:', savedMatch.status);
        console.log('  - Vencedor:', savedMatch.winner_team);
        console.log('  - Duração:', savedMatch.duration, 'minutos');
        
        // Verificar dados dos participantes
        if (savedMatch.participants_data) {
          const participants = JSON.parse(savedMatch.participants_data);
          console.log('👥 Dados dos participantes:');
          console.log('  - Total de participantes:', participants.length);
          
          // Verificar alguns participantes específicos
          const blueTeamParticipants = participants.filter(p => p.teamId === 100);
          const redTeamParticipants = participants.filter(p => p.teamId === 200);
          
          console.log('  - Time Azul:', blueTeamParticipants.length, 'jogadores');
          console.log('  - Time Vermelho:', redTeamParticipants.length, 'jogadores');
          
          // Mostrar detalhes do primeiro participante de cada time
          if (blueTeamParticipants.length > 0) {
            const firstBlue = blueTeamParticipants[0];
            console.log('  - Primeiro jogador azul:', firstBlue.summonerName, 'com', firstBlue.championName);
          }
          
          if (redTeamParticipants.length > 0) {
            const firstRed = redTeamParticipants[0];
            console.log('  - Primeiro jogador vermelho:', firstRed.summonerName, 'com', firstRed.championName);
          }
          
          console.log('✅ Dados preliminares dos participantes salvos corretamente!');
        } else {
          console.log('⚠️ Dados dos participantes não encontrados');
        }
        
        // Verificar dados do pick/ban
        if (savedMatch.pick_ban_data) {
          const pickBanData = JSON.parse(savedMatch.pick_ban_data);
          console.log('🎯 Dados do Pick/Ban:');
          console.log('  - Picks do time azul:', pickBanData.blueTeamPicks?.length || 0);
          console.log('  - Picks do time vermelho:', pickBanData.redTeamPicks?.length || 0);
          console.log('  - Bans do time azul:', pickBanData.blueTeamBans?.length || 0);
          console.log('  - Bans do time vermelho:', pickBanData.redTeamBans?.length || 0);
        }
        
      } else {
        console.log('❌ Partida não encontrada no histórico');
      }
      
    } else {
      console.log('❌ Falha ao criar partida:', createResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.response?.data || error.message);
  }
}

// Executar teste
testParticipantsData(); 