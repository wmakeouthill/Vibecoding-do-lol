import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
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
  private db: Database | null = null;
  private dbPath: string;  constructor() {
    // Detectar se estamos em desenvolvimento ou produção
    const isDev = process.env.NODE_ENV === 'development' || __dirname.includes('dist');
    
    let databaseDir: string;
    
    if (isDev) {
      // Em desenvolvimento, usar pasta do projeto
      databaseDir = path.join(__dirname);
    } else {
      // Em produção (aplicação empacotada), usar diretório de dados do usuário
      const { app } = require('electron');
      if (app) {
        databaseDir = path.join(app.getPath('userData'), 'database');
      } else {
        // Fallback se não conseguir acessar o electron
        databaseDir = path.join(__dirname);
      }
    }
    
    if (!fs.existsSync(databaseDir)) {
      fs.mkdirSync(databaseDir, { recursive: true });
    }

    this.dbPath = path.join(databaseDir, 'database.sqlite');
    console.log(`🗃️ DatabaseManager inicializado em: ${this.dbPath}`);
  }

  async initialize(): Promise<void> {
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
      await this.createTables();
      await this.migrateDatabase(); // Adicionar migração
      console.log(`📁 Banco de dados inicializado em: ${this.dbPath}`);
    } catch (error) {
      console.error('Erro ao inicializar banco de dados:', error);
      throw error;
    }
  }

  // Método para migrar banco existente
  private async migrateDatabase(): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    try {
      // Verificar se as novas colunas existem na tabela players
      const playerColumns = await this.db.all("PRAGMA table_info(players)");
      const columnNames = playerColumns.map(col => col.name);
      
      // Adicionar colunas de MMR customizado se não existirem
      if (!columnNames.includes('custom_mmr')) {
        await this.db.exec('ALTER TABLE players ADD COLUMN custom_mmr INTEGER DEFAULT 1000');
        console.log('✅ Coluna custom_mmr adicionada');
      }
      
      if (!columnNames.includes('custom_peak_mmr')) {
        await this.db.exec('ALTER TABLE players ADD COLUMN custom_peak_mmr INTEGER DEFAULT 1000');
        console.log('✅ Coluna custom_peak_mmr adicionada');
      }
      
      if (!columnNames.includes('custom_games_played')) {
        await this.db.exec('ALTER TABLE players ADD COLUMN custom_games_played INTEGER DEFAULT 0');
        console.log('✅ Coluna custom_games_played adicionada');
      }
      
      if (!columnNames.includes('custom_wins')) {
        await this.db.exec('ALTER TABLE players ADD COLUMN custom_wins INTEGER DEFAULT 0');
        console.log('✅ Coluna custom_wins adicionada');
      }
      
      if (!columnNames.includes('custom_losses')) {
        await this.db.exec('ALTER TABLE players ADD COLUMN custom_losses INTEGER DEFAULT 0');
        console.log('✅ Coluna custom_losses adicionada');
      }
      
      if (!columnNames.includes('custom_win_streak')) {
        await this.db.exec('ALTER TABLE players ADD COLUMN custom_win_streak INTEGER DEFAULT 0');
        console.log('✅ Coluna custom_win_streak adicionada');
      }
      
      // Verificar e migrar tabela custom_matches
      const customMatchColumns = await this.db.all("PRAGMA table_info(custom_matches)");
      const customMatchColumnNames = customMatchColumns.map(col => col.name);
      
      if (!customMatchColumnNames.includes('lp_changes')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN lp_changes TEXT');
        console.log('✅ Coluna lp_changes adicionada');
      }
      
      if (!customMatchColumnNames.includes('average_mmr_team1')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN average_mmr_team1 INTEGER');
        console.log('✅ Coluna average_mmr_team1 adicionada');
      }
        if (!customMatchColumnNames.includes('average_mmr_team2')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN average_mmr_team2 INTEGER');
        console.log('✅ Coluna average_mmr_team2 adicionada');
      }
        if (!customMatchColumnNames.includes('participants_data')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN participants_data TEXT');
        console.log('✅ Coluna participants_data adicionada');
      }
      
      if (!customMatchColumnNames.includes('riot_game_id')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN riot_game_id TEXT');
        console.log('✅ Coluna riot_game_id adicionada');
      }
      
      if (!customMatchColumnNames.includes('detected_by_lcu')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN detected_by_lcu INTEGER DEFAULT 0');
        console.log('✅ Coluna detected_by_lcu adicionada');
      }
        if (!customMatchColumnNames.includes('notes')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN notes TEXT');
        console.log('✅ Coluna notes adicionada');
      }        if (!customMatchColumnNames.includes('updated_at')) {
        await this.db.exec('ALTER TABLE custom_matches ADD COLUMN updated_at DATETIME');
        console.log('✅ Coluna updated_at adicionada');
      }
      
    } catch (error) {
      console.error('Erro durante migração do banco:', error);
      // Não lançar erro para não quebrar a inicialização
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- Campos específicos para partidas customizadas
        custom_mmr INTEGER DEFAULT 1000,
        custom_peak_mmr INTEGER DEFAULT 1000,
        custom_games_played INTEGER DEFAULT 0,
        custom_wins INTEGER DEFAULT 0,
        custom_losses INTEGER DEFAULT 0,
        custom_win_streak INTEGER DEFAULT 0
      )
    `);

    // Tabela de partidas do sistema de matchmaking (fila interna)
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT UNIQUE NOT NULL,
        team1_players TEXT NOT NULL,
        team2_players TEXT NOT NULL,
        winner_team INTEGER,
        average_mmr_team1 INTEGER,
        average_mmr_team2 INTEGER,
        mmr_changes TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        riot_game_id TEXT,
        actual_winner INTEGER,
        actual_duration INTEGER,
        riot_id TEXT,
        pick_ban_data TEXT,
        detected_by_lcu INTEGER DEFAULT 0,
        linked_results TEXT
      )
    `);    // Tabela de partidas personalizadas do aplicativo
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS custom_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT UNIQUE NOT NULL,
        title TEXT,
        description TEXT,
        team1_players TEXT NOT NULL, -- JSON array de player IDs ou nomes
        team2_players TEXT NOT NULL, -- JSON array de player IDs ou nomes
        winner_team INTEGER, -- 1 ou 2, NULL se não finalizada
        score_team1 INTEGER DEFAULT 0,
        score_team2 INTEGER DEFAULT 0,
        duration INTEGER, -- duração em minutos
        pick_ban_data TEXT, -- JSON com dados de pick/ban
        game_mode TEXT DEFAULT 'CLASSIC',
        status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
        created_by TEXT, -- quem criou a partida        riot_game_id TEXT, -- ID da partida real do Riot (se vinculada)
        detected_by_lcu INTEGER DEFAULT 0,
        notes TEXT, -- observações da partida
        lp_changes TEXT, -- JSON com mudanças de LP por jogador
        average_mmr_team1 INTEGER, -- MMR médio do time 1
        average_mmr_team2 INTEGER, -- MMR médio do time 2
        participants_data TEXT, -- JSON com dados reais dos participantes (KDA, itens, etc.)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // Tabela de partidas do Riot API (cache/histórico)
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS riot_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT UNIQUE NOT NULL,
        game_mode TEXT,
        game_duration INTEGER,
        game_creation DATETIME,
        participants TEXT, -- JSON com dados dos participantes
        player_result TEXT, -- JSON com resultado específico do jogador
        player_puuid TEXT,
        queue_type TEXT,
        season_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // Tabela de sessões de linking de partidas
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS match_linking_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        player_id INTEGER NOT NULL,
        summoner_name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        match_data TEXT,
        riot_game_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (player_id) REFERENCES players (id)
      )
    `);

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
      { key: 'riot_api_key', value: '' },
      { key: 'enable_lcu_integration', value: 'true' }
    ];

    for (const setting of defaultSettings) {
      await this.db.run(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [setting.key, setting.value]
      );
    }
  }

  async completeMatch(matchId: number, winnerTeam: number, extraData: any = {}): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    console.log('📝 [DatabaseManager.completeMatch] Atualizando partida:', matchId, 'Winner:', winnerTeam, 'ExtraData:', extraData);

    let query = 'UPDATE matches SET winner_team = ?, status = "completed", completed_at = CURRENT_TIMESTAMP';
    let params: any[] = [winnerTeam];

    if (extraData.riotId) {
      query += ', riot_id = ?';
      params.push(extraData.riotId);
    }

    if (extraData.pickBanData) {
      query += ', pick_ban_data = ?';
      params.push(JSON.stringify(extraData.pickBanData));
    }

    if (extraData.detectedByLCU !== undefined) {
      query += ', detected_by_lcu = ?';
      params.push(extraData.detectedByLCU ? 1 : 0);
    }

    if (extraData.duration) {
      query += ', actual_duration = ?';
      params.push(extraData.duration);
    }

    if (extraData.mmrChanges) {
      query += ', mmr_changes = ?';
      params.push(JSON.stringify(extraData.mmrChanges));
    }

    query += ' WHERE id = ?';
    params.push(matchId);

    console.log('🔧 [DatabaseManager.completeMatch] Query:', query);
    console.log('📊 [DatabaseManager.completeMatch] Params:', params);

    await this.db.run(query, params);
    console.log('✅ [DatabaseManager.completeMatch] Partida atualizada com sucesso');
  }

  // Métodos de Player
  async getPlayer(playerId: number): Promise<Player | null> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    const result = await this.db.get('SELECT * FROM players WHERE id = ?', [playerId]);
    return result || null;
  }

  async getPlayerBySummonerName(summonerName: string): Promise<Player | null> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    const result = await this.db.get('SELECT * FROM players WHERE summoner_name = ?', [summonerName]);
    return result || null;
  }

  async createPlayer(playerData: Omit<Player, 'id'>): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    const result = await this.db.run(`
      INSERT INTO players (
        summoner_name, summoner_id, puuid, region, current_mmr, 
        peak_mmr, games_played, wins, losses, win_streak
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      playerData.summoner_name,
      playerData.summoner_id,
      playerData.puuid,
      playerData.region,
      playerData.current_mmr,
      playerData.peak_mmr,
      playerData.games_played,
      playerData.wins,
      playerData.losses,
      playerData.win_streak
    ]);

    return result.lastID!;
  }

  async updatePlayerMMR(playerId: number, mmrChange: number): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    const player = await this.getPlayer(playerId);
    if (!player) throw new Error(`Jogador com ID ${playerId} não encontrado`);

    const newMMR = player.current_mmr + mmrChange;
    const newPeakMMR = Math.max(player.peak_mmr, newMMR);
    
    await this.db.run(`
      UPDATE players 
      SET current_mmr = ?, peak_mmr = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [newMMR, newPeakMMR, playerId]);
  }

  // Métodos de Match
  async createMatch(
    team1Players: any[], 
    team2Players: any[], 
    avgMMR1: number, 
    avgMMR2: number,
    extraData: any = {}
  ): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await this.db.run(`
      INSERT INTO matches (
        match_id, team1_players, team2_players, average_mmr_team1, 
        average_mmr_team2, status, riot_id, pick_ban_data, detected_by_lcu
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      matchId,
      JSON.stringify(team1Players),
      JSON.stringify(team2Players),
      avgMMR1,
      avgMMR2,
      'pending',
      extraData.riotId || null,
      extraData.pickBanData ? JSON.stringify(extraData.pickBanData) : null,
      extraData.detectedByLCU ? 1 : 0
    ]);

    return result.lastID!;
  }

  async getPlayerMatches(playerId: number, limit: number = 20, offset: number = 0): Promise<Match[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    return await this.db.all(`
      SELECT * FROM matches 
      WHERE team1_players LIKE ? OR team2_players LIKE ?
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [`%"id":${playerId}%`, `%"id":${playerId}%`, limit, offset]);
  }
  async getRecentMatches(limit: number = 20): Promise<Match[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    return await this.db.all('SELECT * FROM custom_matches ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async deleteMatch(matchId: number): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    console.log('🗑️ [DatabaseManager.deleteMatch] Deletando partida:', matchId);
    await this.db.run('DELETE FROM matches WHERE id = ?', [matchId]);
    console.log('✅ [DatabaseManager.deleteMatch] Partida deletada');
  }

  // Métodos de Match Linking
  async createMatchLinkingSession(sessionData: any): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    const result = await this.db.run(`
      INSERT INTO match_linking_sessions (
        session_id, player_id, summoner_name, match_data, riot_game_id
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      sessionData.sessionId,
      sessionData.playerId,
      sessionData.summonerName,
      JSON.stringify(sessionData.matchData),
      sessionData.riotGameId
    ]);

    return {
      id: result.lastID,
      ...sessionData
    };
  }

  async updateMatchLinkingSession(sessionId: string, updateData: any): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    let query = 'UPDATE match_linking_sessions SET ';
    const params: any[] = [];
    const updates: string[] = [];

    if (updateData.status) {
      updates.push('status = ?');
      params.push(updateData.status);
    }

    if (updateData.matchData) {
      updates.push('match_data = ?');
      params.push(JSON.stringify(updateData.matchData));
    }

    if (updateData.riotGameId) {
      updates.push('riot_game_id = ?');
      params.push(updateData.riotGameId);
    }

    if (updateData.completed) {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    query += updates.join(', ') + ' WHERE session_id = ?';
    params.push(sessionId);

    await this.db.run(query, params);
    
    return await this.db.get('SELECT * FROM match_linking_sessions WHERE session_id = ?', [sessionId]);
  }

  async completeMatchLinking(postGameData: any): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    // Implementação básica - pode ser expandida conforme necessário
    return {
      success: true,
      data: postGameData
    };
  }

  async getLinkedMatches(playerId: number, limit: number = 20): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    return await this.db.all(`
      SELECT mls.*, m.* FROM match_linking_sessions mls
      LEFT JOIN matches m ON mls.riot_game_id = m.riot_game_id
      WHERE mls.player_id = ?
      ORDER BY mls.created_at DESC
      LIMIT ?
    `, [playerId, limit]);
  }

  async getMatchLinkingStats(): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    const total = await this.db.get('SELECT COUNT(*) as count FROM match_linking_sessions');
    const completed = await this.db.get('SELECT COUNT(*) as count FROM match_linking_sessions WHERE status = "completed"');
    const pending = await this.db.get('SELECT COUNT(*) as count FROM match_linking_sessions WHERE status = "pending"');

    return {
      total: total.count,
      completed: completed.count,
      pending: pending.count
    };
  }

  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    const result = await this.db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return result ? result.value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    await this.db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  // Métodos adicionais para MatchmakingService
  async recordQueueAction(action: string, playerId?: number, data?: any): Promise<void> {
    // Implementação básica para logging de ações da fila
    console.log(`📝 Queue Action: ${action}`, { playerId, data });
  }

  async updateMatchStatus(matchId: number, status: string): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    await this.db.run('UPDATE matches SET status = ? WHERE id = ?', [status, matchId]);
  }

  // ===== RIOT MATCH METHODS =====
  
  async getRiotMatchByGameId(gameId: string): Promise<any | null> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    return await this.db.get('SELECT * FROM riot_matches WHERE game_id = ?', [gameId]);
  }

  async saveRiotMatch(matchData: any): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    await this.db.run(
      `INSERT OR REPLACE INTO riot_matches 
       (game_id, game_mode, game_duration, game_creation, participants, player_result, player_puuid) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        matchData.gameId,
        matchData.gameMode,
        matchData.gameDuration,
        matchData.gameCreation,
        JSON.stringify(matchData.participants || []),
        JSON.stringify(matchData.playerResult || {}),
        matchData.playerPuuid || null
      ]
    );
  }

  async getPlayerByPuuid(puuid: string): Promise<Player | null> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    const result = await this.db.get('SELECT * FROM players WHERE puuid = ?', [puuid]);
    return result || null;
  }

  async getPlayerRiotMatches(playerId: number, limit: number = 20): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    // Get player PUUID first
    const player = await this.getPlayer(playerId);
    if (!player || !player.puuid) {
      return [];
    }

    const matches = await this.db.all(
      'SELECT * FROM riot_matches WHERE player_puuid = ? ORDER BY game_creation DESC LIMIT ?',
      [player.puuid, limit]
    );

    // Parse JSON fields and add convenience properties
    return matches.map(match => ({
      ...match,
      participants: JSON.parse(match.participants || '[]'),
      playerResult: JSON.parse(match.player_result || '{}'),
      won: JSON.parse(match.player_result || '{}').won || false,
      kills: JSON.parse(match.player_result || '{}').kills || 0,
      deaths: JSON.parse(match.player_result || '{}').deaths || 0,
      assists: JSON.parse(match.player_result || '{}').assists || 0
    }));
  }

  // ===== CUSTOM MATCHES METHODS =====
  
  async createCustomMatch(matchData: {
    title?: string;
    description?: string;
    team1Players: string[];
    team2Players: string[];
    createdBy: string;
    gameMode?: string;
  }): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const matchId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await this.db.run(
      `INSERT INTO custom_matches 
       (match_id, title, description, team1_players, team2_players, created_by, game_mode) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        matchId,
        matchData.title || `Partida Personalizada ${new Date().toLocaleDateString()}`,
        matchData.description || '',
        JSON.stringify(matchData.team1Players),
        JSON.stringify(matchData.team2Players),
        matchData.createdBy,
        matchData.gameMode || 'CLASSIC'
      ]
    );

    console.log(`🎮 Partida personalizada criada: ${matchId} (ID: ${result.lastID})`);
    return result.lastID!;
  }

  async updateCustomMatchStatus(matchId: number, status: string): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    await this.db.run(
      'UPDATE custom_matches SET status = ? WHERE id = ?',
      [status, matchId]
    );
    
    console.log(`📊 Status da partida personalizada ${matchId} atualizado para: ${status}`);
  }
  async completeCustomMatch(matchId: number, winnerTeam: number, extraData: any = {}): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    // Primeiro, buscar a partida para obter os jogadores
    const match = await this.getCustomMatchById(matchId);
    if (!match) {
      throw new Error(`Partida com ID ${matchId} não encontrada`);
    }

    // Calcular LP changes para todos os jogadores
    const lpChanges: any = {};
    let averageMMRTeam1 = 0;
    let averageMMRTeam2 = 0;

    // Buscar MMR dos jogadores de ambos os times
    const team1Players = match.team1_players || [];
    const team2Players = match.team2_players || [];

    // Calcular MMR médio dos times
    const team1MMRs: number[] = [];
    const team2MMRs: number[] = [];

    for (const playerName of team1Players) {
      const player = await this.db.get(
        'SELECT * FROM players WHERE summoner_name = ? OR id = ?',
        [playerName, parseInt(playerName) || 0]
      );
      const mmr = player?.custom_mmr || 1000;
      team1MMRs.push(mmr);
    }

    for (const playerName of team2Players) {
      const player = await this.db.get(
        'SELECT * FROM players WHERE summoner_name = ? OR id = ?',
        [playerName, parseInt(playerName) || 0]
      );
      const mmr = player?.custom_mmr || 1000;
      team2MMRs.push(mmr);
    }

    averageMMRTeam1 = team1MMRs.length > 0 ? Math.round(team1MMRs.reduce((a, b) => a + b, 0) / team1MMRs.length) : 1000;
    averageMMRTeam2 = team2MMRs.length > 0 ? Math.round(team2MMRs.reduce((a, b) => a + b, 0) / team2MMRs.length) : 1000;

    // Calcular LP e MMR changes para cada jogador
    // Time 1
    for (let i = 0; i < team1Players.length; i++) {
      const playerName = team1Players[i];
      const playerMMR = team1MMRs[i];
      const isWin = winnerTeam === 1;
      
      const lpChange = this.calculateLPChange(playerMMR, averageMMRTeam2, isWin);
      const mmrChange = this.calculateMMRChange(playerMMR, averageMMRTeam2, isWin);
      
      lpChanges[playerName] = { lp: lpChange, mmr: mmrChange };
      
      // Atualizar stats do jogador
      await this.updatePlayerCustomStats(playerName, isWin, lpChange, mmrChange);
    }

    // Time 2
    for (let i = 0; i < team2Players.length; i++) {
      const playerName = team2Players[i];
      const playerMMR = team2MMRs[i];
      const isWin = winnerTeam === 2;
      
      const lpChange = this.calculateLPChange(playerMMR, averageMMRTeam1, isWin);
      const mmrChange = this.calculateMMRChange(playerMMR, averageMMRTeam1, isWin);
      
      lpChanges[playerName] = { lp: lpChange, mmr: mmrChange };
      
      // Atualizar stats do jogador
      await this.updatePlayerCustomStats(playerName, isWin, lpChange, mmrChange);
    }

    const updateFields = [
      'winner_team = ?', 
      'status = ?', 
      'completed_at = CURRENT_TIMESTAMP',
      'lp_changes = ?',
      'average_mmr_team1 = ?',
      'average_mmr_team2 = ?'
    ];
    const updateValues = [
      winnerTeam, 
      'completed', 
      JSON.stringify(lpChanges),
      averageMMRTeam1,
      averageMMRTeam2
    ];

    // Adicionar campos opcionais
    if (extraData.duration !== undefined) {
      updateFields.push('duration = ?');
      updateValues.push(extraData.duration);
    }

    if (extraData.riotGameId !== undefined) {
      updateFields.push('riot_game_id = ?');
      updateValues.push(extraData.riotGameId);
    }    if (extraData.pickBanData !== undefined) {
      updateFields.push('pick_ban_data = ?');
      updateValues.push(typeof extraData.pickBanData === 'string' ? extraData.pickBanData : JSON.stringify(extraData.pickBanData));
    }

    if (extraData.participantsData !== undefined) {
      updateFields.push('participants_data = ?');
      updateValues.push(JSON.stringify(extraData.participantsData));
    }

    if (extraData.detectedByLCU !== undefined) {
      updateFields.push('detected_by_lcu = ?');
      updateValues.push(extraData.detectedByLCU ? 1 : 0);
    }

    if (extraData.scoreTeam1 !== undefined) {
      updateFields.push('score_team1 = ?');
      updateValues.push(extraData.scoreTeam1);
    }

    if (extraData.scoreTeam2 !== undefined) {
      updateFields.push('score_team2 = ?');
      updateValues.push(extraData.scoreTeam2);
    }

    if (extraData.notes !== undefined) {
      updateFields.push('notes = ?');
      updateValues.push(extraData.notes);
    }

    updateValues.push(matchId); // WHERE condition

    const query = `UPDATE custom_matches SET ${updateFields.join(', ')} WHERE id = ?`;
    
    console.log('📊 Atualizando partida customizada com LP changes:', { matchId, winnerTeam, lpChanges });
    console.log('🔧 Query SQL:', query);
    console.log('🔧 Valores:', updateValues);
    
    const result = await this.db.run(query, updateValues);
    console.log('🔄 Resultado da atualização:', result);
    
    // Verificar se alguma linha foi afetada
    if (result.changes === 0) {
      console.warn(`⚠️ Nenhuma partida encontrada com ID ${matchId} para atualizar`);
      
      // Verificar se a partida existe
      const existingMatch = await this.db.get('SELECT * FROM custom_matches WHERE id = ?', [matchId]);
      console.log('🔍 Partida existente no banco:', existingMatch);
      
      throw new Error(`Partida com ID ${matchId} não encontrada no banco de dados`);
    }    console.log(`✅ Partida personalizada ${matchId} finalizada - Vencedor: Time ${winnerTeam} (${result.changes} linha(s) afetada(s))`);
  }

  async updateCustomMatchWithRealData(matchId: number, realData: any): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    console.log('📊 [updateCustomMatchWithRealData] Atualizando partida com dados reais:', matchId);

    const updateFields = [];
    const updateValues = [];

    // Atualizar campos com dados reais
    if (realData.duration !== undefined) {
      updateFields.push('duration = ?');
      updateValues.push(realData.duration);
    }

    if (realData.pickBanData) {
      updateFields.push('pick_ban_data = ?');
      updateValues.push(JSON.stringify(realData.pickBanData));
    }

    if (realData.participantsData) {
      updateFields.push('participants_data = ?');
      updateValues.push(JSON.stringify(realData.participantsData));
    }

    if (realData.riotGameId) {
      updateFields.push('riot_game_id = ?');
      updateValues.push(realData.riotGameId);
    }

    if (realData.detectedByLCU !== undefined) {
      updateFields.push('detected_by_lcu = ?');
      updateValues.push(realData.detectedByLCU ? 1 : 0);
    }

    if (realData.notes) {
      updateFields.push('notes = ?');
      updateValues.push(realData.notes);
    }

    if (realData.gameMode) {
      updateFields.push('game_mode = ?');
      updateValues.push(realData.gameMode);
    }

    if (updateFields.length === 0) {
      console.log('⚠️ Nenhum campo para atualizar');
      return;
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(matchId);

    const query = `UPDATE custom_matches SET ${updateFields.join(', ')} WHERE id = ?`;
    
    console.log('🔧 Query SQL:', query);
    console.log('🔧 Valores:', updateValues);
    
    const result = await this.db.run(query, updateValues);
    console.log('🔄 Resultado da atualização:', result);
    
    if (result.changes === 0) {
      throw new Error(`Partida com ID ${matchId} não encontrada para atualização`);
    }

    console.log(`✅ Partida ${matchId} atualizada com dados reais (${result.changes} linha(s) afetada(s))`);
  }

  async getCustomMatches(limit: number = 20, offset: number = 0): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const matches = await this.db.all(
      'SELECT * FROM custom_matches ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    return matches.map(match => ({
      ...match,
      team1_players: JSON.parse(match.team1_players || '[]'),
      team2_players: JSON.parse(match.team2_players || '[]'),
      pick_ban_data: match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null
    }));
  }

  async getCustomMatchById(matchId: number): Promise<any | null> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const match = await this.db.get('SELECT * FROM custom_matches WHERE id = ?', [matchId]);
    
    if (!match) return null;

    return {
      ...match,
      team1_players: JSON.parse(match.team1_players || '[]'),
      team2_players: JSON.parse(match.team2_players || '[]'),
      pick_ban_data: match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null
    };
  }

  async getPlayerCustomMatches(playerIdentifier: string, limit: number = 20): Promise<any[]> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    console.log('🔍 Buscando partidas customizadas para:', playerIdentifier);    // Buscar tanto por ID numérico quanto por nome - apenas partidas completed com dados reais
    const matches = await this.db.all(`
      SELECT * FROM custom_matches 
      WHERE (team1_players LIKE '%' || ? || '%' OR team2_players LIKE '%' || ? || '%')
      AND participants_data IS NOT NULL
      AND status = 'completed'
      ORDER BY created_at DESC 
      LIMIT ?
    `, [playerIdentifier, playerIdentifier, limit]);

    console.log('📊 Partidas encontradas no banco:', matches.length);    return matches.map(match => {
      let team1Players = [];
      let team2Players = [];
      let lpChanges: any = {};
      let participantsData: any[] = [];
      
      try {
        team1Players = JSON.parse(match.team1_players || '[]');
        team2Players = JSON.parse(match.team2_players || '[]');
        lpChanges = match.lp_changes ? JSON.parse(match.lp_changes) : {};
        participantsData = match.participants_data ? JSON.parse(match.participants_data) : [];
      } catch (e) {
        console.warn('⚠️ Erro ao fazer parse dos dados da partida', match.id, ':', e);
        team1Players = [];
        team2Players = [];
        lpChanges = {};
        participantsData = [];
      }
      
      // Determinar em qual time o jogador está (melhor verificação)
      const isInTeam1 = team1Players.some((p: any) => {
        const pStr = p.toString().toLowerCase();
        const identifierStr = playerIdentifier.toString().toLowerCase();
        return pStr === identifierStr || pStr.includes(identifierStr) || identifierStr.includes(pStr);
      });
      
      const isInTeam2 = team2Players.some((p: any) => {
        const pStr = p.toString().toLowerCase();
        const identifierStr = playerIdentifier.toString().toLowerCase();
        return pStr === identifierStr || pStr.includes(identifierStr) || identifierStr.includes(pStr);
      });
      
      const playerTeam = isInTeam1 ? 1 : (isInTeam2 ? 2 : null);
      const playerWon = playerTeam === match.winner_team;

      // Encontrar LP change específico do jogador
      let playerLPChange = 0;
      let playerMMRChange = 0;
      
      // Buscar pelo nome exato primeiro
      if (lpChanges[playerIdentifier]) {
        playerLPChange = lpChanges[playerIdentifier].lp || 0;
        playerMMRChange = lpChanges[playerIdentifier].mmr || 0;
      } else {
        // Buscar por nome similar
        for (const [playerName, changes] of Object.entries(lpChanges)) {
          const nameStr = playerName.toString().toLowerCase();
          const identifierStr = playerIdentifier.toString().toLowerCase();
          if (nameStr === identifierStr || nameStr.includes(identifierStr) || identifierStr.includes(nameStr)) {
            playerLPChange = (changes as any).lp || 0;
            playerMMRChange = (changes as any).mmr || 0;
            break;
          }
        }
      }

      console.log('🎯 Partida processada:', {
        id: match.id,
        title: match.title,
        playerIdentifier,
        team1Count: team1Players.length,
        team2Count: team2Players.length,
        playerTeam,
        winnerTeam: match.winner_team,
        playerWon,
        playerLPChange,
        playerMMRChange,
        isInTeam1,
        isInTeam2
      });      return {
        ...match,
        team1_players: team1Players,
        team2_players: team2Players,
        pick_ban_data: match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null,
        participants_data: participantsData,
        lp_changes: lpChanges,
        player_team: playerTeam,
        player_won: playerWon,
        player_lp_change: playerLPChange,
        player_mmr_change: playerMMRChange
      };
    });
  }

  async getPlayerCustomMatchesCount(playerIdentifier: string): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    console.log('🔢 Contando partidas customizadas para:', playerIdentifier);

    // Contar apenas partidas completed com dados reais
    const result = await this.db.get(`
      SELECT COUNT(*) as count FROM custom_matches 
      WHERE (team1_players LIKE '%' || ? || '%' OR team2_players LIKE '%' || ? || '%')
      AND participants_data IS NOT NULL
      AND status = 'completed'
    `, [playerIdentifier, playerIdentifier]);

    const count = result?.count || 0;
    console.log('📊 Total de partidas customizadas encontradas:', count);
    
    return count;
  }

  async deleteCustomMatch(matchId: number): Promise<void> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    await this.db.run('DELETE FROM custom_matches WHERE id = ?', [matchId]);
    console.log(`🗑️ Partida personalizada ${matchId} deletada`);
  }

  // Método para obter estatísticas das partidas personalizadas
  async getCustomMatchStats(): Promise<any> {
    if (!this.db) throw new Error('Banco de dados não inicializado');

    const stats = await this.db.get(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_matches,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_matches,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_matches,
        COUNT(CASE WHEN detected_by_lcu = 1 THEN 1 END) as lcu_detected_matches,
        AVG(duration) as average_duration
      FROM custom_matches
    `);

    return {
      totalMatches: stats.total_matches || 0,
      completedMatches: stats.completed_matches || 0,
      pendingMatches: stats.pending_matches || 0,
      inProgressMatches: stats.in_progress_matches || 0,
      lcuDetectedMatches: stats.lcu_detected_matches || 0,
      averageDuration: Math.round(stats.average_duration || 0)
    };
  }

  async cleanupTestMatches(): Promise<number> {
    if (!this.db) throw new Error('Banco de dados não inicializado');
    
    console.log('🧹 [DatabaseManager.cleanupTestMatches] Iniciando limpeza de partidas de teste...');
      // Critérios para identificar partidas de teste:
    // 1. Partidas com session_id contendo "test_" (excluindo "simulate_real_" que são válidas)
    // 2. Partidas com player_identifier contendo "Player" genérico
    // 3. Partidas criadas há mais de 24h sem winner_team E sem riot_game_id (não vinculadas)
    
    const deleteQuery = `
      DELETE FROM custom_matches 
      WHERE 
        (session_id LIKE '%test_%' AND session_id NOT LIKE '%simulate_real_%') OR
        player_identifier LIKE '%Player%' OR
        (winner_team IS NULL AND riot_game_id IS NULL AND created_at < datetime('now', '-1 day'))
    `;
    
    const result = await this.db.run(deleteQuery);
    const deletedCount = result.changes || 0;
    
    console.log(`✅ [DatabaseManager.cleanupTestMatches] ${deletedCount} partidas de teste removidas`);
    return deletedCount;
  }

  /**
   * Busca estatísticas agregadas de todos os participantes das partidas customizadas
   * diretamente do campo participants_data
   */  async getParticipantsLeaderboard(limit: number = 100): Promise<any[]> {
    const query = `
      WITH participant_stats AS (
        SELECT 
          json_extract(participant.value, '$.summonerName') as summoner_name,
          json_extract(participant.value, '$.riotIdGameName') as riot_id_game_name,
          json_extract(participant.value, '$.riotIdTagline') as riot_id_tagline,
          json_extract(participant.value, '$.profileIconId') as profile_icon_id,
          json_extract(participant.value, '$.championName') as champion_name,
          json_extract(participant.value, '$.championId') as champion_id,
          CAST(json_extract(participant.value, '$.kills') AS INTEGER) as kills,
          CAST(json_extract(participant.value, '$.deaths') AS INTEGER) as deaths,
          CAST(json_extract(participant.value, '$.assists') AS INTEGER) as assists,
          CAST(json_extract(participant.value, '$.goldEarned') AS INTEGER) as gold_earned,
          CAST(json_extract(participant.value, '$.totalDamageDealtToChampions') AS INTEGER) as damage_dealt,
          CAST(json_extract(participant.value, '$.totalMinionsKilled') AS INTEGER) as cs,          CAST(json_extract(participant.value, '$.visionScore') AS INTEGER) as vision_score,
          CAST(json_extract(participant.value, '$.win') AS INTEGER) as win,
          cm.duration
        FROM custom_matches cm,
             json_each(cm.participants_data) as participant
        WHERE cm.status = 'completed'
          AND cm.participants_data IS NOT NULL
          AND json_extract(participant.value, '$.summonerName') IS NOT NULL
      ),      aggregated_stats AS (
        SELECT 
          summoner_name,
          riot_id_game_name,
          riot_id_tagline,          -- Pegar o primeiro profile_icon_id não nulo encontrado
          (SELECT profile_icon_id FROM participant_stats ps2 
           WHERE ps2.summoner_name = ps.summoner_name 
           AND ps2.profile_icon_id IS NOT NULL 
           LIMIT 1) as profile_icon_id,
          COUNT(*) as games_played,
          SUM(win) as wins,
          ROUND(AVG(CAST(kills AS REAL)), 1) as avg_kills,
          ROUND(AVG(CAST(deaths AS REAL)), 1) as avg_deaths,
          ROUND(AVG(CAST(assists AS REAL)), 1) as avg_assists,
          ROUND(AVG(CAST(gold_earned AS REAL)), 0) as avg_gold,
          ROUND(AVG(CAST(damage_dealt AS REAL)), 0) as avg_damage,
          ROUND(AVG(CAST(cs AS REAL)), 1) as avg_cs,
          ROUND(AVG(CAST(vision_score AS REAL)), 1) as avg_vision,
          MAX(kills) as max_kills,
          MAX(damage_dealt) as max_damage,
          -- Campeão mais jogado
          (SELECT 
            json_object(
              'name', champion_name,
              'id', champion_id,
              'games', count
            )
            FROM (
              SELECT 
                ps2.champion_name,
                ps2.champion_id,
                COUNT(*) as count
              FROM participant_stats ps2
              WHERE ps2.summoner_name = ps.summoner_name
              GROUP BY ps2.champion_name, ps2.champion_id
              ORDER BY count DESC
              LIMIT 1
            )
          ) as favorite_champion
        FROM participant_stats ps
        GROUP BY summoner_name, riot_id_game_name, riot_id_tagline
        HAVING games_played >= 1
      )
      SELECT 
        *,
        ROUND((CAST(wins AS REAL) / CAST(games_played AS REAL)) * 100, 1) as win_rate,
        CASE
          WHEN avg_deaths > 0 THEN ROUND((avg_kills + avg_assists) / avg_deaths, 2)
          ELSE ROUND(avg_kills + avg_assists, 2)
        END as kda_ratio,
        -- Calcular MMR baseado em performance
        ROUND(
          1000 + 
          (wins * 25) - 
          ((games_played - wins) * 15) +
          (avg_kills * 5) + 
          (avg_assists * 3) - 
          (avg_deaths * 8) +
          (CASE WHEN avg_deaths > 0 THEN ((avg_kills + avg_assists) / avg_deaths) * 10 ELSE 0 END),
          0
        ) as calculated_mmr
      FROM aggregated_stats
      ORDER BY calculated_mmr DESC, win_rate DESC, games_played DESC
      LIMIT ?
    `;    if (!this.db) {
      throw new Error('Database não está conectado');
    }

    const results = await this.db.all(query, [limit]);
    
    // Processar o favorite_champion JSON
    return results.map(row => ({
      ...row,
      favorite_champion: row.favorite_champion ? JSON.parse(row.favorite_champion) : null
    }));
  }

  /**
   * Calcula mudança de LP baseada no MMR do jogador vs MMR médio do time oponente
   */
  private calculateLPChange(playerMMR: number, opposingTeamMMR: number, isWin: boolean): number {
    const mmrDifference = opposingTeamMMR - playerMMR;
    const baseLPChange = 20; // LP base para vitória/derrota
    
    // Fator de dificuldade baseado na diferença de MMR
    const difficultyFactor = mmrDifference / 100; // cada 100 MMR de diferença = 10% de modificação
    
    if (isWin) {
      // Vitória: ganha mais LP se venceu time mais forte
      const lpGain = Math.round(baseLPChange + (difficultyFactor * 5));
      return Math.min(Math.max(lpGain, 10), 35); // Entre 10 e 35 LP
    } else {
      // Derrota: perde menos LP se perdeu para time mais forte
      const lpLoss = Math.round(-baseLPChange + (difficultyFactor * 3));
      return Math.min(Math.max(lpLoss, -35), -5); // Entre -35 e -5 LP
    }
  }

  /**
   * Calcula mudança de MMR baseada na diferença de força dos times
   */
  private calculateMMRChange(playerMMR: number, opposingTeamMMR: number, isWin: boolean): number {
    const mmrDifference = opposingTeamMMR - playerMMR;
    const baseMMRChange = 15; // MMR base para vitória/derrota
    
    // Fator de dificuldade baseado na diferença de MMR
    const difficultyFactor = mmrDifference / 100;
    
    if (isWin) {
      // Vitória: ganha mais MMR se venceu time mais forte
      const mmrGain = Math.round(baseMMRChange + (difficultyFactor * 8));
      return Math.min(Math.max(mmrGain, 5), 30); // Entre 5 e 30 MMR
    } else {
      // Derrota: perde menos MMR se perdeu para time mais forte
      const mmrLoss = Math.round(-baseMMRChange + (difficultyFactor * 5));
      return Math.min(Math.max(mmrLoss, -30), -3); // Entre -30 e -3 MMR
    }
  }

  /**
   * Atualiza estatísticas customizadas do jogador (MMR, LP, vitórias, etc.)
   */
  private async updatePlayerCustomStats(playerName: string, isWin: boolean, lpChange: number, mmrChange: number): Promise<void> {
    if (!this.db) {
      throw new Error('Database não está conectado');
    }

    // Verificar se jogador existe
    let player = await this.db.get('SELECT * FROM players WHERE summoner_name = ?', [playerName]);
    
    if (!player) {
      // Criar jogador se não existir
      await this.db.run(`
        INSERT INTO players (summoner_name, custom_mmr, custom_lp, custom_games_played, custom_wins, custom_losses)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [playerName, 1000 + mmrChange, 0 + lpChange, 1, isWin ? 1 : 0, isWin ? 0 : 1]);
    } else {
      // Atualizar jogador existente
      const newMMR = (player.custom_mmr || 1000) + mmrChange;
      const newLP = (player.custom_lp || 0) + lpChange;
      const newGamesPlayed = (player.custom_games_played || 0) + 1;
      const newWins = (player.custom_wins || 0) + (isWin ? 1 : 0);
      const newLosses = (player.custom_losses || 0) + (isWin ? 0 : 1);

      await this.db.run(`
        UPDATE players 
        SET custom_mmr = ?, custom_lp = ?, custom_games_played = ?, custom_wins = ?, custom_losses = ?
        WHERE summoner_name = ?
      `, [newMMR, newLP, newGamesPlayed, newWins, newLosses, playerName]);
    }
  }
}
