const axios = require('axios');

// Configuração
const API_BASE_URL = 'http://localhost:3000/api';

// Dados de teste para simular uma partida com draft
const testPreliminaryData = {
  title: 'Teste - Dados Preliminares',
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
  winnerTeam: null, // Ainda não há vencedor
  duration: 0, // Ainda não há duração
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
      win: false
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
      win: false
    }
  ]),
  riotGameId: null,
  detectedByLCU: 0,
  status: 'pending' // Status pendente
};

async function testPreliminaryData() {
  try {
    console.log('🧪 Iniciando teste de dados preliminares...');
    
    // Teste 1: Criar partida com dados preliminares (status pending)
    console.log('\n📝 Teste 1: Criando partida com dados preliminares (status pending)...');
    const createResponse = await axios.post(`${API_BASE_URL}/matches/custom`, testPreliminaryData);
    
    if (createResponse.data.success) {
      console.log('✅ Partida preliminar criada com sucesso!');
      console.log('🆔 Match ID:', createResponse.data.matchId);
      
      const matchId = createResponse.data.matchId;
      
      // Teste 2: Verificar se os dados preliminares foram salvos
      console.log('\n🔍 Teste 2: Verificando dados preliminares salvos...');
      const matchResponse = await axios.get(`${API_BASE_URL}/matches/custom/${testPreliminaryData.createdBy}?limit=1`);
      
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
          
          // Verificar se os dados estão zerados (preliminares)
          const hasZeroData = participants.every(p => 
            p.kills === 0 && p.deaths === 0 && p.assists === 0 && 
            p.champLevel === 0 && p.goldEarned === 0
          );
          
          console.log('  - Dados zerados (preliminares):', hasZeroData ? '✅' : '❌');
          
          if (participants.length > 0) {
            const firstParticipant = participants[0];
            console.log('  - Primeiro participante:', firstParticipant.summonerName, 'com', firstParticipant.championName);
            console.log('  - Lane:', firstParticipant.lane);
            console.log('  - KDA:', `${firstParticipant.kills}/${firstParticipant.deaths}/${firstParticipant.assists}`);
          }
          
          console.log('✅ Dados preliminares dos participantes salvos corretamente!');
        } else {
          console.log('⚠️ Dados dos participantes não encontrados');
        }
        
        // Teste 3: Atualizar partida com dados finais
        console.log('\n🔄 Teste 3: Atualizando partida com dados finais...');
        const updateData = {
          winnerTeam: 1, // Time azul vence
          duration: 25, // 25 minutos
          status: 'completed',
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
              kills: 6,
              deaths: 5,
              assists: 17,
              champLevel: 17,
              goldEarned: 14753,
              totalMinionsKilled: 190,
              neutralMinionsKilled: 0,
              totalDamageDealt: 175561,
              totalDamageDealtToChampions: 29864,
              totalDamageTaken: 25812,
              wardsPlaced: 7,
              wardsKilled: 5,
              visionScore: 25,
              firstBloodKill: true,
              doubleKills: 0,
              tripleKills: 0,
              quadraKills: 0,
              pentaKills: 0,
              item0: 1054,
              item1: 2421,
              item2: 3135,
              item3: 3175,
              item4: 3089,
              item5: 3100,
              item6: 3364,
              summoner1Id: 14,
              summoner2Id: 4,
              win: true
            }
          ]),
          notes: 'Partida finalizada - dados atualizados com resultado final'
        };
        
        const updateResponse = await axios.put(`${API_BASE_URL}/matches/custom/${matchId}`, updateData);
        
        if (updateResponse.data.success) {
          console.log('✅ Partida atualizada com sucesso!');
          
          // Teste 4: Verificar se os dados foram atualizados
          console.log('\n🔍 Teste 4: Verificando dados atualizados...');
          const updatedMatchResponse = await axios.get(`${API_BASE_URL}/matches/custom/${testPreliminaryData.createdBy}?limit=1`);
          
          if (updatedMatchResponse.data && updatedMatchResponse.data.length > 0) {
            const updatedMatch = updatedMatchResponse.data[0];
            console.log('📊 Dados da partida atualizada:');
            console.log('  - Status:', updatedMatch.status);
            console.log('  - Vencedor:', updatedMatch.winner_team);
            console.log('  - Duração:', updatedMatch.duration, 'minutos');
            
            if (updatedMatch.participants_data) {
              const updatedParticipants = JSON.parse(updatedMatch.participants_data);
              console.log('👥 Dados dos participantes atualizados:');
              console.log('  - Total de participantes:', updatedParticipants.length);
              
              if (updatedParticipants.length > 0) {
                const firstParticipant = updatedParticipants[0];
                console.log('  - Primeiro participante:', firstParticipant.summonerName, 'com', firstParticipant.championName);
                console.log('  - KDA atualizado:', `${firstParticipant.kills}/${firstParticipant.deaths}/${firstParticipant.assists}`);
                console.log('  - Nível:', firstParticipant.champLevel);
                console.log('  - Ouro:', firstParticipant.goldEarned);
                console.log('  - Venceu:', firstParticipant.win ? '✅' : '❌');
              }
              
              console.log('✅ Dados finais dos participantes salvos corretamente!');
            }
          }
        } else {
          console.log('❌ Falha ao atualizar partida:', updateResponse.data);
        }
        
      } else {
        console.log('❌ Partida não encontrada no histórico');
      }
      
    } else {
      console.log('❌ Falha ao criar partida preliminar:', createResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.response?.data || error.message);
  }
}

// Executar teste
testPreliminaryData(); 