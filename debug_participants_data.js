const Database = require('sqlite3').Database;
const path = require('path');
const os = require('os');

// Path to the database (using the same path as the backend)
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db');

console.log('📂 Caminho do banco:', dbPath);

const db = new Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar com o banco:', err);
    return;
  }
  
  console.log('✅ Conectado ao banco de dados SQLite');
  
  // Verificar se custom_matches existe e buscar todas as partidas
  db.all('SELECT * FROM custom_matches ORDER BY created_at DESC LIMIT 3', (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar partidas:', err);
      return;
    }
    
    console.log('🎮 Últimas 3 partidas customizadas:');
    
    if (rows.length === 0) {
      console.log('⚠️ Nenhuma partida encontrada na tabela custom_matches');
    } else {
      rows.forEach((match, index) => {
        console.log(`\n📋 =============== PARTIDA ${index + 1} ===============`);
        console.log('🆔 ID:', match.id);
        console.log('📝 Título:', match.title);
        console.log('📊 Status:', match.status);
        console.log('🏆 Vencedor:', match.winner_team);
        console.log('⏱️ Duração:', match.duration);
        console.log('🎮 Riot Game ID:', match.riot_game_id);
        console.log('🔗 Detectado pelo LCU:', match.detected_by_lcu);
        console.log('📅 Criado em:', match.created_at);
        console.log('✅ Completado em:', match.completed_at);
        
        // Parse team players
        try {
          const team1 = JSON.parse(match.team1_players || '[]');
          const team2 = JSON.parse(match.team2_players || '[]');
          console.log('👥 Time 1 (' + team1.length + ' jogadores):', team1);
          console.log('👥 Time 2 (' + team2.length + ' jogadores):', team2);
        } catch (e) {
          console.log('❌ Times: erro ao fazer parse', e.message);
        }
        
        // Parse pick ban data
        console.log('\n🎯 DADOS DE PICK/BAN:');
        if (match.pick_ban_data) {
          try {
            const pickBanData = JSON.parse(match.pick_ban_data);
            console.log('✅ Pick/Ban data encontrado:', {
              hasTeam1Picks: !!pickBanData.team1Picks,
              hasTeam2Picks: !!pickBanData.team2Picks,
              team1PicksCount: pickBanData.team1Picks ? pickBanData.team1Picks.length : 0,
              team2PicksCount: pickBanData.team2Picks ? pickBanData.team2Picks.length : 0,
              isReal: pickBanData.isReal,
              source: pickBanData.source
            });
            
            if (pickBanData.team1Picks && pickBanData.team1Picks.length > 0) {
              console.log('🔵 Team 1 Picks:', pickBanData.team1Picks.map(p => `${p.champion} (${p.player})`));
            }
            if (pickBanData.team2Picks && pickBanData.team2Picks.length > 0) {
              console.log('🔴 Team 2 Picks:', pickBanData.team2Picks.map(p => `${p.champion} (${p.player})`));
            }
          } catch (e) {
            console.log('❌ Erro ao fazer parse de pick_ban_data:', e.message);
            console.log('📄 Raw pick_ban_data (primeiros 200 chars):', match.pick_ban_data.substring(0, 200));
          }
        } else {
          console.log('⚠️ Nenhum dado de pick/ban encontrado');
        }
        
        // Parse participants data (MAIS IMPORTANTE)
        console.log('\n📊 DADOS DOS PARTICIPANTES:');
        if (match.participants_data) {
          try {
            const participantsData = JSON.parse(match.participants_data);
            console.log('✅ Participants data encontrado:', {
              participantCount: participantsData.length,
              hasRealStats: participantsData.length > 0 && participantsData[0].kills !== undefined
            });
            
            if (participantsData.length > 0) {
              console.log('\n🎮 AMOSTRA DE DADOS DOS JOGADORES:');
              participantsData.slice(0, 3).forEach((p, i) => {
                console.log(`👤 Jogador ${i + 1}:`, {
                  nome: p.summonerName,
                  champion: p.championName,
                  teamId: p.teamId,
                  KDA: `${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}`,
                  level: p.champLevel,
                  ouro: p.goldEarned,
                  CS: p.totalMinionsKilled,
                  dano: p.totalDamageDealtToChampions,
                  visao: p.visionScore,
                  items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter(i => i > 0),
                  multikills: `${p.doubleKills || 0}D/${p.tripleKills || 0}T/${p.quadraKills || 0}Q/${p.pentaKills || 0}P`
                });
              });
            }
          } catch (e) {
            console.log('❌ Erro ao fazer parse de participants_data:', e.message);
            console.log('📄 Raw participants_data (primeiros 200 chars):', match.participants_data.substring(0, 200));
          }
        } else {
          console.log('⚠️ Nenhum dado de participantes encontrado');
        }
        
        // LP Changes
        console.log('\n💰 MUDANÇAS DE LP:');
        if (match.lp_changes) {
          try {
            const lpChanges = JSON.parse(match.lp_changes);
            console.log('✅ LP Changes encontrado:', lpChanges);
          } catch (e) {
            console.log('❌ Erro ao fazer parse de lp_changes:', e.message);
          }
        } else {
          console.log('⚠️ Nenhuma mudança de LP encontrada');
        }
        
        console.log('\n' + '='.repeat(60));
      });
    }
    
    db.close();
  });
});
