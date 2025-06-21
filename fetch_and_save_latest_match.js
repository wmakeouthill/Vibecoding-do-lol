const axios = require('axios');

console.log('🎮 Buscando última partida do LCU e salvando automaticamente...\n');

async function fetchLatestLCUMatch() {
  try {
    console.log('🔍 1. Buscando histórico de partidas do LCU...');
    
    // Buscar histórico de partidas customizadas apenas
    const historyResponse = await axios.get('http://localhost:3000/api/lcu/match-history-all?customOnly=true&count=5', {
      timeout: 10000
    });    if (!historyResponse.data || !historyResponse.data.matches || historyResponse.data.matches.length === 0) {
      console.log('❌ Nenhuma partida customizada encontrada no histórico do LCU');
      return;
    }

    console.log(`✅ Encontradas ${historyResponse.data.matches.length} partidas customizadas no histórico`);
    
    // Pegar a primeira partida (mais recente)
    const latestMatch = historyResponse.data.matches[0];
    const gameId = latestMatch.gameId;
    
    console.log(`🎯 2. Partida mais recente: Game ID ${gameId}`);
    console.log(`   - Modo: ${latestMatch.gameMode}`);
    console.log(`   - Duração: ${Math.floor(latestMatch.gameDuration / 60)}m ${latestMatch.gameDuration % 60}s`);
    console.log(`   - Data: ${new Date(latestMatch.gameCreation).toLocaleString()}`);

    // Tentar identificar o jogador atual da partida
    let playerIdentifier = 'Sistema';
    if (latestMatch.participantIdentities && latestMatch.participantIdentities.length > 0) {
      // Usar o primeiro jogador como referência
      const firstPlayer = latestMatch.participantIdentities[0];
      if (firstPlayer.player) {
        if (firstPlayer.player.gameName && firstPlayer.player.tagLine) {
          playerIdentifier = `${firstPlayer.player.gameName}#${firstPlayer.player.tagLine}`;
        } else if (firstPlayer.player.summonerName) {
          playerIdentifier = firstPlayer.player.summonerName;
        }
      }
    }

    console.log(`👤 3. Player identificado: ${playerIdentifier}`);

    console.log(`📤 4. Enviando para o endpoint de salvamento...`);

    // Chamar o endpoint para buscar e salvar a partida
    const saveResponse = await axios.post(`http://localhost:3000/api/lcu/fetch-and-save-match/${gameId}`, {
      playerIdentifier: playerIdentifier
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ 5. Resposta do servidor:');
    console.log(JSON.stringify(saveResponse.data, null, 2));

    if (saveResponse.data.success) {
      console.log(`\n🎉 SUCESSO! Partida ${gameId} foi salva no banco de dados!`);
      console.log(`📝 Match ID: ${saveResponse.data.matchId}`);
      console.log(`👥 Participantes: ${saveResponse.data.participants}`);
      console.log(`✅ Dados completos: ${saveResponse.data.hasCompleteData ? 'SIM' : 'NÃO'}`);
      console.log(`🏁 Finalizada: ${saveResponse.data.isCompleted ? 'SIM' : 'NÃO'}`);

      // Aguardar um pouco e verificar os dados no banco
      console.log('\n🔍 6. Verificando dados salvos no banco...');
      setTimeout(() => {
        require('child_process').exec('node inspect_latest_custom_match.js', (error, stdout, stderr) => {
          if (error) {
            console.error('❌ Erro ao verificar banco:', error);
            return;
          }
          console.log('\n📋 Dados da partida no banco:');
          console.log(stdout);
        });
      }, 2000);

    } else {
      console.log('❌ Falha ao salvar a partida');
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Erro: Servidor não está rodando. Execute o backend primeiro.');
    } else if (error.response) {
      console.error('❌ Erro do servidor:', error.response.data);
    } else {
      console.error('❌ Erro:', error.message);
    }
  }
}

// Executar
fetchLatestLCUMatch();
