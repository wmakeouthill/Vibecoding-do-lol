const axios = require('axios');

// Dados simulados de uma partida real do LCU
const mockLCUMatchData = {
  gameId: 3108985999,
  gameMode: 'CLASSIC',
  gameDuration: 1800000, // 30 minutos em milissegundos
  endOfGameResult: 'GameComplete',
  teams: [
    { teamId: 100, win: true },
    { teamId: 200, win: false }
  ],
  participants: [
    // Time 1 (vencedor)
    {
      participantId: 1,
      teamId: 100,
      championId: 55,
      championName: 'Katarina',
      kills: 12,
      deaths: 3,
      assists: 8,
      champLevel: 18,
      goldEarned: 18500,
      totalMinionsKilled: 180,
      neutralMinionsKilled: 25,
      totalDamageDealt: 120000,
      totalDamageDealtToChampions: 28000,
      totalDamageTaken: 22000,
      wardsPlaced: 12,
      wardsKilled: 5,
      visionScore: 35,
      firstBloodKill: true,
      doubleKills: 2,
      tripleKills: 1,
      quadraKills: 0,
      pentaKills: 0,
      item0: 3031, // Infinity Edge
      item1: 3006, // Berserker's Greaves
      item2: 3153, // Blade of the Ruined King
      item3: 3072, // Bloodthirster
      item4: 3026, // Guardian Angel
      item5: 3094, // Rapid Firecannon
      summoner1Id: 4,  // Flash
      summoner2Id: 12, // Teleport
      win: true
    },
    {
      participantId: 2,
      teamId: 100,
      championId: 518,
      championName: 'Naafiri',
      kills: 8,
      deaths: 4,
      assists: 15,
      champLevel: 16,
      goldEarned: 15200,
      totalMinionsKilled: 165,
      neutralMinionsKilled: 18,
      totalDamageDealt: 95000,
      totalDamageDealtToChampions: 24000,
      totalDamageTaken: 18000,
      wardsPlaced: 8,
      wardsKilled: 3,
      visionScore: 28,
      firstBloodKill: false,
      doubleKills: 1,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 3142, // Youmuu's Ghostblade
      item1: 3158, // Ionian Boots
      item2: 3814, // Edge of Night
      item3: 3156, // Maw of Malmortius
      item4: 3071, // Black Cleaver
      item5: 3139, // Mercurial Scimitar
      summoner1Id: 4,  // Flash
      summoner2Id: 14, // Ignite
      win: true
    },
    // Adicionar mais 3 jogadores no time 1...
    {
      participantId: 3,
      teamId: 100,
      championId: 79,
      championName: 'Gragas',
      kills: 2,
      deaths: 5,
      assists: 18,
      champLevel: 15,
      goldEarned: 12800,
      totalMinionsKilled: 45,
      neutralMinionsKilled: 120,
      totalDamageDealt: 78000,
      totalDamageDealtToChampions: 18000,
      totalDamageTaken: 35000,
      wardsPlaced: 15,
      wardsKilled: 8,
      visionScore: 45,
      firstBloodKill: false,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 1410, // Jungle item
      item1: 3020, // Sorcerer's Shoes
      item2: 3152, // Hextech Rocketbelt
      item3: 3135, // Void Staff
      item4: 3165, // Morellonomicon
      item5: 3157, // Zhonya's Hourglass
      summoner1Id: 4,  // Flash
      summoner2Id: 11, // Smite
      win: true
    },
    {
      participantId: 4,
      teamId: 100,
      championId: 145,
      championName: 'Kai\'Sa',
      kills: 14,
      deaths: 2,
      assists: 6,
      champLevel: 18,
      goldEarned: 19200,
      totalMinionsKilled: 220,
      neutralMinionsKilled: 8,
      totalDamageDealt: 135000,
      totalDamageDealtToChampions: 32000,
      totalDamageTaken: 15000,
      wardsPlaced: 6,
      wardsKilled: 2,
      visionScore: 22,
      firstBloodKill: false,
      doubleKills: 3,
      tripleKills: 1,
      quadraKills: 1,
      pentaKills: 0,
      item0: 3031, // Infinity Edge
      item1: 3006, // Berserker's Greaves
      item2: 3085, // Runaan's Hurricane
      item3: 3153, // Blade of the Ruined King
      item4: 3026, // Guardian Angel
      item5: 3033, // Mortal Reminder
      summoner1Id: 4,  // Flash
      summoner2Id: 7,  // Heal
      win: true
    },
    {
      participantId: 5,
      teamId: 100,
      championId: 412,
      championName: 'Thresh',
      kills: 1,
      deaths: 6,
      assists: 22,
      champLevel: 14,
      goldEarned: 9800,
      totalMinionsKilled: 35,
      neutralMinionsKilled: 0,
      totalDamageDealt: 45000,
      totalDamageDealtToChampions: 12000,
      totalDamageTaken: 28000,
      wardsPlaced: 25,
      wardsKilled: 12,
      visionScore: 68,
      firstBloodKill: false,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 3850, // Support item
      item1: 3158, // Ionian Boots
      item2: 3107, // Redemption
      item3: 3109, // Knight's Vow
      item4: 3190, // Locket of the Iron Solari
      item5: 3117, // Mobility Boots (upgrade)
      summoner1Id: 4,  // Flash
      summoner2Id: 14, // Ignite
      win: true
    },    // Time 2 (perdedor) - 5 jogadores
    {
      participantId: 6,
      teamId: 200,
      championId: 86,
      championName: 'Garen',
      kills: 5,
      deaths: 8,
      assists: 4,
      champLevel: 16,
      goldEarned: 13200,
      totalMinionsKilled: 185,
      neutralMinionsKilled: 12,
      totalDamageDealt: 98000,
      totalDamageDealtToChampions: 22000,
      totalDamageTaken: 32000,
      wardsPlaced: 8,
      wardsKilled: 3,
      visionScore: 25,
      firstBloodKill: false,
      doubleKills: 1,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 3071, // Black Cleaver
      item1: 3020, // Sorcerer's Shoes
      item2: 3748, // Titanic Hydra
      item3: 3065, // Spirit Visage
      item4: 3143, // Randuin's Omen
      item5: 3075, // Thornmail
      summoner1Id: 4,  // Flash
      summoner2Id: 12, // Teleport
      win: false
    },
    {
      participantId: 7,
      teamId: 200,
      championId: 64,
      championName: 'Lee Sin',
      kills: 3,
      deaths: 9,
      assists: 6,
      champLevel: 15,
      goldEarned: 11500,
      totalMinionsKilled: 45,
      neutralMinionsKilled: 89,
      totalDamageDealt: 85000,
      totalDamageDealtToChampions: 18500,
      totalDamageTaken: 28000,
      wardsPlaced: 12,
      wardsKilled: 6,
      visionScore: 32,
      firstBloodKill: false,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 1400, // Jungle item
      item1: 3111, // Mercury's Treads
      item2: 3142, // Youmuu's Ghostblade
      item3: 3814, // Edge of Night
      item4: 3156, // Maw of Malmortius
      item5: 3026, // Guardian Angel
      summoner1Id: 4,  // Flash
      summoner2Id: 11, // Smite
      win: false
    },
    {
      participantId: 8,
      teamId: 200,
      championId: 134,
      championName: 'Syndra',
      kills: 4,
      deaths: 7,
      assists: 5,
      champLevel: 16,
      goldEarned: 12800,
      totalMinionsKilled: 156,
      neutralMinionsKilled: 8,
      totalDamageDealt: 92000,
      totalDamageDealtToChampions: 21000,
      totalDamageTaken: 19000,
      wardsPlaced: 9,
      wardsKilled: 4,
      visionScore: 28,
      firstBloodKill: false,
      doubleKills: 1,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 3152, // Hextech Rocketbelt
      item1: 3020, // Sorcerer's Shoes
      item2: 3135, // Void Staff
      item3: 3157, // Zhonya's Hourglass
      item4: 3165, // Morellonomicon
      item5: 3089, // Rabadon's Deathcap
      summoner1Id: 4,  // Flash
      summoner2Id: 14, // Ignite
      win: false
    },
    {
      participantId: 9,
      teamId: 200,
      championId: 22,
      championName: 'Ashe',
      kills: 2,
      deaths: 11,
      assists: 7,
      champLevel: 15,
      goldEarned: 10800,
      totalMinionsKilled: 142,
      neutralMinionsKilled: 5,
      totalDamageDealt: 78000,
      totalDamageDealtToChampions: 15500,
      totalDamageTaken: 24000,
      wardsPlaced: 7,
      wardsKilled: 2,
      visionScore: 18,
      firstBloodKill: false,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 3031, // Infinity Edge
      item1: 3006, // Berserker's Greaves
      item2: 3094, // Rapid Firecannon
      item3: 3072, // Bloodthirster
      item4: 3033, // Mortal Reminder
      item5: 3026, // Guardian Angel
      summoner1Id: 4,  // Flash
      summoner2Id: 7,  // Heal
      win: false
    },
    {
      participantId: 10,
      teamId: 200,
      championId: 25,
      championName: 'Morgana',
      kills: 1,
      deaths: 8,
      assists: 9,
      champLevel: 13,
      goldEarned: 8900,
      totalMinionsKilled: 28,
      neutralMinionsKilled: 0,
      totalDamageDealt: 42000,
      totalDamageDealtToChampions: 9500,
      totalDamageTaken: 18500,
      wardsPlaced: 18,
      wardsKilled: 9,
      visionScore: 41,
      firstBloodKill: false,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      item0: 3850, // Support item
      item1: 3158, // Ionian Boots
      item2: 3107, // Redemption
      item3: 3222, // Mikael's Blessing
      item4: 3504, // Ardent Censer
      item5: 3174, // Athene's Unholy Grail
      summoner1Id: 4,  // Flash
      summoner2Id: 14, // Ignite
      win: false
    }
  ],  participantIdentities: [
    {
      participantId: 1,
      player: {
        gameName: 'Let me Reset',
        tagLine: 'KAT',
        summonerName: 'Let me Reset#KAT'
      }
    },
    {
      participantId: 2,
      player: {
        gameName: 'popcorn seller',
        tagLine: 'coup',
        summonerName: 'popcorn seller#coup'
      }
    },
    {
      participantId: 3,
      player: {
        gameName: 'igago',
        tagLine: 'br1',
        summonerName: 'igago#br1'
      }
    },
    {
      participantId: 4,
      player: {
        gameName: 'Arkles',
        tagLine: 'BR1',
        summonerName: 'Arkles#BR1'
      }
    },
    {
      participantId: 5,
      player: {
        gameName: 'StJhinmy',
        tagLine: 'br1',
        summonerName: 'StJhinmy#br1'
      }
    },
    {
      participantId: 6,
      player: {
        gameName: 'ChrisRyu',
        tagLine: 'br1',
        summonerName: 'ChrisRyu#br1'
      }
    },
    {
      participantId: 7,
      player: {
        gameName: 'JungleKing',
        tagLine: 'br1',
        summonerName: 'JungleKing#br1'
      }
    },
    {
      participantId: 8,
      player: {
        gameName: 'MidLaner',
        tagLine: 'br1',
        summonerName: 'MidLaner#br1'
      }
    },
    {
      participantId: 9,
      player: {
        gameName: 'ADCPlayer',
        tagLine: 'br1',
        summonerName: 'ADCPlayer#br1'
      }
    },
    {
      participantId: 10,
      player: {
        gameName: 'SupportMain',
        tagLine: 'br1',
        summonerName: 'SupportMain#br1'
      }
    }
  ]
};

async function testCreateLCUMatch() {
  try {
    console.log('🧪 [TESTE] Criando partida LCU com dados reais...');
    
    const response = await axios.post('http://localhost:3000/api/test/create-lcu-based-match', {
      lcuMatchData: mockLCUMatchData,
      playerIdentifier: 'popcorn seller#coup'
    });
    
    console.log('✅ [TESTE] Resposta do servidor:', response.data);
    
    // Aguardar um pouco e verificar se os dados foram salvos
    setTimeout(async () => {
      console.log('\n🔍 [TESTE] Verificando se os dados foram salvos...');
      const Database = require('sqlite3').Database;
      const path = require('path');
      const os = require('os');
      
      const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db');
      const db = new Database(dbPath);
      
      db.get('SELECT * FROM custom_matches ORDER BY created_at DESC LIMIT 1', (err, row) => {
        if (err) {
          console.error('❌ [TESTE] Erro ao buscar partida:', err);
          return;
        }
        
        console.log('📋 [TESTE] Última partida criada:');
        console.log('  ID:', row.id);
        console.log('  Título:', row.title);
        console.log('  Status:', row.status);
        console.log('  Riot Game ID:', row.riot_game_id);
        console.log('  Detected by LCU:', row.detected_by_lcu);
        console.log('  Tem participants_data:', !!row.participants_data);
        console.log('  Tem pick_ban_data:', !!row.pick_ban_data);
        
        if (row.participants_data) {
          try {
            const participantsData = JSON.parse(row.participants_data);
            console.log('  ✅ Participants data encontrado:', participantsData.length, 'jogadores');
            console.log('  📊 Primeiro jogador:', {
              nome: participantsData[0].summonerName,
              champion: participantsData[0].championName,
              KDA: `${participantsData[0].kills}/${participantsData[0].deaths}/${participantsData[0].assists}`,
              itens: [participantsData[0].item0, participantsData[0].item1, participantsData[0].item2]
            });
          } catch (e) {
            console.log('  ❌ Erro ao fazer parse:', e.message);
          }
        } else {
          console.log('  ⚠️ Nenhum dado de participantes encontrado');
        }
        
        db.close();
      });
    }, 2000);
    
  } catch (error) {
    console.error('❌ [TESTE] Erro na requisição:', error.response?.data || error.message);
  }
}

// Aguardar o servidor iniciar antes de testar
setTimeout(testCreateLCUMatch, 5000);
