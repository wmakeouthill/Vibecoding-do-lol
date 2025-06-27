import mysql from 'mysql2/promise';
import * as path from 'path';
import * as fs from 'fs';

export interface Player {
  id?: number;
  summoner_name: string;
  summoner_id?: string;
  puuid?: string;
  region: string;
  current_mmr: number;
  peak_mmr: number;
  games_played: number;
  wins: number;
  losses: number;
  win_streak: number;
  created_at?: string;
  updated_at?: string;

  // Campos específicos para partidas customizadas
  custom_mmr?: number;
  custom_peak_mmr?: number;
  custom_games_played?: number;
  custom_wins?: number;
  custom_losses?: number;
  custom_win_streak?: number;
  custom_lp?: number; // LP acumulado das partidas customizadas
}

export interface Match {
  id?: number;
  match_id: string;
  team1_players: string;
  team2_players: string;
  winner_team?: number;
  average_mmr_team1?: number;
  average_mmr_team2?: number;
  mmr_changes?: string;
  status: string;
  created_at?: string;
  completed_at?: string;
  riot_game_id?: string;
  actual_winner?: number;
  actual_duration?: number;
  riot_id?: string;
  pick_ban_data?: string;
  detected_by_lcu?: number;
  linked_results?: string;
}

export class DatabaseManager {
  private connection: mysql.Connection | null = null;
  private pool: mysql.Pool | null = null;

  constructor() {
    console.log('🗃️ DatabaseManager MySQL inicializado');
  }

  async initialize(): Promise<void> {
    try {
      // Verificar se as variáveis de ambiente MySQL estão configuradas
      const mysqlHost = process.env.DB_HOST;
      const mysqlUser = process.env.DB_USER;
      const mysqlPassword = process.env.DB_PASSWORD;
      const mysqlDatabase = process.env.DB_NAME;
      const mysqlPort = parseInt(process.env.DB_PORT || '3306');

      if (!mysqlHost || !mysqlUser || !mysqlPassword || !mysqlDatabase) {
        throw new Error('Variáveis de ambiente MySQL não configuradas. Verifique DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
      }

      console.log(`🔌 Conectando ao MySQL: ${mysqlHost}:${mysqlPort}/${mysqlDatabase}`);

      // Criar pool de conexões
      this.pool = mysql.createPool({
        host: mysqlHost,
        port: mysqlPort,
        user: mysqlUser,
        password: mysqlPassword,
        database: mysqlDatabase,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Testar conexão
      this.connection = await this.pool.getConnection();
      await this.connection.ping();

      console.log('✅ Conexão MySQL estabelecida com sucesso');

      // Criar tabelas se não existirem
      await this.createTables();
      
      // Verificar especificamente a tabela custom_matches
      await this.ensureCustomMatchesTable();
      
      await this.insertDefaultSettings();

      console.log('📁 Banco de dados MySQL inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao inicializar banco de dados MySQL:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    // Tabela de jogadores
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        summoner_name VARCHAR(255) UNIQUE NOT NULL,
        summoner_id VARCHAR(255) UNIQUE,
        puuid VARCHAR(255) UNIQUE,
        region VARCHAR(10) NOT NULL,
        current_mmr INT DEFAULT 1000,
        peak_mmr INT DEFAULT 1000,
        games_played INT DEFAULT 0,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        win_streak INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        -- Campos para partidas customizadas
        custom_mmr INT DEFAULT 1000,
        custom_peak_mmr INT DEFAULT 1000,
        custom_games_played INT DEFAULT 0,
        custom_wins INT DEFAULT 0,
        custom_losses INT DEFAULT 0,
        custom_win_streak INT DEFAULT 0,
        custom_lp INT DEFAULT 0
      )
    `);

    // Tabela de partidas
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS matches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        match_id VARCHAR(255) UNIQUE NOT NULL,
        team1_players TEXT NOT NULL,
        team2_players TEXT NOT NULL,
        winner_team INT,
        average_mmr_team1 INT,
        average_mmr_team2 INT,
        mmr_changes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        riot_game_id VARCHAR(255),
        actual_winner INT,
        actual_duration INT,
        riot_id VARCHAR(255),
        pick_ban_data TEXT,
        detected_by_lcu TINYINT DEFAULT 0,
        linked_results TEXT
      )
    `);

    // Tabela de partidas customizadas
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS custom_matches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        team1_players TEXT NOT NULL,
        team2_players TEXT NOT NULL,
        winner_team INT,
        status VARCHAR(50) DEFAULT 'pending',
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        game_mode VARCHAR(20) DEFAULT '5v5',
        duration INT,
        lp_changes TEXT,
        average_mmr_team1 INT,
        average_mmr_team2 INT,
        participants_data TEXT,
        riot_game_id VARCHAR(255),
        detected_by_lcu TINYINT DEFAULT 0,
        notes TEXT,
        custom_lp INT DEFAULT 0,
        updated_at TIMESTAMP NULL
      )
    `);

    // Tabela de vinculações Discord-LoL
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS discord_lol_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        discord_id VARCHAR(255) UNIQUE NOT NULL,
        discord_username VARCHAR(255) NOT NULL,
        game_name VARCHAR(255) NOT NULL,
        tag_line VARCHAR(10) NOT NULL,
        summoner_name VARCHAR(255) NOT NULL,
        verified TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_used TIMESTAMP NULL
      )
    `);

    // Tabela de configurações
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Tabela para persistir jogadores na fila
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS queue_players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_id INT NOT NULL,
        summoner_name VARCHAR(255) NOT NULL,
        region VARCHAR(10) NOT NULL,
        custom_lp INT DEFAULT 0,
        primary_lane VARCHAR(20),
        secondary_lane VARCHAR(20),
        join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        queue_position INT,
        is_active TINYINT DEFAULT 1,
        FOREIGN KEY (player_id) REFERENCES players (id)
      )
    `);

    console.log('✅ Tabelas MySQL criadas/verificadas com sucesso');
  }

  private async insertDefaultSettings(): Promise<void> {
    if (!this.pool) return;

    const defaultSettings = [
      { key: 'mmr_gain_base', value: '25' },
      { key: 'mmr_loss_base', value: '25' },
      { key: 'mmr_k_factor', value: '32' },
      { key: 'queue_timeout_minutes', value: '10' },
      { key: 'min_players_for_match', value: '10' },
      { key: 'max_mmr_difference', value: '200' },
      { key: 'app_version', value: '1.0.0' },
      { key: 'riot_api_key', value: '' },
      { key: 'enable_lcu_integration', value: 'true' }
    ];

    for (const setting of defaultSettings) {
      await this.pool.execute(
        'INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)',
        [setting.key, setting.value]
      );
    }

    console.log('✅ Configurações padrão inseridas');
  }

  // Métodos de Player
  async getPlayer(playerId: number): Promise<Player | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute('SELECT * FROM players WHERE id = ?', [playerId]);
      const results = rows as any[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar jogador por ID:', error);
      throw error;
    }
  }

  async getPlayerBySummonerName(summonerName: string): Promise<Player | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute('SELECT * FROM players WHERE summoner_name = ?', [summonerName]);
      const results = rows as any[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar jogador por nome:', error);
      throw error;
    }
  }

  async createPlayer(playerData: Omit<Player, 'id'>): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [result] = await this.pool.execute(
        `INSERT INTO players (
          summoner_name, summoner_id, puuid, region, current_mmr, peak_mmr,
          games_played, wins, losses, win_streak, custom_mmr, custom_peak_mmr,
          custom_games_played, custom_wins, custom_losses, custom_win_streak, custom_lp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
      playerData.summoner_name,
          playerData.summoner_id || null,
          playerData.puuid || null,
      playerData.region,
      playerData.current_mmr,
      playerData.peak_mmr,
      playerData.games_played,
      playerData.wins,
      playerData.losses,
          playerData.win_streak,
          playerData.custom_mmr || 1000,
          playerData.custom_peak_mmr || 1000,
          playerData.custom_games_played || 0,
          playerData.custom_wins || 0,
          playerData.custom_losses || 0,
          playerData.custom_win_streak || 0,
          playerData.custom_lp || 0
        ]
      );

      return (result as any).insertId;
    } catch (error) {
      console.error('Erro ao criar jogador:', error);
      throw error;
    }
  }

  async updatePlayerMMR(playerId: number, mmrChange: number): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        `UPDATE players SET 
          current_mmr = current_mmr + ?,
          peak_mmr = GREATEST(peak_mmr, current_mmr + ?),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [mmrChange, mmrChange, playerId]
      );
    } catch (error) {
      console.error('Erro ao atualizar MMR do jogador:', error);
      throw error;
    }
  }

  // Métodos de Match
  async createMatch(
    team1Players: any[], 
    team2Players: any[], 
    avgMMR1: number, 
    avgMMR2: number,
    extraData: any = {}
  ): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
      const [result] = await this.pool.execute(
        `INSERT INTO matches (
          match_id, team1_players, team2_players, average_mmr_team1, average_mmr_team2,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
        [
      matchId,
      JSON.stringify(team1Players),
      JSON.stringify(team2Players),
      avgMMR1,
          avgMMR2
        ]
      );

      return (result as any).insertId;
    } catch (error) {
      console.error('Erro ao criar partida:', error);
      throw error;
    }
  }

  async getPlayerMatches(playerId: number, limit: number = 30, offset: number = 0): Promise<Match[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        `SELECT * FROM matches 
      WHERE team1_players LIKE ? OR team2_players LIKE ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [`%${playerId}%`, `%${playerId}%`, limit, offset]
      );
      
      return rows as Match[];
    } catch (error) {
      console.error('Erro ao buscar partidas do jogador:', error);
      throw error;
    }
  }

  async getRecentMatches(limit: number = 20): Promise<Match[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      const [rows] = await this.pool.execute(
        'SELECT * FROM custom_matches ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      
      return rows as Match[];
    } catch (error) {
      console.error('Erro ao buscar partidas recentes:', error);
      throw error;
    }
  }

  // Métodos de Custom Matches
  async createCustomMatch(matchData: {
    title?: string;
    description?: string;
    team1Players: string[];
    team2Players: string[];
    createdBy: string;
    gameMode?: string;
  }): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de inserir
      await this.ensureCustomMatchesTable();
      
      const [result] = await this.pool.execute(
        `INSERT INTO custom_matches (
          title, description, team1_players, team2_players, created_by, game_mode
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          matchData.title || null,
          matchData.description || null,
          JSON.stringify(matchData.team1Players),
          JSON.stringify(matchData.team2Players),
          matchData.createdBy,
          matchData.gameMode || '5v5'
        ]
      );

      return (result as any).insertId;
    } catch (error) {
      console.error('Erro ao criar partida customizada:', error);
      throw error;
    }
  }

  async getCustomMatches(limit: number = 20, offset: number = 0): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      const [rows] = await this.pool.execute(
        'SELECT * FROM custom_matches ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset]
      );
      
      return rows as any[];
    } catch (error) {
      console.error('Erro ao buscar partidas customizadas:', error);
      throw error;
    }
  }

  async getCustomMatchById(matchId: number): Promise<any | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      const [rows] = await this.pool.execute(
        'SELECT * FROM custom_matches WHERE id = ?',
        [matchId]
      );
      
      const results = rows as any[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar partida customizada por ID:', error);
      throw error;
    }
  }

  async updateCustomMatchStatus(matchId: number, status: string): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de atualizar
      await this.ensureCustomMatchesTable();
      
      await this.pool.execute(
        'UPDATE custom_matches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, matchId]
      );
    } catch (error) {
      console.error('Erro ao atualizar status da partida customizada:', error);
      throw error;
    }
  }

  async updateCustomMatchWithRealData(matchId: number, realMatchData: any): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de atualizar
      await this.ensureCustomMatchesTable();
      
      await this.pool.execute(
        `UPDATE custom_matches SET 
          riot_game_id = ?,
          duration = ?,
          pick_ban_data = ?,
          participants_data = ?,
          detected_by_lcu = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          realMatchData.gameId || null,
          realMatchData.duration || null,
          realMatchData.pickBanData ? JSON.stringify(realMatchData.pickBanData) : null,
          realMatchData.participantsData ? JSON.stringify(realMatchData.participantsData) : null,
          realMatchData.detectedByLCU ? 1 : 0,
          realMatchData.notes || null,
          matchId
        ]
      );
    } catch (error) {
      console.error('Erro ao atualizar partida customizada com dados reais:', error);
      throw error;
    }
  }

  // Métodos de Settings
  async getSetting(key: string): Promise<string | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute('SELECT value FROM settings WHERE `key` = ?', [key]);
      const results = rows as any[];
      return results.length > 0 ? results[0].value : null;
    } catch (error) {
      console.error('Erro ao buscar configuração:', error);
      throw error;
    }
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP',
        [key, value, value]
      );
    } catch (error) {
      console.error('Erro ao definir configuração:', error);
      throw error;
    }
  }

  // Métodos de Queue
  async addPlayerToQueue(playerId: number, summonerName: string, region: string, customLp: number, preferences: any): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        `INSERT INTO queue_players (
          player_id, summoner_name, region, custom_lp, primary_lane, secondary_lane, queue_position
        ) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(queue_position), 0) + 1 FROM queue_players qp))`,
        [
          playerId,
          summonerName,
          region,
          customLp,
          preferences?.primaryLane || null,
          preferences?.secondaryLane || null
        ]
      );
    } catch (error) {
      console.error('Erro ao adicionar jogador à fila:', error);
      throw error;
    }
  }

  async removePlayerFromQueue(playerId: number): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        'UPDATE queue_players SET is_active = 0 WHERE player_id = ?',
        [playerId]
      );
    } catch (error) {
      console.error('Erro ao remover jogador da fila:', error);
      throw error;
    }
  }

  async getActiveQueuePlayers(): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM queue_players WHERE is_active = 1 ORDER BY join_time ASC'
      );
      
      return rows as any[];
    } catch (error) {
      console.error('Erro ao buscar jogadores ativos na fila:', error);
      throw error;
    }
  }

  async clearQueue(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute('UPDATE queue_players SET is_active = 0');
    } catch (error) {
      console.error('Erro ao limpar fila:', error);
      throw error;
    }
  }

  async clearAllPlayers(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute('DELETE FROM players');
    } catch (error) {
      console.error('Erro ao limpar todos os jogadores:', error);
      throw error;
    }
  }

  // Método para fechar conexões
  async close(): Promise<void> {
    try {
      if (this.connection) {
        // Não precisamos chamar release() pois o pool gerencia as conexões automaticamente
        this.connection = null;
      }
      
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
      
      console.log('🔌 Conexões MySQL fechadas');
    } catch (error) {
      console.error('Erro ao fechar conexões MySQL:', error);
      throw error;
    }
  }

  // Métodos auxiliares para compatibilidade
  async recordQueueAction(action: string, playerId?: number, data?: any): Promise<void> {
    // Implementação básica para compatibilidade
    console.log(`📝 Queue action: ${action}`, { playerId, data });
  }

  async updateMatchStatus(matchId: number, status: string): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        'UPDATE matches SET status = ? WHERE id = ?',
        [status, matchId]
      );
    } catch (error) {
      console.error('Erro ao atualizar status da partida:', error);
      throw error;
    }
  }

  async getRiotMatchByGameId(gameId: string): Promise<any | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM matches WHERE riot_game_id = ?',
        [gameId]
      );
      
      const results = rows as any[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar partida Riot por ID:', error);
      throw error;
    }
  }

  async saveRiotMatch(matchData: any): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        `INSERT INTO matches (
          match_id, team1_players, team2_players, riot_game_id, status, created_at
        ) VALUES (?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP)`,
        [
          matchData.matchId,
          JSON.stringify(matchData.team1Players || []),
          JSON.stringify(matchData.team2Players || []),
          matchData.gameId
        ]
      );
    } catch (error) {
      console.error('Erro ao salvar partida Riot:', error);
      throw error;
    }
  }

  async getPlayerByPuuid(puuid: string): Promise<Player | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute('SELECT * FROM players WHERE puuid = ?', [puuid]);
      const results = rows as any[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar jogador por PUUID:', error);
      throw error;
    }
  }

  async getPlayerRiotMatches(playerId: number, limit: number = 20): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        `SELECT * FROM matches 
         WHERE team1_players LIKE ? OR team2_players LIKE ?
         ORDER BY created_at DESC LIMIT ?`,
        [`%${playerId}%`, `%${playerId}%`, limit]
      );
      
      return rows as any[];
    } catch (error) {
      console.error('Erro ao buscar partidas Riot do jogador:', error);
      throw error;
    }
  }

  // Métodos de Discord Links
  async createDiscordLink(discordId: string, discordUsername: string, gameName: string, tagLine: string): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [result] = await this.pool.execute(
        `INSERT INTO discord_lol_links (
          discord_id, discord_username, game_name, tag_line, summoner_name
        ) VALUES (?, ?, ?, ?, ?)`,
        [discordId, discordUsername, gameName, tagLine, `${gameName}#${tagLine}`]
      );

      return (result as any).insertId;
    } catch (error) {
      console.error('Erro ao criar link Discord:', error);
      throw error;
    }
  }

  async getDiscordLink(discordId: string): Promise<any | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM discord_lol_links WHERE discord_id = ?',
        [discordId]
      );
      
      const results = rows as any[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar link Discord:', error);
      throw error;
    }
  }

  async getDiscordLinkByGameName(gameName: string, tagLine: string): Promise<any | null> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM discord_lol_links WHERE game_name = ? AND tag_line = ?',
        [gameName, tagLine]
      );
      
      const results = rows as any[];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar link Discord por nome do jogo:', error);
      throw error;
    }
  }

  async updateDiscordLinkLastUsed(discordId: string): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        'UPDATE discord_lol_links SET last_used = CURRENT_TIMESTAMP WHERE discord_id = ?',
        [discordId]
      );
    } catch (error) {
      console.error('Erro ao atualizar último uso do link Discord:', error);
      throw error;
    }
  }

  async deleteDiscordLink(discordId: string): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        'DELETE FROM discord_lol_links WHERE discord_id = ?',
        [discordId]
      );
    } catch (error) {
      console.error('Erro ao deletar link Discord:', error);
      throw error;
    }
  }

  async getAllDiscordLinks(): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM discord_lol_links ORDER BY created_at DESC'
      );
      
      return rows as any[];
    } catch (error) {
      console.error('Erro ao buscar todos os links Discord:', error);
      throw error;
    }
  }

  async verifyDiscordLink(discordId: string, gameName: string, tagLine: string): Promise<boolean> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM discord_lol_links WHERE discord_id = ? AND game_name = ? AND tag_line = ?',
        [discordId, gameName, tagLine]
      );
      
      const results = rows as any[];
      return results[0]?.count > 0;
    } catch (error) {
      console.error('Erro ao verificar link Discord:', error);
      throw error;
    }
  }

  async getDiscordLinksCount(): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [rows] = await this.pool.execute('SELECT COUNT(*) as count FROM discord_lol_links');
      const results = rows as any[];
      return results[0]?.count || 0;
    } catch (error) {
      console.error('Erro ao contar links Discord:', error);
      throw error;
    }
  }

  // Métodos para partidas customizadas
  async completeCustomMatch(matchId: number, winnerTeam: number, extraData: any = {}): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de operar
      await this.ensureCustomMatchesTable();
      
      // Buscar dados da partida
      const match = await this.getCustomMatchById(matchId);
      if (!match) {
        throw new Error('Partida customizada não encontrada');
      }

      // Se não há lpChanges, calcular automaticamente baseado no resultado
      let lpChanges = extraData.lpChanges;
      if (!lpChanges) {
        console.log('🔄 Calculando lpChanges automaticamente para partida', matchId);
        
        const team1Players = JSON.parse(match.team1_players);
        const team2Players = JSON.parse(match.team2_players);
        
        lpChanges = {};
        
        // LP base: +18 para vitória, -15 para derrota
        const baseLpWin = 18;
        const baseLpLoss = -15;
        
        // Processar time 1
        team1Players.forEach((playerString: string) => {
          if (playerString && typeof playerString === 'string') {
            const lpChange = winnerTeam === 1 ? baseLpWin : baseLpLoss;
            lpChanges[playerString] = lpChange;
          }
        });
        
        // Processar time 2
        team2Players.forEach((playerString: string) => {
          if (playerString && typeof playerString === 'string') {
            const lpChange = winnerTeam === 2 ? baseLpWin : baseLpLoss;
            lpChanges[playerString] = lpChange;
          }
        });
        
        console.log('📊 lpChanges calculados:', lpChanges);
      }

      // Calcular LP total da partida
      let totalLp = 0;
      if (lpChanges) {
        totalLp = Object.values(lpChanges).reduce((sum: number, lpChange: any) => {
          return sum + Math.abs(Number(lpChange));
        }, 0);
      }

      // Atualizar status da partida
      await this.pool.execute(
        `UPDATE custom_matches SET 
          winner_team = ?, 
          status = 'finished', 
          completed_at = CURRENT_TIMESTAMP,
          duration = ?,
          lp_changes = ?,
          participants_data = ?,
          custom_lp = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          winnerTeam,
          extraData.duration || 0,
          JSON.stringify(lpChanges || {}),
          JSON.stringify(extraData.participantsData || {}),
          totalLp,
          matchId
        ]
      );

      // Atualizar estatísticas dos jogadores
      if (lpChanges) {
        for (const [playerString, lpChange] of Object.entries(lpChanges)) {
          const lpChangeValue = Number(lpChange);
          
          // Buscar o jogador pelo summoner_name (Riot ID completo)
          const [playerRows] = await this.pool.execute(
            'SELECT id FROM players WHERE summoner_name = ?',
            [playerString]
          );
          
          if ((playerRows as any[]).length > 0) {
            const playerId = (playerRows as any[])[0].id;
            
            await this.pool.execute(
              `UPDATE players SET 
                custom_lp = custom_lp + ?,
                custom_games_played = custom_games_played + 1,
                ${lpChangeValue > 0 ? 'custom_wins = custom_wins + 1' : 'custom_losses = custom_losses + 1'},
                custom_peak_mmr = GREATEST(custom_peak_mmr, custom_lp + ?),
                updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [lpChangeValue, lpChangeValue, playerId]
            );
            
            console.log(`✅ Jogador ${playerString} atualizado: LP +${lpChangeValue}, ID: ${playerId}`);
          } else {
            console.warn(`⚠️ Jogador ${playerString} não encontrado na tabela players`);
          }
        }
      }

      console.log(`✅ Partida customizada ${matchId} finalizada - Time vencedor: ${winnerTeam}, LP total: ${totalLp}`);
    } catch (error) {
      console.error('Erro ao finalizar partida customizada:', error);
      throw error;
    }
  }

  async getPlayerCustomMatches(playerIdentifier: string, limit: number = 20): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      // Validar e sanitizar parâmetros
      if (!playerIdentifier || typeof playerIdentifier !== 'string') {
        console.warn('getPlayerCustomMatches: playerIdentifier inválido:', playerIdentifier);
        return [];
      }
      
      // Garantir que limit seja um número válido
      let limitValue = 20;
      if (typeof limit === 'number' && !isNaN(limit) && limit > 0) {
        limitValue = Math.min(100, Math.max(1, limit));
      } else if (typeof limit === 'string') {
        const parsedLimit = parseInt(limit);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limitValue = Math.min(100, Math.max(1, parsedLimit));
        }
      }
      
      const searchTerm = `%${playerIdentifier.trim()}%`;
      
      console.log('🔍 [getPlayerCustomMatches] Parâmetros sanitizados:', {
        originalPlayerIdentifier: playerIdentifier,
        searchTerm,
        limitValue,
        limitType: typeof limitValue,
        originalLimit: limit
      });
      
      // Query simplificada sem LIMIT para evitar problemas com parâmetros
      const query = `
      SELECT 
          id,
          title,
          description,
          team1_players,
          team2_players,
          created_by,
          game_mode,
          winner_team,
          status,
          created_at,
          completed_at,
          duration,
          pick_ban_data,
          participants_data,
          riot_game_id,
          detected_by_lcu,
          notes,
          lp_changes,
          custom_lp
      FROM custom_matches
        WHERE team1_players LIKE ? OR team2_players LIKE ?
        ORDER BY created_at DESC
      `;
      
      const params = [searchTerm, searchTerm];
      
      console.log('🔍 [getPlayerCustomMatches] Query simplificada:', query);
      console.log('🔍 [getPlayerCustomMatches] Params:', params);
      
      let rows;
      try {
        [rows] = await this.pool.execute(query, params);
        console.log('✅ [getPlayerCustomMatches] Query executada com sucesso');
      } catch (executeError: any) {
        console.error('❌ Erro na query simplificada:', executeError);
        throw executeError;
      }
      
      // Aplicar LIMIT manualmente no JavaScript
      const limitedRows = (rows as any[]).slice(0, limitValue);
      
      // Retornar dados brutos para o frontend processar (como esperado)
      const rawRows = limitedRows.map(row => {
        // Processar lp_changes para calcular o LP change do jogador específico
        let playerLpChange = 0;
        let playerMmrChange = 0;
        let playerTeam = null;
        let playerWon = false;
        
        if (row.lp_changes) {
          try {
            const lpChanges = JSON.parse(row.lp_changes);
            const playerLpChangeValue = lpChanges[playerIdentifier];
            
            if (playerLpChangeValue !== undefined) {
              playerLpChange = Number(playerLpChangeValue);
              playerMmrChange = playerLpChange; // Para partidas customizadas, MMR = LP
              
              // Determinar time e resultado
              const team1Players = JSON.parse(row.team1_players);
              const team2Players = JSON.parse(row.team2_players);
              
              if (team1Players.includes(playerIdentifier)) {
                playerTeam = 1;
                playerWon = row.winner_team === 1;
              } else if (team2Players.includes(playerIdentifier)) {
                playerTeam = 2;
                playerWon = row.winner_team === 2;
              }
            }
          } catch (parseError) {
            console.warn('⚠️ Erro ao processar lp_changes:', parseError);
          }
        }
        
        return {
          ...row,
          // Garantir que custom_lp seja um número
          custom_lp: row.custom_lp || 0,
          // Adicionar campos específicos do jogador
          player_lp_change: playerLpChange,
          player_mmr_change: playerMmrChange,
          player_team: playerTeam,
          player_won: playerWon
        };
      });
      
      console.log('✅ [getPlayerCustomMatches] Resultado final:', rawRows.length, 'registros brutos');
      
      return rawRows;
    } catch (error: any) {
      console.error('❌ Erro ao buscar partidas customizadas do jogador:', error);
      console.error('Parâmetros que causaram erro:', { playerIdentifier, limit });
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  async getPlayerCustomMatchesCount(playerIdentifier: string): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      // Validar parâmetro
      if (!playerIdentifier || typeof playerIdentifier !== 'string') {
        console.warn('getPlayerCustomMatchesCount: playerIdentifier inválido:', playerIdentifier);
        return 0;
      }
      
      const searchTerm = `%${playerIdentifier.trim()}%`;
      
      console.log('🔍 [getPlayerCustomMatchesCount] Parâmetros sanitizados:', {
        originalPlayerIdentifier: playerIdentifier,
        searchTerm
      });
      
      // Usar query simples
      const query = `
        SELECT COUNT(*) as count FROM custom_matches 
        WHERE team1_players LIKE ? OR team2_players LIKE ?
      `;
      
      const params = [searchTerm, searchTerm];
      
      console.log('🔍 [getPlayerCustomMatchesCount] Query:', query);
      console.log('🔍 [getPlayerCustomMatchesCount] Params:', params);
      
      let rows;
      try {
        [rows] = await this.pool.execute(query, params);
        console.log('✅ [getPlayerCustomMatchesCount] Query executada com sucesso');
      } catch (executeError: any) {
        console.error('❌ Erro na query count:', executeError);
        throw executeError;
      }
      
      const results = rows as any[];
      const count = results[0]?.count || 0;
      
      console.log('✅ [getPlayerCustomMatchesCount] Resultado:', count);
      
      return count;
    } catch (error: any) {
      console.error('❌ Erro ao contar partidas customizadas do jogador:', error);
      console.error('Parâmetros que causaram erro:', { playerIdentifier });
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  async deleteCustomMatch(matchId: number): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de deletar
      await this.ensureCustomMatchesTable();
      
      await this.pool.execute('DELETE FROM custom_matches WHERE id = ?', [matchId]);
    } catch (error) {
      console.error('Erro ao deletar partida customizada:', error);
      throw error;
    }
  }

  async getCustomMatchStats(): Promise<any> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      const [totalMatches] = await this.pool.execute('SELECT COUNT(*) as count FROM custom_matches');
      const [completedMatches] = await this.pool.execute("SELECT COUNT(*) as count FROM custom_matches WHERE status = 'completed'");
      const [pendingMatches] = await this.pool.execute("SELECT COUNT(*) as count FROM custom_matches WHERE status = 'pending'");
      
      return {
        total: (totalMatches as any[])[0].count,
        completed: (completedMatches as any[])[0].count,
        pending: (pendingMatches as any[])[0].count
      };
    } catch (error) {
      console.error('Erro ao buscar estatísticas das partidas customizadas:', error);
      throw error;
    }
  }

  async cleanupTestMatches(): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de limpar
      await this.ensureCustomMatchesTable();
      
      const [result] = await this.pool.execute(
        "DELETE FROM custom_matches WHERE title LIKE '%test%' OR description LIKE '%test%'"
      );
      
      return (result as any).affectedRows;
    } catch (error) {
      console.error('Erro ao limpar partidas de teste:', error);
      throw error;
    }
  }

  async clearAllCustomMatches(): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de limpar
      await this.ensureCustomMatchesTable();
      
      console.log('🧹 [clearAllCustomMatches] Iniciando limpeza COMPLETA da tabela custom_matches');
      
      const [result] = await this.pool.execute("DELETE FROM custom_matches");
      
      const deletedCount = (result as any).affectedRows;
      
      console.log(`✅ [clearAllCustomMatches] Limpeza concluída: ${deletedCount} partidas removidas`);
      
      return deletedCount;
    } catch (error) {
      console.error('❌ Erro ao limpar todas as partidas customizadas:', error);
      throw error;
    }
  }

  async getCustomMatchesCount(): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      const [rows] = await this.pool.execute('SELECT COUNT(*) as count FROM custom_matches');
      const results = rows as any[];
      return results[0]?.count || 0;
    } catch (error) {
      console.error('Erro ao contar partidas customizadas:', error);
      throw error;
    }
  }

  async getParticipantsLeaderboard(limit: number | string = 100): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que limit seja um número válido
      let limitValue = 100;
      
      if (typeof limit === 'number' && !isNaN(limit) && limit > 0) {
        limitValue = Math.min(500, Math.max(1, limit));
      } else if (typeof limit === 'string') {
        const parsedLimit = parseInt(limit);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limitValue = Math.min(500, Math.max(1, parsedLimit));
        }
      }
      
      console.log('🔍 [getParticipantsLeaderboard] Parâmetros:', {
        originalLimit: limit,
        limitValue,
        limitType: typeof limitValue
      });
      
      // Verificar se a tabela players existe
      const [tableCheck] = await this.pool.execute(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_name = 'players' AND table_schema = DATABASE()`
      );
      
      if ((tableCheck as any[])[0].count === 0) {
        console.warn('⚠️ Tabela players não encontrada, retornando array vazio');
        return [];
      }
      
      // Query melhorada para incluir MMR total e estatísticas detalhadas
      const query = `
        SELECT 
          summoner_name,
          IFNULL(custom_lp, 0) as custom_lp,
          IFNULL(custom_games_played, 0) as custom_games_played,
          IFNULL(custom_wins, 0) as custom_wins,
          IFNULL(custom_losses, 0) as custom_losses,
          CASE 
            WHEN IFNULL(custom_games_played, 0) > 0 
            THEN ROUND((IFNULL(custom_wins, 0) * 100.0) / IFNULL(custom_games_played, 0), 2)
            ELSE 0 
          END as win_rate
        FROM players 
        WHERE IFNULL(custom_games_played, 0) > 0
        ORDER BY custom_lp DESC, win_rate DESC
        LIMIT ${limitValue}
      `;
      
      const [rows] = await this.pool.execute(query);
      
      console.log('✅ [getParticipantsLeaderboard] Resultado base:', (rows as any[]).length, 'registros');
      
      // Para cada jogador, buscar estatísticas detalhadas das partidas
      const detailedPlayers = await Promise.all((rows as any[]).map(async (player) => {
        try {
          // Buscar todas as partidas do jogador para calcular estatísticas
          const [matches] = await this.pool!.execute(
            `SELECT participants_data FROM custom_matches 
             WHERE (team1_players LIKE ? OR team2_players LIKE ?) 
             AND status IN ('finished', 'completed')`,
            [`%${player.summoner_name}%`, `%${player.summoner_name}%`]
          );
          
          let totalKills = 0;
          let totalDeaths = 0;
          let totalAssists = 0;
          let totalGold = 0;
          let totalDamage = 0;
          let totalCS = 0;
          let totalVision = 0;
          let maxKills = 0;
          let maxDamage = 0;
          let championStats: { [key: string]: number } = {};
          let gamesCounted = 0;
          
          // Processar cada partida
          for (const match of matches as any[]) {
            if (match.participants_data) {
              try {
                const participants = JSON.parse(match.participants_data);
                
                // Encontrar o participante que corresponde ao jogador
                const participant = participants.find((p: any) => {
                  const participantName = p.summonerName || `${p.riotIdGameName}#${p.riotIdTagline}`;
                  return participantName.includes(player.summoner_name);
                });
                
                if (participant) {
                  gamesCounted++;
                  totalKills += participant.kills || 0;
                  totalDeaths += participant.deaths || 0;
                  totalAssists += participant.assists || 0;
                  totalGold += participant.goldEarned || 0;
                  totalDamage += participant.totalDamageDealtToChampions || 0;
                  totalCS += (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0);
                  totalVision += participant.visionScore || 0;
                  
                  maxKills = Math.max(maxKills, participant.kills || 0);
                  maxDamage = Math.max(maxDamage, participant.totalDamageDealtToChampions || 0);
                  
                  // Contar campeões
                  const championName = participant.championName || `Champion${participant.championId}`;
                  championStats[championName] = (championStats[championName] || 0) + 1;
                }
              } catch (parseError) {
                console.warn('⚠️ Erro ao processar participants_data:', parseError);
              }
            }
          }
          
          // Calcular médias
          const avgKills = gamesCounted > 0 ? totalKills / gamesCounted : 0;
          const avgDeaths = gamesCounted > 0 ? totalDeaths / gamesCounted : 0;
          const avgAssists = gamesCounted > 0 ? totalAssists / gamesCounted : 0;
          const avgGold = gamesCounted > 0 ? totalGold / gamesCounted : 0;
          const avgDamage = gamesCounted > 0 ? totalDamage / gamesCounted : 0;
          const avgCS = gamesCounted > 0 ? totalCS / gamesCounted : 0;
          const avgVision = gamesCounted > 0 ? totalVision / gamesCounted : 0;
          
          // Calcular KDA ratio
          const kdaRatio = avgDeaths > 0 ? (avgKills + avgAssists) / avgDeaths : (avgKills + avgAssists);
          
          // Encontrar campeão favorito
          let favoriteChampion = null;
          if (Object.keys(championStats).length > 0) {
            const favoriteChampionName = Object.keys(championStats).reduce((a, b) => 
              championStats[a] > championStats[b] ? a : b
            );
            favoriteChampion = {
              name: favoriteChampionName,
              id: 0, // Será calculado pelo frontend
              games: championStats[favoriteChampionName]
            };
          }
          
          return {
            ...player,
            // Estatísticas detalhadas
            avg_kills: Math.round(avgKills * 100) / 100,
            avg_deaths: Math.round(avgDeaths * 100) / 100,
            avg_assists: Math.round(avgAssists * 100) / 100,
            kda_ratio: Math.round(kdaRatio * 100) / 100,
            avg_gold: Math.round(avgGold),
            avg_damage: Math.round(avgDamage),
            avg_cs: Math.round(avgCS * 100) / 100,
            avg_vision: Math.round(avgVision * 100) / 100,
            max_kills: maxKills,
            max_damage: maxDamage,
            calculated_mmr: player.custom_lp, // MMR total é a soma dos custom_lp
            lp: player.custom_lp, // LP atual
            favorite_champion: favoriteChampion,
            // Manter compatibilidade com nomes antigos
            wins: player.custom_wins,
            games_played: player.custom_games_played,
            // Extrair gameName e tagLine do summoner_name completo
            riot_id_game_name: player.summoner_name.includes('#') ? player.summoner_name.split('#')[0] : player.summoner_name,
            riot_id_tagline: player.summoner_name.includes('#') ? player.summoner_name.split('#')[1] : undefined
          };
          
        } catch (error) {
          console.error(`❌ Erro ao processar estatísticas detalhadas para ${player.summoner_name}:`, error);
          return {
            ...player,
            avg_kills: 0,
            avg_deaths: 0,
            avg_assists: 0,
            kda_ratio: 0,
            avg_gold: 0,
            avg_damage: 0,
            avg_cs: 0,
            avg_vision: 0,
            max_kills: 0,
            max_damage: 0,
            calculated_mmr: player.custom_lp,
            lp: player.custom_lp,
            favorite_champion: null,
            wins: player.custom_wins,
            games_played: player.custom_games_played,
            // Extrair gameName e tagLine do summoner_name completo
            riot_id_game_name: player.summoner_name.includes('#') ? player.summoner_name.split('#')[0] : player.summoner_name,
            riot_id_tagline: player.summoner_name.includes('#') ? player.summoner_name.split('#')[1] : undefined
          };
        }
      }));
      
      console.log('✅ [getParticipantsLeaderboard] Estatísticas detalhadas calculadas para', detailedPlayers.length, 'jogadores');
      
      return detailedPlayers;
    } catch (error: any) {
      console.error('❌ Erro ao buscar leaderboard de participantes:', error);
      console.error('Parâmetros que causaram erro:', { limit });
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  async refreshPlayersFromCustomMatches(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();
      
      console.log('🔄 [refreshPlayersFromCustomMatches] Iniciando atualização de jogadores...');
      
      // Buscar todas as partidas customizadas com dados completos
      const [matches] = await this.pool.execute(
        "SELECT team1_players, team2_players, winner_team, lp_changes, custom_lp FROM custom_matches WHERE status IN ('finished', 'completed')"
      );
      
      console.log(`📊 [refreshPlayersFromCustomMatches] Encontradas ${(matches as any[]).length} partidas`);
      
      const allPlayers = new Set<string>();
      
      // Map para contar jogos, vitórias, derrotas e MMR total
      const playerStats: Record<string, { games: number, wins: number, losses: number, totalMMR: number }> = {};

      for (const match of matches as any[]) {
        try {
          const team1Players = JSON.parse(match.team1_players);
          const team2Players = JSON.parse(match.team2_players);
          const winnerTeam = match.winner_team;
          const lpChanges = match.lp_changes ? JSON.parse(match.lp_changes) : {};

          // Processar team1_players
          team1Players.forEach((playerString: string) => {
            if (playerString && typeof playerString === 'string') {
              allPlayers.add(playerString);
              if (!playerStats[playerString]) playerStats[playerString] = { games: 0, wins: 0, losses: 0, totalMMR: 0 };
              playerStats[playerString].games++;
              
              // Calcular vitória/derrota
              if (winnerTeam == 1) playerStats[playerString].wins++;
              else if (winnerTeam == 2) playerStats[playerString].losses++;
              
              // Somar MMR da partida
              const playerMMR = lpChanges[playerString] || 0;
              playerStats[playerString].totalMMR += playerMMR;
            }
          });

          // Processar team2_players
          team2Players.forEach((playerString: string) => {
            if (playerString && typeof playerString === 'string') {
              allPlayers.add(playerString);
              if (!playerStats[playerString]) playerStats[playerString] = { games: 0, wins: 0, losses: 0, totalMMR: 0 };
              playerStats[playerString].games++;
              
              // Calcular vitória/derrota
              if (winnerTeam == 2) playerStats[playerString].wins++;
              else if (winnerTeam == 1) playerStats[playerString].losses++;
              
              // Somar MMR da partida
              const playerMMR = lpChanges[playerString] || 0;
              playerStats[playerString].totalMMR += playerMMR;
            }
          });
        } catch (error) {
          console.error('❌ [refreshPlayersFromCustomMatches] Erro ao processar jogadores da partida:', error);
        }
      }

      // Atualizar estatísticas dos jogadores
      for (const summonerName of allPlayers) {
        try {
          const existingPlayer = await this.getPlayerBySummonerName(summonerName);
          const stats = playerStats[summonerName] || { games: 0, wins: 0, losses: 0, totalMMR: 0 };
          
          if (!existingPlayer) {
            console.log(`➕ [refreshPlayersFromCustomMatches] Criando jogador: ${summonerName}`);
            await this.createPlayer({
              summoner_name: summonerName,
              region: 'br1', // Default
              current_mmr: 1000,
              peak_mmr: 1000,
              games_played: 0,
              wins: 0,
              losses: 0,
              win_streak: 0,
              custom_games_played: stats.games,
              custom_wins: stats.wins,
              custom_losses: stats.losses,
              custom_lp: stats.totalMMR // Soma total do MMR de todas as partidas
            });
            console.log(`✅ [refreshPlayersFromCustomMatches] Jogador criado: ${summonerName} - MMR total: ${stats.totalMMR}`);
          } else {
            // Atualizar estatísticas customizadas incluindo MMR total
            await this.pool.execute(
              'UPDATE players SET custom_games_played = ?, custom_wins = ?, custom_losses = ?, custom_lp = ? WHERE summoner_name = ?',
              [stats.games, stats.wins, stats.losses, stats.totalMMR, summonerName]
            );
            console.log(`✅ [refreshPlayersFromCustomMatches] Jogador atualizado: ${summonerName} - MMR total: ${stats.totalMMR}`);
          }
        } catch (error) {
          console.error(`❌ [refreshPlayersFromCustomMatches] Erro ao criar/verificar jogador ${summonerName}:`, error);
        }
      }
      
      console.log('✅ [refreshPlayersFromCustomMatches] Atualização de jogadores concluída');
    } catch (error) {
      console.error('❌ [refreshPlayersFromCustomMatches] Erro ao atualizar jogadores das partidas customizadas:', error);
      throw error;
    }
  }

  async updatePlayerNickname(oldName: string, newName: string): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        'UPDATE players SET summoner_name = ?, updated_at = CURRENT_TIMESTAMP WHERE summoner_name = ?',
      [newName, oldName]
    );
    } catch (error) {
      console.error('Erro ao atualizar nickname do jogador:', error);
      throw error;
    }
  }

  // Métodos para compatibilidade com o sistema existente
  async completeMatch(matchId: number, winnerTeam: number, extraData: any = {}): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute(
        `UPDATE matches SET 
          winner_team = ?, 
          status = 'completed', 
          completed_at = CURRENT_TIMESTAMP,
          mmr_changes = ?
         WHERE id = ?`,
        [winnerTeam, JSON.stringify(extraData.mmrChanges || {}), matchId]
      );
    } catch (error) {
      console.error('Erro ao finalizar partida:', error);
      throw error;
    }
  }

  async deleteMatch(matchId: number): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      await this.pool.execute('DELETE FROM matches WHERE id = ?', [matchId]);
    } catch (error) {
      console.error('Erro ao deletar partida:', error);
      throw error;
    }
  }

  async createMatchLinkingSession(sessionData: any): Promise<any> {
    // Implementação básica para compatibilidade
    console.log('📝 Match linking session created:', sessionData);
    return { id: Date.now() };
  }

  async updateMatchLinkingSession(sessionId: string, updateData: any): Promise<any> {
    // Implementação básica para compatibilidade
    console.log('📝 Match linking session updated:', { sessionId, updateData });
    return { id: sessionId };
  }

  async completeMatchLinking(postGameData: any): Promise<any> {
    // Implementação básica para compatibilidade
    console.log('📝 Match linking completed:', postGameData);
    return { success: true };
  }

  async getLinkedMatches(playerId: number, limit: number = 20): Promise<any[]> {
    // Implementação básica para compatibilidade
    return [];
  }

  async getMatchLinkingStats(): Promise<any> {
    // Implementação básica para compatibilidade
    return { total: 0, success: 0, failed: 0 };
  }

  private async calculatePlayerDetailedStats(summonerName: string): Promise<any> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    // Buscar estatísticas do jogador
    const [playerRows] = await this.pool.execute(
      'SELECT * FROM players WHERE summoner_name = ?',
      [summonerName]
    );
    
    const player = (playerRows as any[])[0];
    if (!player) return null;
    
    // Buscar partidas customizadas do jogador
    const customMatches = await this.getPlayerCustomMatches(summonerName, 50);
    
    // Calcular estatísticas detalhadas
    const stats = {
      summonerName: player.summoner_name,
      customLp: player.custom_lp || 0,
      customGamesPlayed: player.custom_games_played || 0,
      customWins: player.custom_wins || 0,
      customLosses: player.custom_losses || 0,
      customWinRate: player.custom_games_played > 0 ? 
        Math.round((player.custom_wins * 100) / player.custom_games_played) : 0,
      customWinStreak: player.custom_win_streak || 0,
      recentMatches: customMatches.slice(0, 10).map((match: any) => ({
        id: match.id,
        title: match.title,
        status: match.status,
        winnerTeam: match.winner_team,
        createdAt: match.created_at,
        isWinner: match.winner_team === 1 ? 
          JSON.parse(match.team1_players).some((p: any) => p.summonerName === summonerName) :
          JSON.parse(match.team2_players).some((p: any) => p.summonerName === summonerName)
      }))
    };
    
    return stats;
  }

  // Método para verificar se a tabela custom_matches existe
  private async ensureCustomMatchesTable(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Verificar se a tabela existe
      const [tables] = await this.pool.execute(
        "SHOW TABLES LIKE 'custom_matches'"
      );
      
      if ((tables as any[]).length === 0) {
        console.log('📋 Tabela custom_matches não encontrada, criando...');
        await this.pool.execute(`
          CREATE TABLE custom_matches (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255),
            description TEXT,
            team1_players TEXT NOT NULL,
            team2_players TEXT NOT NULL,
            winner_team INT,
            status VARCHAR(50) DEFAULT 'pending',
            created_by VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL,
            game_mode VARCHAR(20) DEFAULT '5v5',
            duration INT,
            lp_changes TEXT,
            average_mmr_team1 INT,
            average_mmr_team2 INT,
            participants_data TEXT,
            riot_game_id VARCHAR(255),
            detected_by_lcu TINYINT DEFAULT 0,
            notes TEXT,
            custom_lp INT DEFAULT 0,
            updated_at TIMESTAMP NULL
          )
        `);
        console.log('✅ Tabela custom_matches criada com sucesso');
      } else {
        // Verificar se os campos necessários existem
        const [columns] = await this.pool.execute(
          "SHOW COLUMNS FROM custom_matches"
        );
        const columnNames = (columns as any[]).map(col => col.Field);
        
        // Adicionar campos que podem estar faltando
        if (!columnNames.includes('duration')) {
          console.log('📋 Adicionando campo duration...');
          await this.pool.execute(
            'ALTER TABLE custom_matches ADD COLUMN duration INT AFTER game_mode'
          );
        }
        
        if (!columnNames.includes('custom_lp')) {
          console.log('📋 Adicionando campo custom_lp...');
          await this.pool.execute(
            'ALTER TABLE custom_matches ADD COLUMN custom_lp INT DEFAULT 0 AFTER notes'
          );
        }
        
        console.log('✅ Tabela custom_matches verificada e atualizada');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar/criar tabela custom_matches:', error);
      throw error;
    }
  }

  // Método para obter estatísticas das tabelas (para debug)
  async getTablesStats(): Promise<any> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      // Verificar custom_matches
      const [customMatchesCount] = await this.pool.execute('SELECT COUNT(*) as count FROM custom_matches');
      
      // Verificar estrutura da tabela custom_matches
      const [tableStructure] = await this.pool.execute('DESCRIBE custom_matches');
      
      // Verificar valores únicos na coluna status (se existir)
      let statusValues: any[] = [];
      let hasStatusColumn = false;
      
      try {
        const [statusCheck] = await this.pool.execute('SELECT DISTINCT status FROM custom_matches');
        statusValues = statusCheck as any[];
        hasStatusColumn = true;
      } catch (e) {
        console.warn('⚠️ Coluna status não encontrada na tabela custom_matches');
        hasStatusColumn = false;
      }
      
      // Tentar diferentes status possíveis
      let finishedMatchesCount = 0;
      if (hasStatusColumn) {
        try {
          const [finishedCount] = await this.pool.execute('SELECT COUNT(*) as count FROM custom_matches WHERE status = "finished"');
          finishedMatchesCount = (finishedCount as any[])[0].count;
        } catch (e) {
          try {
            const [completedCount] = await this.pool.execute('SELECT COUNT(*) as count FROM custom_matches WHERE status = "completed"');
            finishedMatchesCount = (completedCount as any[])[0].count;
          } catch (e2) {
            console.warn('⚠️ Não foi possível contar partidas finalizadas:', e2);
          }
        }
      }
      
      const [playersCount] = await this.pool.execute('SELECT COUNT(*) as count FROM players');
      const [playersWithCustomData] = await this.pool.execute('SELECT COUNT(*) as count FROM players WHERE custom_games_played > 0');
      
      // Buscar algumas partidas de exemplo
      const [sampleMatches] = await this.pool.execute('SELECT id, title, created_at FROM custom_matches ORDER BY created_at DESC LIMIT 5');
      
      // Buscar alguns jogadores de exemplo
      const [samplePlayers] = await this.pool.execute('SELECT summoner_name, custom_games_played, custom_lp FROM players ORDER BY custom_lp DESC LIMIT 5');
      
      return {
        customMatches: {
          total: (customMatchesCount as any[])[0].count,
          finished: finishedMatchesCount,
          hasStatusColumn: hasStatusColumn
        },
        players: {
          total: (playersCount as any[])[0].count,
          withCustomData: (playersWithCustomData as any[])[0].count
        },
        tableStructure: tableStructure as any[],
        statusValues: statusValues,
        sampleMatches: sampleMatches as any[],
        samplePlayers: samplePlayers as any[]
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas das tabelas:', error);
      throw error;
    }
  }

  // Método para obter contagem de jogadores
  async getPlayersCount(): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      const [playerCount] = await this.pool.execute('SELECT COUNT(*) as count FROM players');
      return (playerCount as any[])[0].count;
    } catch (error) {
      console.error('❌ Erro ao obter contagem de jogadores:', error);
      throw error;
    }
  }

  // Método para corrigir status das partidas antigas
  async fixMatchStatus(): Promise<{ affectedMatches: number, playerCount: number }> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');
    
    try {
      console.log('🔧 [fixMatchStatus] Corrigindo status das partidas antigas...');
      
      // Atualizar partidas com status 'completed' para 'finished'
      const [updateResult] = await this.pool.execute(
        'UPDATE custom_matches SET status = ? WHERE status = ?',
        ['finished', 'completed']
      );
      
      const affectedRows = (updateResult as any).affectedRows;
      
      console.log(`✅ [fixMatchStatus] ${affectedRows} partidas atualizadas de 'completed' para 'finished'`);
      
      // Agora rodar o rebuild dos jogadores
      await this.refreshPlayersFromCustomMatches();
      
      // Verificar quantos jogadores foram criados
      const playerCount = await this.getPlayersCount();
      
      console.log(`✅ [fixMatchStatus] Rebuild concluído. Total de jogadores: ${playerCount}`);
      
      return {
        affectedMatches: affectedRows,
        playerCount: playerCount
      };
    } catch (error) {
      console.error('❌ [fixMatchStatus] Erro:', error);
      throw error;
    }
  }
}
