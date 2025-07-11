/**
 * Script de Debug para Criação de Match Discord
 * 
 * Este script simula o fluxo completo de criação de match Discord
 * para identificar onde está falhando o processo.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');

class DiscordMatchDebugger {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server);
    this.db = null;
  }

  async init() {
    console.log('🔧 [Debug] Iniciando Debug do Discord Match...');

    try {
      // Conectar ao banco de dados
      this.db = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '123456',
        database: 'vibecoding_lol',
        port: 3306
      });

      console.log('✅ [Debug] Conectado ao banco de dados');

    } catch (error) {
      console.error('❌ [Debug] Erro ao conectar ao banco:', error);
      return;
    }

    // Simular um match encontrado
    await this.simulateMatchFound();
  }

  async simulateMatchFound() {
    console.log('\n🎮 [Debug] Simulando Match Found...');

    // Mock de dados de match típico
    const mockMatch = {
      id: 123,
      team1_players: JSON.stringify([
        "TestPlayer1#BR1",
        "TestPlayer2#BR1",
        "TestPlayer3#BR1",
        "TestPlayer4#BR1",
        "TestPlayer5#BR1"
      ]),
      team2_players: JSON.stringify([
        "TestPlayer6#BR1",
        "TestPlayer7#BR1",
        "TestPlayer8#BR1",
        "TestPlayer9#BR1",
        "TestPlayer10#BR1"
      ])
    };

    console.log('📊 [Debug] Dados do mock match:');
    console.log('   Match ID:', mockMatch.id);
    console.log('   Team 1:', JSON.parse(mockMatch.team1_players));
    console.log('   Team 2:', JSON.parse(mockMatch.team2_players));

    // Verificar vinculações existentes
    await this.checkDiscordLinks();

    // Simular criação do Discord Match
    await this.simulateCreateDiscordMatch(mockMatch.id, mockMatch);
  }

  async checkDiscordLinks() {
    console.log('\n🔗 [Debug] Verificando vinculações Discord existentes...');

    try {
      const [rows] = await this.db.query('SELECT * FROM discord_links');

      console.log(`📊 [Debug] Total de vinculações encontradas: ${rows.length}`);

      if (rows.length > 0) {
        console.log('📋 [Debug] Vinculações existentes:');
        rows.forEach((link, index) => {
          console.log(`   ${index + 1}. ${link.game_name}#${link.tag_line} → Discord ID: ${link.discord_id}`);
        });
      } else {
        console.log('⚠️ [Debug] PROBLEMA: Nenhuma vinculação encontrada!');
        console.log('💡 [Debug] Sugestão: Criar algumas vinculações de teste');

        // Criar vinculações de teste
        await this.createTestLinks();
      }

    } catch (error) {
      console.error('❌ [Debug] Erro ao verificar vinculações:', error);
    }
  }

  async createTestLinks() {
    console.log('\n🔧 [Debug] Criando vinculações de teste...');

    const testLinks = [
      { gameName: 'TestPlayer1', tagLine: 'BR1', discordId: '123456789012345678' },
      { gameName: 'TestPlayer2', tagLine: 'BR1', discordId: '123456789012345679' },
      { gameName: 'TestPlayer3', tagLine: 'BR1', discordId: '123456789012345680' },
      { gameName: 'TestPlayer4', tagLine: 'BR1', discordId: '123456789012345681' },
      { gameName: 'TestPlayer5', tagLine: 'BR1', discordId: '123456789012345682' },
      { gameName: 'TestPlayer6', tagLine: 'BR1', discordId: '123456789012345683' },
      { gameName: 'TestPlayer7', tagLine: 'BR1', discordId: '123456789012345684' },
      { gameName: 'TestPlayer8', tagLine: 'BR1', discordId: '123456789012345685' },
      { gameName: 'TestPlayer9', tagLine: 'BR1', discordId: '123456789012345686' },
      { gameName: 'TestPlayer10', tagLine: 'BR1', discordId: '123456789012345687' }
    ];

    try {
      for (const link of testLinks) {
        await this.db.query(
          'INSERT IGNORE INTO discord_links (game_name, tag_line, discord_id) VALUES (?, ?, ?)',
          [link.gameName, link.tagLine, link.discordId]
        );
        console.log(`✅ [Debug] Vinculação criada: ${link.gameName}#${link.tagLine} → ${link.discordId}`);
      }

      console.log('🎉 [Debug] Vinculações de teste criadas com sucesso!');

    } catch (error) {
      console.error('❌ [Debug] Erro ao criar vinculações de teste:', error);
    }
  }

  async simulateCreateDiscordMatch(matchId, match) {
    console.log(`\n🎮 [Debug] Simulando createDiscordMatch para partida ${matchId}...`);

    try {
      // Parsear times
      let team1Players = JSON.parse(match.team1_players || '[]');
      let team2Players = JSON.parse(match.team2_players || '[]');

      console.log(`📊 [Debug] Time 1: ${team1Players.length} jogadores:`, team1Players);
      console.log(`📊 [Debug] Time 2: ${team2Players.length} jogadores:`, team2Players);

      // Processar jogadores
      const allPlayers = [];

      // Time 1
      for (let i = 0; i < team1Players.length; i++) {
        const playerName = team1Players[i];
        const linkedNickname = this.parseLinkedNickname(playerName);

        let discordId = null;
        if (linkedNickname) {
          discordId = await this.findDiscordIdByLinkedNickname(linkedNickname.gameName, linkedNickname.tagLine);
        }

        allPlayers.push({
          userId: discordId,
          username: playerName,
          role: this.getDefaultRole(i),
          linkedNickname: linkedNickname
        });
      }

      // Time 2
      for (let i = 0; i < team2Players.length; i++) {
        const playerName = team2Players[i];
        const linkedNickname = this.parseLinkedNickname(playerName);

        let discordId = null;
        if (linkedNickname) {
          discordId = await this.findDiscordIdByLinkedNickname(linkedNickname.gameName, linkedNickname.tagLine);
        }

        allPlayers.push({
          userId: discordId,
          username: playerName,
          role: this.getDefaultRole(i),
          linkedNickname: linkedNickname
        });
      }

      console.log('\n🔗 [Debug] Jogadores processados:');
      allPlayers.forEach((player, index) => {
        console.log(`   ${index + 1}. ${player.username} (${player.role})`);
        console.log(`      ↳ Discord ID: ${player.userId || 'Não encontrado'}`);
        if (player.linkedNickname) {
          console.log(`      ↳ Vinculação: ${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}`);
        }
      });

      // Verificar quantos jogadores têm Discord ID válido
      const playersWithDiscordId = allPlayers.filter(p => p.userId).length;
      console.log(`\n📊 [Debug] Jogadores com Discord ID válido: ${playersWithDiscordId}/${allPlayers.length}`);

      if (playersWithDiscordId === 0) {
        console.log('⚠️ [Debug] PROBLEMA: Nenhum jogador tem Discord ID válido!');
        console.log('💡 [Debug] Verificar se as vinculações estão corretas no banco de dados');
        return;
      }

      console.log('✅ [Debug] Simulação concluída - Jogadores encontrados e prontos para Discord Match');

      // Verificar se o bot Discord está conectado
      await this.checkDiscordBotStatus();

    } catch (error) {
      console.error('❌ [Debug] Erro na simulação:', error);
    }
  }

  async findDiscordIdByLinkedNickname(gameName, tagLine) {
    try {
      console.log(`   🔍 [Debug] Buscando Discord ID para ${gameName}#${tagLine}`);

      const [rows] = await this.db.query(
        'SELECT discord_id FROM discord_links WHERE game_name = ? AND tag_line = ?',
        [gameName, tagLine]
      );

      if (rows.length > 0) {
        console.log(`   ✅ [Debug] Discord ID encontrado: ${rows[0].discord_id}`);
        return rows[0].discord_id;
      } else {
        console.log(`   ❌ [Debug] Nenhuma vinculação encontrada`);
        return null;
      }
    } catch (error) {
      console.error(`   ❌ [Debug] Erro ao buscar Discord ID:`, error);
      return null;
    }
  }

  parseLinkedNickname(playerName) {
    if (playerName && playerName.includes('#')) {
      const parts = playerName.split('#');
      if (parts.length === 2) {
        return {
          gameName: parts[0].trim(),
          tagLine: parts[1].trim()
        };
      }
    }
    return undefined;
  }

  getDefaultRole(index) {
    const roles = ['top', 'jungle', 'mid', 'adc', 'support'];
    return roles[index] || 'fill';
  }

  async checkDiscordBotStatus() {
    console.log('\n🤖 [Debug] Verificando status do Discord Bot...');

    try {
      // Tentar fazer uma requisição para a API do backend
      const response = await fetch('http://localhost:3000/api/discord/status');

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [Debug] Bot Discord conectado:', data);
      } else {
        console.log('⚠️ [Debug] Backend não está respondendo ou bot não conectado');
      }
    } catch (error) {
      console.log('❌ [Debug] Erro ao verificar status do bot:', error.message);
      console.log('💡 [Debug] Certifique-se de que o backend está rodando na porta 3001');
    }
  }

  async cleanup() {
    if (this.db) {
      await this.db.end();
      console.log('🔒 [Debug] Conexão do banco fechada');
    }
  }
}

// Executar o debug
async function runDebug() {
  const debugInstance = new DiscordMatchDebugger();

  try {
    await debugInstance.init();
  } catch (error) {
    console.error('❌ [Debug] Erro fatal:', error);
  } finally {
    await debugInstance.cleanup();
    process.exit(0);
  }
}

// Executar se for chamado diretamente
if (require.main === module) {
  runDebug();
}

module.exports = DiscordMatchDebugger;
