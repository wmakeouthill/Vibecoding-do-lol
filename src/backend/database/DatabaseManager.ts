import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;

  constructor() {
    // Definir caminho do banco de dados
    const userDataPath = process.env.NODE_ENV === 'development' 
      ? path.join(process.cwd(), 'data')
      : path.join(process.env.APPDATA || process.env.HOME || '.', 'lol-matchmaking');
    
    // Criar diretório se não existir
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    this.dbPath = path.join(userDataPath, 'matchmaking.db');
  }

  async initialize(): Promise<void> {
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      await this.createTables();
      console.log(`📁 Banco de dados inicializado em: ${this.dbPath}`);
    } catch (error) {
      console.error('Erro ao inicializar banco de dados:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    // Tabela de jogadores
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summoner_name TEXT UNIQUE NOT NULL,
        summoner_id TEXT UNIQUE,
        puuid TEXT UNIQUE,
        region TEXT NOT NULL,
        current_mmr INTEGER DEFAULT 1000,
        peak_mmr INTEGER DEFAULT 1000,
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        win_streak INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de partidas
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT UNIQUE NOT NULL,
        team1_players TEXT NOT NULL, -- JSON array de player IDs
        team2_players TEXT NOT NULL, -- JSON array de player IDs
        winner_team INTEGER, -- 1 ou 2, NULL se não finalizada
        average_mmr_team1 INTEGER,
        average_mmr_team2 INTEGER,
        mmr_changes TEXT, -- JSON object com mudanças de MMR
        status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // Add new columns for match linking if they don't exist
    try {
      await this.db.exec(`
        ALTER TABLE matches ADD COLUMN riot_game_id TEXT;
      `);
    } catch (error) {
      // Column might already exist
    }

    try {
      await this.db.exec(`
        ALTER TABLE matches ADD COLUMN actual_winner INTEGER;
      `);
    } catch (error) {
      // Column might already exist
    }

    try {
      await this.db.exec(`
        ALTER TABLE matches ADD COLUMN actual_duration INTEGER;
      `);
    } catch (error) {
      // Column might already exist
    }

    try {
      await this.db.exec(`
        ALTER TABLE matches ADD COLUMN linked_results TEXT;
      `);
    } catch (error) {
      // Column might already exist
    }

    // Tabela de fila
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER,
        action TEXT NOT NULL, -- 'join' ou 'leave'
        queue_time_seconds INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players (id)
      )
    `);

    // Tabela de configurações
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de estatísticas de matchmaking
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS matchmaking_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_players_online INTEGER DEFAULT 0,
        players_in_queue INTEGER DEFAULT 0,
        matches_today INTEGER DEFAULT 0,
        average_queue_time_seconds INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela para histórico de partidas da Riot API
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS riot_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT UNIQUE NOT NULL,
        game_mode TEXT,
        game_duration INTEGER,
        game_creation DATETIME,
        participants_data TEXT, -- JSON com dados dos participantes
        player_result TEXT, -- JSON com resultado específico do jogador
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela para sessões de vinculação de partidas
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS match_linking_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        custom_match_id TEXT,
        queue_match_id INTEGER,
        players_data TEXT, -- JSON com dados dos jogadores
        pick_ban_result TEXT, -- JSON com resultado do pick/ban
        game_started INTEGER DEFAULT 0, -- 0 ou 1
        game_ended INTEGER DEFAULT 0, -- 0 ou 1
        riot_game_id TEXT, -- ID do jogo na Riot API, se disponível
        linked_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // Tabela para resultados individuais de jogadores em partidas
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_match_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER,
        match_id INTEGER,
        champion TEXT,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        won INTEGER DEFAULT 0, -- 0 ou 1
        items TEXT, -- JSON com itens comprados
        gold_earned INTEGER DEFAULT 0,
        total_damage INTEGER DEFAULT 0,
        dodged INTEGER DEFAULT 0, -- 0 ou 1
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players (id),
        FOREIGN KEY (match_id) REFERENCES matches (id)
      )
    `);

    // Inserir configurações padrão
    await this.insertDefaultSettings();
  }

  private async insertDefaultSettings(): Promise<void> {
    if (!this.db) return;

    const defaultSettings = [
      { key: 'mmr_gain_base', value: '25' },
      { key: 'mmr_loss_base', value: '25' },
      { key: 'mmr_k_factor', value: '32' },
      { key: 'queue_timeout_minutes', value: '10' },
      { key: 'min_players_for_match', value: '10' },
      { key: 'max_mmr_difference', value: '200' },
      { key: 'app_version', value: '1.0.0' },
      { key: 'riot_api_key', value: '' }, // Mantido como string vazia por padrão
      { key: 'enable_lcu_integration', value: 'true' }
    ];

    for (const setting of defaultSettings) {
      await this.db.run(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [setting.key, setting.value]
      );
    }
  }

  // Métodos para jogadores
  async createPlayer(summonerName: string, region: string, summonerId?: string, puuid?: string): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const result = await this.db.run(
      'INSERT INTO players (summoner_name, summoner_id, puuid, region) VALUES (?, ?, ?, ?)',
      [summonerName, summonerId, puuid, region]
    );

    return result.lastID!;
  }

  async getPlayer(playerId: number): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    return await this.db.get('SELECT * FROM players WHERE id = ?', [playerId]);
  }

  async getPlayerBySummonerName(summonerName: string): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    return await this.db.get('SELECT * FROM players WHERE summoner_name = ? COLLATE NOCASE', [summonerName]);
  }
  async updatePlayerMMR(playerId: number, mmrChange: number): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    try {
      // Get current MMR first
      const player = await this.db.get('SELECT current_mmr, peak_mmr FROM players WHERE id = ?', [playerId]);
      if (!player) throw new Error(`Player ${playerId} not found`);

      const newMMR = player.current_mmr + mmrChange;
      const newPeakMMR = Math.max(player.peak_mmr || 0, newMMR);

      await this.db.run(`
        UPDATE players 
        SET current_mmr = ?, peak_mmr = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [newMMR, newPeakMMR, playerId]);

      console.log(`📊 MMR atualizado para jogador ${playerId}: ${mmrChange > 0 ? '+' : ''}${mmrChange} (${player.current_mmr} → ${newMMR})`);

    } catch (error) {
      console.error('Erro ao atualizar MMR do jogador:', error);
      throw error;
    }
  }

  async updatePlayerStats(playerId: number, won: boolean): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    if (won) {
      await this.db.run(
        'UPDATE players SET wins = wins + 1, games_played = games_played + 1, win_streak = win_streak + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [playerId]
      );
    } else {
      await this.db.run(
        'UPDATE players SET losses = losses + 1, games_played = games_played + 1, win_streak = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [playerId]
      );
    }
  }

  // Métodos para partidas
  async createMatch(team1Players: number[], team2Players: number[], avgMMR1: number, avgMMR2: number): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await this.db.run(
      'INSERT INTO matches (match_id, team1_players, team2_players, average_mmr_team1, average_mmr_team2) VALUES (?, ?, ?, ?, ?)',
      [matchId, JSON.stringify(team1Players), JSON.stringify(team2Players), avgMMR1, avgMMR2]
    );

    return result.lastID!;
  }

  async completeMatch(matchId: number, winnerTeam: number, mmrChanges: any): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    await this.db.run(
      'UPDATE matches SET winner_team = ?, mmr_changes = ?, status = "completed", completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [winnerTeam, JSON.stringify(mmrChanges), matchId]
    );
  }

  async getRecentMatches(limit: number = 20): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    return await this.db.all(
      'SELECT * FROM matches ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }
  
  async getPlayerMatches(playerId: number, limit: number = 20, offset: number = 0): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    // This query checks if the player ID is in team1_players or team2_players JSON arrays
    const matches = await this.db.all(`
      SELECT 
        m.*,
        CASE 
          WHEN json_extract(m.team1_players, '$') LIKE '%' || ? || '%' THEN 1
          ELSE 2
        END as player_team
      FROM 
        matches m
      WHERE 
        (json_extract(m.team1_players, '$') LIKE '%' || ? || '%' OR 
         json_extract(m.team2_players, '$') LIKE '%' || ? || '%')
      ORDER BY 
        m.created_at DESC
      LIMIT ? OFFSET ?
    `, [playerId, playerId, playerId, limit, offset]);
    
    return matches.map(match => {
      // Add a field to indicate if the player won this match
      const playerTeam = match.player_team;
      const winnerTeam = match.winner_team;
      const playerWon = playerTeam === winnerTeam;
      
      // Get the player's MMR change from the mmr_changes JSON
      let playerMmrChange = 0;
      if (match.mmr_changes) {
        try {
          const mmrChanges = JSON.parse(match.mmr_changes);
          playerMmrChange = mmrChanges[playerId] || 0;
        } catch (e) {
          console.error('Error parsing MMR changes:', e);
        }
      }
      
      return {
        ...match,
        player_won: playerWon,
        player_mmr_change: playerMmrChange
      };
    });
  }

  // Métodos para configurações
  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const result = await this.db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return result?.value || null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    await this.db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
    console.log(`[DatabaseManager] Configuração '${key}' atualizada para '${value}'`);
  }

  // Métodos de estatísticas
  async recordQueueAction(playerId: number, action: 'join' | 'leave', queueTimeSeconds?: number): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    await this.db.run(
      'INSERT INTO queue_history (player_id, action, queue_time_seconds) VALUES (?, ?, ?)',
      [playerId, action, queueTimeSeconds || null]
    );
  }

  async getAverageQueueTime(): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const result = await this.db.get(
      'SELECT AVG(queue_time_seconds) as avg_time FROM queue_history WHERE action = "leave" AND queue_time_seconds IS NOT NULL'
    );

    return result?.avg_time || 0;
  }
  async getPlayerByPuuid(puuid: string): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    return await this.db.get('SELECT * FROM players WHERE puuid = ?', [puuid]);
  }

  // Métodos para histórico de partidas Riot
  async saveRiotMatch(matchData: any): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const query = `
      INSERT INTO riot_matches (
        game_id, game_mode, game_duration, game_creation,
        participants_data, player_result, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await this.db.run(query, [
      matchData.gameId,
      matchData.gameMode,
      matchData.gameDuration,
      matchData.gameCreation.toISOString(),
      JSON.stringify(matchData.participants),
      JSON.stringify(matchData.playerResult),
      new Date().toISOString()
    ]);

    return result.lastID!;
  }

  async getRiotMatchByGameId(gameId: string): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    return await this.db.get('SELECT * FROM riot_matches WHERE game_id = ?', [gameId]);
  }

  async getPlayerRiotMatches(playerId: number, limit: number = 10): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    // Buscar partidas associadas ao jogador através do PUUID nos participants_data
    const player = await this.getPlayer(playerId);
    if (!player?.puuid) return [];

    const query = `
      SELECT * FROM riot_matches 
      WHERE participants_data LIKE '%"puuid":"' || ? || '"%'
      ORDER BY game_creation DESC 
      LIMIT ?
    `;
    return await this.db.all(query, [player.puuid, limit]);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  // ===== MATCH LINKING METHODS =====

  async createMatchLinkingSession(sessionData: any): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    try {
      const query = `
        INSERT INTO match_linking_sessions (
          session_id, custom_match_id, queue_match_id, players_data,
          pick_ban_result, game_started, game_ended, riot_game_id,
          linked_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `;

      const result = await this.db.run(query, [
        sessionData.id,
        sessionData.customMatchId,
        sessionData.queueMatchId,
        JSON.stringify(sessionData.players),
        sessionData.pickBanResult ? JSON.stringify(sessionData.pickBanResult) : null,
        sessionData.gameStarted ? 1 : 0,
        sessionData.gameEnded ? 1 : 0,
        sessionData.riotGameId || null,
        sessionData.linkedAt.toISOString()
      ]);

      return { id: result.lastID, sessionId: sessionData.id };

    } catch (error) {
      console.error('Erro ao criar sessão de vinculação:', error);
      throw error;
    }
  }

  async updateMatchLinkingSession(sessionId: string, updateData: any): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    try {
      const query = `
        UPDATE match_linking_sessions 
        SET 
          pick_ban_result = COALESCE(?, pick_ban_result),
          game_started = COALESCE(?, game_started),
          game_ended = COALESCE(?, game_ended),
          riot_game_id = COALESCE(?, riot_game_id),
          completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE completed_at END,
          updated_at = datetime('now')
        WHERE session_id = ?
      `;

      await this.db.run(query, [
        updateData.pickBanResult ? JSON.stringify(updateData.pickBanResult) : null,
        updateData.gameStarted !== undefined ? (updateData.gameStarted ? 1 : 0) : null,
        updateData.gameEnded !== undefined ? (updateData.gameEnded ? 1 : 0) : null,
        updateData.riotGameId || null,
        updateData.gameEnded ? 1 : 0,
        sessionId
      ]);

      return { sessionId, updated: true };

    } catch (error) {
      console.error('Erro ao atualizar sessão de vinculação:', error);
      throw error;
    }
  }

  async completeMatchLinking(postGameData: any): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    try {
      // Begin transaction
      await this.db.exec('BEGIN TRANSACTION');

      // Update the original queue match with real results
      const updateMatchQuery = `
        UPDATE matches 
        SET 
          riot_game_id = ?,
          actual_winner = ?,
          actual_duration = ?,
          linked_results = ?,
          completed_at = datetime('now')
        WHERE id = ?
      `;

      await this.db.run(updateMatchQuery, [
        postGameData.riotGameId,
        postGameData.winner,
        postGameData.duration,
        JSON.stringify(postGameData.playerResults),
        postGameData.queueMatchId
      ]);

      // Save individual player results
      for (const playerResult of postGameData.playerResults) {
        const playerResultQuery = `
          INSERT INTO player_match_results (
            player_id, match_id, champion, kills, deaths, assists,
            won, items, gold_earned, total_damage, dodged, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `;

        await this.db.run(playerResultQuery, [
          playerResult.playerId,
          postGameData.queueMatchId,
          playerResult.champion,
          playerResult.kills,
          playerResult.deaths,
          playerResult.assists,
          playerResult.won ? 1 : 0,
          JSON.stringify(playerResult.items),
          playerResult.goldEarned,
          playerResult.totalDamageDealt,
          playerResult.dodged ? 1 : 0
        ]);
      }

      // Mark linking session as completed
      await this.db.run(`
        UPDATE match_linking_sessions 
        SET game_ended = 1, completed_at = datetime('now')
        WHERE queue_match_id = ?
      `, [postGameData.queueMatchId]);

      await this.db.exec('COMMIT');

      return { 
        success: true, 
        matchId: postGameData.queueMatchId,
        riotGameId: postGameData.riotGameId 
      };

    } catch (error) {
      await this.db.exec('ROLLBACK');
      console.error('Erro ao completar vinculação:', error);
      throw error;
    }
  }

  async getLinkedMatches(playerId: number, limit: number = 20): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    try {
      const query = `
        SELECT 
          m.*,
          pmr.champion,
          pmr.kills,
          pmr.deaths,
          pmr.assists,
          pmr.won,
          pmr.items,
          pmr.gold_earned,
          pmr.total_damage,
          mls.riot_game_id,
          mls.pick_ban_result
        FROM matches m
        LEFT JOIN player_match_results pmr ON m.id = pmr.match_id AND pmr.player_id = ?
        LEFT JOIN match_linking_sessions mls ON m.id = mls.queue_match_id
        WHERE m.id IN (
          SELECT match_id FROM player_match_results WHERE player_id = ?
        )
        AND m.riot_game_id IS NOT NULL
        ORDER BY m.completed_at DESC
        LIMIT ?
      `;

      const matches = await this.db.all(query, [playerId, playerId, limit]);

      return matches.map(match => ({
        id: match.id,
        createdAt: new Date(match.created_at),
        completedAt: match.completed_at ? new Date(match.completed_at) : null,
        duration: match.actual_duration || match.duration,
        team1Players: JSON.parse(match.team1_players || '[]'),
        team2Players: JSON.parse(match.team2_players || '[]'),
        winner: match.actual_winner || match.winner_team,
        riotGameId: match.riot_game_id,
        pickBanResult: match.pick_ban_result ? JSON.parse(match.pick_ban_result) : null,
        playerStats: {
          champion: match.champion,
          kills: match.kills,
          deaths: match.deaths,
          assists: match.assists,
          won: match.won === 1,
          items: match.items ? JSON.parse(match.items) : [],
          goldEarned: match.gold_earned,
          totalDamage: match.total_damage
        }
      }));

    } catch (error) {
      console.error('Erro ao buscar partidas vinculadas:', error);
      throw error;
    }
  }

  async getMatchLinkingStats(): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    try {
      const stats = await this.db.get(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN game_ended = 1 THEN 1 END) as successful,
          AVG(
            CASE WHEN completed_at IS NOT NULL 
            THEN (julianday(completed_at) - julianday(linked_at)) * 24 * 60 
            END
          ) as average_time_minutes
        FROM match_linking_sessions
      `);

      return {
        total: stats.total || 0,
        successful: stats.successful || 0,
        averageTime: Math.round((stats.average_time_minutes || 0) * 60) // Convert to seconds
      };

    } catch (error) {
      console.error('Erro ao buscar estatísticas de vinculação:', error);
      throw error;
    }
  }
  // Método para atualizar status da partida
  async updateMatchStatus(matchId: number | string, status: string): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    try {
      await this.db.run(
        'UPDATE matches SET status = ? WHERE id = ? OR match_id = ?',
        [status, matchId, matchId]
      );
      console.log(`📊 Status da partida ${matchId} atualizado para: ${status}`);
    } catch (error) {
      console.error('Erro ao atualizar status da partida:', error);
      throw error;
    }
  }

  // ===== END MATCH LINKING METHODS =====
}
