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

  async updatePlayerMMR(playerId: number, newMMR: number): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    await this.db.run(
      'UPDATE players SET current_mmr = ?, peak_mmr = MAX(peak_mmr, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newMMR, newMMR, playerId]
    );
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
}
