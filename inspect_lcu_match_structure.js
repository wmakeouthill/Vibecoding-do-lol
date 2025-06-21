const axios = require('axios');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

// Configuração para ignorar certificados SSL auto-assinados
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

class LCUInspector {
  constructor() {
    this.client = null;
    this.connectionInfo = null;
  }

  findLockfile() {
    const possiblePaths = [
      process.env.LOCALAPPDATA + '\\Riot Games\\League of Legends\\lockfile',
      'C:\\Riot Games\\League of Legends\\lockfile'
    ];

    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }
    return null;
  }

  async findLeagueClient() {
    try {
      // Método 1: Procurar pelo lockfile
      const lockfilePath = this.findLockfile();
      
      if (lockfilePath && fs.existsSync(lockfilePath)) {
        const lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
        const parts = lockfileContent.split(':');
        
        if (parts.length >= 5) {
          this.connectionInfo = {
            port: parseInt(parts[2]),
            password: parts[3],
            protocol: parts[4].includes('https') ? 'https' : 'http'
          };
          return;
        }
      }

      // Método 2: Procurar processo do League Client via WMIC
      const stdout = execSync(
        'wmic PROCESS WHERE name="LeagueClientUx.exe" GET commandline /value',
        { encoding: 'utf8' }
      );

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('--app-port=') && line.includes('--remoting-auth-token=')) {
          const portMatch = line.match(/--app-port=(\d+)/);
          const tokenMatch = line.match(/--remoting-auth-token=([a-zA-Z0-9_-]+)/);
          
          if (portMatch && tokenMatch) {
            this.connectionInfo = {
              port: parseInt(portMatch[1]),
              password: tokenMatch[1],
              protocol: 'https'
            };
            return;
          }
        }
      }

      throw new Error('Cliente do League of Legends não encontrado');
    } catch (error) {
      throw error;
    }
  }

  async connectToLCU() {
    if (!this.connectionInfo) {
      throw new Error('Informações de conexão não encontradas');
    }

    this.client = axios.create({
      baseURL: `${this.connectionInfo.protocol}://127.0.0.1:${this.connectionInfo.port}`,
      httpsAgent: httpsAgent,
      auth: {
        username: 'riot',
        password: this.connectionInfo.password
      },
      timeout: 10000
    });

    // Testar conexão
    await this.client.get('/lol-summoner/v1/current-summoner');
    console.log('✅ Conectado ao LCU');
  }

  async getLatestCustomMatch() {
    try {
      console.log('🔍 Buscando histórico de partidas...');
      
      // Buscar histórico de partidas
      const response = await this.client.get('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20');
      
      if (!response.data || !response.data.games || !response.data.games.games) {
        throw new Error('Nenhuma partida encontrada no histórico');
      }

      const matches = response.data.games.games;
      console.log(`📋 Encontradas ${matches.length} partidas no histórico`);

      // Filtrar apenas partidas customizadas
      const customMatches = matches.filter(match => 
        match.gameMode === 'CLASSIC' && 
        match.queueId === 0
      );

      if (customMatches.length === 0) {
        throw new Error('Nenhuma partida customizada encontrada');
      }

      return customMatches[0]; // Retorna a mais recente
    } catch (error) {
      console.error('❌ Erro ao buscar partidas:', error.message);
      throw error;
    }
  }

  async getMatchDetails(gameId) {
    try {
      console.log(`🔍 Buscando detalhes da partida ${gameId}...`);
      
      const endpoints = [
        `/lol-match-history/v1/games/${gameId}`,
        `/lol-match-history/v1/products/lol/current-summoner/matches/${gameId}`,
        `/lol-match-history/v3/matchlists/by-account/current/matches/${gameId}`,
        `/lol-match-history/v1/game-timelines/${gameId}`,
        `/lol-match-history/v1/match-details/${gameId}`
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`🔗 Tentando endpoint: ${endpoint}`);
          const response = await this.client.get(endpoint);
          
          if (response.data && response.data.participants) {
            console.log(`✅ Dados completos obtidos via ${endpoint}: ${response.data.participants.length} participantes`);
            return response.data;
          }
        } catch (error) {
          console.log(`❌ Endpoint ${endpoint} falhou:`, error.message);
          continue;
        }
      }

      throw new Error(`Nenhum endpoint retornou dados completos para partida ${gameId}`);
    } catch (error) {
      console.error(`❌ Erro ao buscar detalhes da partida ${gameId}:`, error.message);
      throw error;
    }
  }

  inspectMatchStructure(matchData) {
    console.log('\n🔍 INSPEÇÃO DA ESTRUTURA DOS DADOS:\n');
    console.log('='.repeat(50));
    
    console.log('📊 Informações gerais da partida:');
    console.log(`  Game ID: ${matchData.gameId}`);
    console.log(`  Game Mode: ${matchData.gameMode}`);
    console.log(`  Duration: ${matchData.gameDuration}s`);
    console.log(`  Creation: ${new Date(matchData.gameCreation)}`);
    console.log(`  Map ID: ${matchData.mapId}`);
    
    if (matchData.teams) {
      console.log(`\n🏆 Teams (${matchData.teams.length}):`);
      matchData.teams.forEach((team, i) => {
        console.log(`  Team ${i + 1} (ID: ${team.teamId}): ${team.win ? 'VENCEDOR' : 'PERDEDOR'}`);
      });
    }

    if (matchData.participants && matchData.participants.length > 0) {
      console.log(`\n👥 Participantes (${matchData.participants.length}):`);
      
      // Inspecionar primeiro participante em detalhes
      const firstParticipant = matchData.participants[0];
      console.log('\n📋 ESTRUTURA DETALHADA DO PRIMEIRO PARTICIPANTE:');
      console.log('─'.repeat(40));
      console.log(JSON.stringify(firstParticipant, null, 2));
      
      // Resumo de todos os participantes
      console.log('\n📊 RESUMO DE TODOS OS PARTICIPANTES:');
      matchData.participants.forEach((participant, i) => {
        console.log(`\n  ${i + 1}. Participant ID: ${participant.participantId} (Team: ${participant.teamId})`);
        console.log(`     Champion: ${participant.championId} (${participant.championName || 'N/A'})`);
        
        // Verificar onde estão os stats
        if (participant.stats) {
          console.log(`     ✅ STATS ENCONTRADOS em participant.stats:`);
          console.log(`        KDA: ${participant.stats.kills}/${participant.stats.deaths}/${participant.stats.assists}`);
          console.log(`        Gold: ${participant.stats.goldEarned}`);
          console.log(`        CS: ${participant.stats.totalMinionsKilled}`);
          console.log(`        Damage: ${participant.stats.totalDamageDealtToChampions}`);
          console.log(`        Items: [${participant.stats.item0}, ${participant.stats.item1}, ${participant.stats.item2}, ${participant.stats.item3}, ${participant.stats.item4}, ${participant.stats.item5}]`);
        } else {
          console.log(`     ❌ SEM participant.stats - verificando campos diretos:`);
          console.log(`        KDA: ${participant.kills || 0}/${participant.deaths || 0}/${participant.assists || 0}`);
          console.log(`        Gold: ${participant.goldEarned || 0}`);
        }
      });
    }

    if (matchData.participantIdentities && matchData.participantIdentities.length > 0) {
      console.log(`\n🆔 Identidades dos Participantes (${matchData.participantIdentities.length}):`);
      matchData.participantIdentities.forEach((identity, i) => {
        console.log(`  ${i + 1}. Participant ID: ${identity.participantId}`);
        if (identity.player) {
          console.log(`     Nome: ${identity.player.summonerName || identity.player.gameName}`);
          console.log(`     PUUID: ${identity.player.puuid}`);
          if (identity.player.gameName && identity.player.tagLine) {
            console.log(`     Riot ID: ${identity.player.gameName}#${identity.player.tagLine}`);
          }
        }
      });
    }

    console.log('\n' + '='.repeat(50));
  }
}

async function main() {
  try {
    console.log('🚀 Iniciando inspeção da estrutura LCU...\n');

    const inspector = new LCUInspector();
    await inspector.findLeagueClient();
    await inspector.connectToLCU();

    const latestMatch = await inspector.getLatestCustomMatch();
    console.log(`\n📋 Última partida customizada: Game ID ${latestMatch.gameId}`);

    const matchDetails = await inspector.getMatchDetails(latestMatch.gameId);
    
    inspector.inspectMatchStructure(matchDetails);

    console.log('\n✅ Inspeção concluída!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();
