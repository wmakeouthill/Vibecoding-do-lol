import mysql from 'mysql2/promise';
import * as path from 'path';
import * as fs from 'fs';
import { DataDragonService } from '../services/DataDragonService';

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
  private dataDragonService: DataDragonService;

  constructor() {
    console.log('🗃️ DatabaseManager MySQL inicializado');
    this.dataDragonService = new DataDragonService();
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
        // Configurações específicas para MySQL 5.6
        charset: 'utf8mb4',
        timezone: 'local',
        // Configurações adicionais para UTF-8
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true,
        multipleStatements: true
      });

      // Testar conexão
      this.connection = await this.pool.getConnection();
      await this.connection.ping();

      // Configurar charset da conexão para UTF-8
      await this.connection.execute('SET NAMES utf8mb4');
      await this.connection.execute('SET CHARACTER SET utf8mb4');
      await this.connection.execute('SET character_set_connection=utf8mb4');

      console.log('✅ Conexão MySQL estabelecida com sucesso');

      // Criar tabelas se não existirem
      await this.createTables();

      // Verificar especificamente a tabela custom_matches
      await this.ensureCustomMatchesTable();

      await this.insertDefaultSettings();

      // Inicializar DataDragonService para carregar dados dos campeões
      console.log('🔍 Inicializando DataDragonService...');
      await this.dataDragonService.loadChampions();
      console.log('✅ DataDragonService inicializado com sucesso');

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
        updated_at TIMESTAMP NULL,
        pick_ban_data TEXT,
        linked_results TEXT,
        actual_winner INT,
        actual_duration INT,
        riot_id VARCHAR(255),
        mmr_changes TEXT
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
        \`key\` VARCHAR(191) PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    // Verificar e corrigir charset da tabela settings se necessário
    await this.ensureSettingsTableCharset();

    // Tabela para persistir jogadores na fila
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS queue_players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_id BIGINT NOT NULL,
        summoner_name VARCHAR(255) NOT NULL UNIQUE,
        region VARCHAR(10) NOT NULL,
        custom_lp INT DEFAULT 0,
        primary_lane VARCHAR(20),
        secondary_lane VARCHAR(20),
        join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        queue_position INT,
        is_active TINYINT DEFAULT 1
        -- ✅ REMOVIDO: FOREIGN KEY (player_id) REFERENCES players (id) - permite bots sem registro na tabela players
      )
    `);

    // ✅ CORREÇÃO: Garantir que a constraint UNIQUE existe na tabela queue_players
    try {
      await this.pool.execute(`
        ALTER TABLE queue_players 
        ADD CONSTRAINT unique_summoner_name UNIQUE (summoner_name)
      `);
      console.log('✅ Constraint UNIQUE adicionada para summoner_name na tabela queue_players');
    } catch (error: any) {
      // Se a constraint já existe, isso é normal
      if (error.message.includes('Duplicate key name') || error.message.includes('already exists')) {
        console.log('ℹ️ Constraint UNIQUE já existe para summoner_name na tabela queue_players');
      } else {
        console.warn('⚠️ Erro ao adicionar constraint UNIQUE (pode ser normal):', error.message);
      }
    }

    console.log('✅ Tabelas MySQL criadas/verificadas com sucesso');
    
    // ✅ CORREÇÃO: Alterar estrutura da tabela queue_players se necessário
    await this.ensureQueuePlayersStructure();
    
    // ✅ NOVO: Adicionar coluna de status de aceitação durante inicialização
    await this.addAcceptanceStatusColumn();
  }

  private async ensureQueuePlayersStructure(): Promise<void> {
    if (!this.pool) return;

    try {
      // ✅ PRIMEIRO: Remover FOREIGN KEY constraint se existir
      await this.removeQueuePlayersForeignKey();
      
      // ✅ SEGUNDO: Verificar se a tabela queue_players existe e alterar player_id para BIGINT se necessário
      const [columns] = await this.pool.execute(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'queue_players' AND COLUMN_NAME = 'player_id'
      `);
      
      const columnInfo = columns as any[];
      if (columnInfo.length > 0 && columnInfo[0].DATA_TYPE === 'int') {
        console.log('🔄 [Database] Alterando player_id para BIGINT na tabela queue_players...');
        await this.pool.execute(`
          ALTER TABLE queue_players 
          MODIFY COLUMN player_id BIGINT NOT NULL
        `);
        console.log('✅ [Database] player_id alterado para BIGINT com sucesso');
      } else {
        console.log('ℹ️ [Database] player_id já é BIGINT ou tabela não existe');
      }
    } catch (error: any) {
      console.warn('⚠️ [Database] Erro ao verificar/alterar estrutura da tabela queue_players:', error.message);
    }
  }

  private async removeQueuePlayersForeignKey(): Promise<void> {
    if (!this.pool) return;

    try {
      // Verificar se existe FOREIGN KEY constraint
      const [constraints] = await this.pool.execute(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_NAME = 'queue_players' 
        AND REFERENCED_TABLE_NAME = 'players'
        AND CONSTRAINT_SCHEMA = DATABASE()
      `);
      
      const constraintList = constraints as any[];
      if (constraintList.length > 0) {
        const constraintName = constraintList[0].CONSTRAINT_NAME;
        console.log(`🔄 [Database] Removendo FOREIGN KEY constraint: ${constraintName}`);
        
        await this.pool.execute(`
          ALTER TABLE queue_players 
          DROP FOREIGN KEY ${constraintName}
        `);
        
        console.log('✅ [Database] FOREIGN KEY constraint removida com sucesso');
      } else {
        console.log('ℹ️ [Database] Nenhuma FOREIGN KEY constraint encontrada');
      }
    } catch (error: any) {
      console.warn('⚠️ [Database] Erro ao remover FOREIGN KEY constraint:', error.message);
      
      // ✅ FALLBACK: Se não conseguir remover a constraint, recriar a tabela
      console.log('🔄 [Database] Tentando recriar tabela queue_players...');
      await this.recreateQueuePlayersTable();
    }
  }

  private async recreateQueuePlayersTable(): Promise<void> {
    if (!this.pool) return;

    try {
      console.log('🔄 [Database] Recriando tabela queue_players...');
      
      // Fazer backup dos dados existentes
      const [existingData] = await this.pool.execute('SELECT * FROM queue_players');
      const data = existingData as any[];
      
      // Dropar tabela antiga
      await this.pool.execute('DROP TABLE IF EXISTS queue_players');
      
      // Recriar tabela sem FOREIGN KEY
      await this.pool.execute(`
        CREATE TABLE queue_players (
          id INT AUTO_INCREMENT PRIMARY KEY,
          player_id BIGINT NOT NULL,
          summoner_name VARCHAR(255) NOT NULL UNIQUE,
          region VARCHAR(10) NOT NULL,
          custom_lp INT DEFAULT 0,
          primary_lane VARCHAR(20),
          secondary_lane VARCHAR(20),
          join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          queue_position INT,
          is_active TINYINT DEFAULT 1
        )
      `);
      
      console.log('✅ [Database] Tabela queue_players recriada com sucesso');
      
      // Restaurar dados se existiam
      if (data.length > 0) {
        console.log(`🔄 [Database] Restaurando ${data.length} registros...`);
        for (const row of data) {
          await this.pool.execute(`
            INSERT INTO queue_players (
              player_id, summoner_name, region, custom_lp, primary_lane, secondary_lane, 
              join_time, queue_position, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            row.player_id, row.summoner_name, row.region, row.custom_lp,
            row.primary_lane, row.secondary_lane, row.join_time,
            row.queue_position, row.is_active
          ]);
        }
        console.log('✅ [Database] Dados restaurados com sucesso');
      }
    } catch (error: any) {
      console.error('❌ [Database] Erro ao recriar tabela queue_players:', error.message);
    }
  }

  private async insertDefaultSettings(): Promise<void> {
    if (!this.pool) return;

    const defaultSettings = [
      { key: 'mmr_gain_base', value: '25' },
      { key: 'mmr_loss_base', value: '25' },
      { key: 'mmr_k_factor', value: '32' },
      { key: 'queue_timeout_minutes', value: '180' },
      { key: 'min_players_for_match', value: '10' },
      { key: 'max_mmr_difference', value: '200' },
      { key: 'app_version', value: '1.0.0' },
      { key: 'riot_api_key', value: '' },
      { key: 'enable_lcu_integration', value: 'true' },
      { key: 'discord_channel', value: 'lol-matchmaking' }
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
        [`${playerId}`, `${playerId}`, limit, offset]
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



  // Método genérico para atualizar partida customizada
  async updateCustomMatch(matchId: number, updateData: any): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      // Garantir que a tabela existe antes de atualizar
      await this.ensureCustomMatchesTable();

      // Construir query dinamicamente baseada nos campos fornecidos
      const fields: string[] = [];
      const values: any[] = [];

      // Campos permitidos para atualização
      const allowedFields = [
        'title', 'description', 'status', 'winner_team', 'duration',
        'pick_ban_data', 'participants_data', 'riot_game_id', 'detected_by_lcu',
        'notes', 'draft_data', 'game_data', 'game_mode'
      ];

      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);

          // Converter objetos para JSON se necessário
          if (typeof value === 'object' && value !== null) {
            values.push(JSON.stringify(value));
          } else {
            values.push(value);
          }
        }
      }

      // Sempre adicionar updated_at
      fields.push('updated_at = CURRENT_TIMESTAMP');

      // Adicionar matchId no final
      values.push(matchId);

      const query = `UPDATE custom_matches SET ${fields.join(', ')} WHERE id = ?`;

      console.log(`🔄 [updateCustomMatch] Atualizando partida ${matchId}:`, {
        fields: fields.length,
        updateData: Object.keys(updateData)
      });

      await this.pool.execute(query, values);

      console.log(`✅ [updateCustomMatch] Partida ${matchId} atualizada com sucesso`);
    } catch (error) {
      console.error(`❌ [updateCustomMatch] Erro ao atualizar partida ${matchId}:`, error);
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
      // ✅ PRIMEIRO: Remover qualquer entrada anterior (ativa ou inativa) do mesmo jogador
      await this.pool.execute(
        'DELETE FROM queue_players WHERE player_id = ?',
        [playerId]
      );
      console.log(`🧹 [Database] Limpeza: removidas entradas anteriores de ${summonerName} (ID: ${playerId})`);

      // ✅ SEGUNDO: Inserir novo jogador na fila
      await this.pool.execute(
        `INSERT INTO queue_players (
          player_id, summoner_name, region, custom_lp, primary_lane, secondary_lane, queue_position
        ) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(queue_position), 0) + 1 FROM queue_players qp WHERE is_active = 1))`,
        [
          playerId,
          summonerName,
          region,
          customLp,
          preferences?.primaryLane || null,
          preferences?.secondaryLane || null
        ]
      );

      console.log(`✅ [Database] Jogador ${summonerName} (ID: ${playerId}) adicionado à fila (única entrada)`);
    } catch (error) {
      console.error('❌ [Database] Erro ao adicionar jogador à fila:', error);
      throw error;
    }
  }

  async removePlayerFromQueue(playerId: number): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      // ✅ DEBUG: Verificar se o jogador existe na tabela antes de remover
      console.log(`🔍 [Database] Verificando se jogador ${playerId} existe na tabela queue_players...`);
      const [existingRows] = await this.pool.execute(
        'SELECT * FROM queue_players WHERE player_id = ?',
        [playerId]
      );
      
      if ((existingRows as any[]).length === 0) {
        console.log(`⚠️ [Database] Jogador ${playerId} não encontrado na tabela queue_players`);
        
        // ✅ DEBUG: Mostrar todos os jogadores na tabela para debug
        const [allPlayers] = await this.pool.execute('SELECT player_id, summoner_name FROM queue_players');
        console.log(`🔍 [Database] Jogadores atualmente na tabela queue_players:`, allPlayers);
        return;
      }
      
      console.log(`✅ [Database] Jogador ${playerId} encontrado na tabela:`, existingRows);
      
      // ✅ CORREÇÃO: Deletar linha ao invés de marcar is_active = 0
      console.log(`🔍 [Database] Executando DELETE para jogador ${playerId}...`);
      const [result] = await this.pool.execute(
        'DELETE FROM queue_players WHERE player_id = ?',
        [playerId]
      );

      const affectedRows = (result as any).affectedRows;
      if (affectedRows > 0) {
        console.log(`✅ [Database] Jogador (ID: ${playerId}) removido da fila - linha deletada`);
      } else {
        console.log(`⚠️ [Database] Nenhuma linha encontrada para remover (ID: ${playerId})`);
      }
    } catch (error) {
      console.error('❌ [Database] Erro ao remover jogador da fila:', error);
      throw error;
    }
  }

  // ✅ NOVO: Remover jogador da fila por summoner_name
  async removePlayerFromQueueBySummonerName(summonerName: string): Promise<boolean> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      console.log(`🔍 [Database] Tentando remover jogador da fila por summoner_name: ${summonerName}`);
      
      // ✅ CORREÇÃO: Primeiro tentar busca exata
      let [result] = await this.pool.execute(
        'DELETE FROM queue_players WHERE summoner_name = ?',
        [summonerName]
      );

      let affectedRows = (result as any).affectedRows;
      
      if (affectedRows > 0) {
        console.log(`✅ [Database] Jogador (${summonerName}) removido da fila - busca exata`);
        return true;
      }

      // ✅ NOVO: Se não encontrou com busca exata, tentar formatos alternativos
      console.log(`🔍 [Database] Busca exata falhou, tentando formatos alternativos...`);
      
      // Caso 1: Se o nome recebido não tem #, tentar adicionar #BR1
      if (!summonerName.includes('#')) {
        const nameWithTag = `${summonerName}#BR1`;
        console.log(`🔍 [Database] Tentando com #BR1: ${nameWithTag}`);
        
        [result] = await this.pool.execute(
          'DELETE FROM queue_players WHERE summoner_name = ?',
          [nameWithTag]
        );
        
        affectedRows = (result as any).affectedRows;
        if (affectedRows > 0) {
          console.log(`✅ [Database] Jogador removido com formato ${nameWithTag}`);
          return true;
        }
      }
      
      // Caso 2: Se o nome tem #, tentar buscar só a parte antes do #
      if (summonerName.includes('#')) {
        const nameOnly = summonerName.split('#')[0];
        console.log(`🔍 [Database] Tentando só o gameName: ${nameOnly}`);
        
        [result] = await this.pool.execute(
          'DELETE FROM queue_players WHERE summoner_name LIKE ?',
          [`${nameOnly}#%`]
        );
        
        affectedRows = (result as any).affectedRows;
        if (affectedRows > 0) {
          console.log(`✅ [Database] Jogador removido com busca parcial ${nameOnly}#%`);
          return true;
        }
      }
      
      // ✅ DEBUG: Mostrar jogadores atualmente na fila para debug
      console.log(`⚠️ [Database] Nenhuma linha encontrada para remover (${summonerName})`);
      
      const [players] = await this.pool.execute(
        'SELECT summoner_name FROM queue_players ORDER BY join_time ASC'
      );
      
      console.log(`🔍 [Database] Jogadores atualmente na fila:`, 
        (players as any[]).map(p => p.summoner_name)
      );
      
      return false;
    } catch (error) {
      console.error('❌ [Database] Erro ao remover jogador da fila por summoner_name:', error);
      throw error;
    }
  }

  // ✅ NOVO: Adicionar coluna de status de aceitação na tabela queue_players
  async addAcceptanceStatusColumn(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      // Verificar se a coluna já existe
      const [columns] = await this.pool.execute(
        "SHOW COLUMNS FROM queue_players LIKE 'acceptance_status'"
      );
      
      if ((columns as any[]).length === 0) {
        // Adicionar coluna se não existir
        await this.pool.execute(
          'ALTER TABLE queue_players ADD COLUMN acceptance_status TINYINT DEFAULT 0 COMMENT "0=pendente, 1=aceito, 2=recusado"'
        );
        console.log('✅ [Database] Coluna acceptance_status adicionada à tabela queue_players');
      } else {
        console.log('✅ [Database] Coluna acceptance_status já existe');
      }
    } catch (error) {
      console.error('❌ [Database] Erro ao adicionar coluna acceptance_status:', error);
      throw error;
    }
  }

  // ✅ NOVO: Atualizar status de aceitação de um jogador
  async updatePlayerAcceptanceStatus(summonerName: string, status: number): Promise<boolean> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      console.log(`🔍 [Database] Atualizando status de aceitação para ${summonerName}: ${status}`);
      
      const [result] = await this.pool.execute(
        'UPDATE queue_players SET acceptance_status = ? WHERE summoner_name = ?',
        [status, summonerName]
      );

      const affectedRows = (result as any).affectedRows;
      if (affectedRows > 0) {
        console.log(`✅ [Database] Status de aceitação atualizado para ${summonerName}: ${status}`);
        return true;
      } else {
        console.log(`⚠️ [Database] Jogador ${summonerName} não encontrado para atualizar status`);
        return false;
      }
    } catch (error) {
      console.error('❌ [Database] Erro ao atualizar status de aceitação:', error);
      throw error;
    }
  }

  // ✅ NOVO: Limpar status de aceitação de todos os jogadores (reset)
  async clearAllAcceptanceStatus(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      await this.pool.execute(
        'UPDATE queue_players SET acceptance_status = 0'
      );
      console.log('✅ [Database] Status de aceitação de todos os jogadores resetado');
    } catch (error) {
      console.error('❌ [Database] Erro ao limpar status de aceitação:', error);
      throw error;
    }
  }

  // ✅ NOVO: Remover jogadores que recusaram a partida
  async removeDeclinedPlayers(): Promise<number> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      console.log('🗑️ [Database] Removendo jogadores que recusaram a partida...');
      
      const [result] = await this.pool.execute(
        'DELETE FROM queue_players WHERE acceptance_status = 2'
      );

      const affectedRows = (result as any).affectedRows;
      console.log(`✅ [Database] ${affectedRows} jogadores que recusaram foram removidos da fila`);
      return affectedRows;
    } catch (error) {
      console.error('❌ [Database] Erro ao remover jogadores que recusaram:', error);
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
      // ✅ CORREÇÃO: Deletar todas as entradas ao invés de marcar is_active = 0
      const [result] = await this.pool.execute('DELETE FROM queue_players');
      
      const affectedRows = (result as any).affectedRows;
      console.log(`✅ [Database] Fila limpa - ${affectedRows} jogadores removidos`);
    } catch (error) {
      console.error('❌ [Database] Erro ao limpar fila:', error);
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
        [`${playerId}`, `${playerId}`, limit]
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
      console.log('🔍 [Database] Verificando link Discord:', { discordId, gameName, tagLine });

      // Buscar o link primeiro
      const [rows] = await this.pool.execute(
        'SELECT * FROM discord_lol_links WHERE discord_id = ?',
        [discordId]
      );

      const results = rows as any[];
      if (results.length === 0) {
        console.log('❌ [Database] Link Discord não encontrado para ID:', discordId);
        return false;
      }

      const link = results[0];
      console.log('🔍 [Database] Link encontrado:', {
        linkGameName: link.game_name,
        linkTagLine: link.tag_line,
        requestGameName: gameName,
        requestTagLine: tagLine
      });

      // Comparar gameName (case insensitive)
      const gameNameMatch = link.game_name.toLowerCase() === gameName.toLowerCase();

      // Comparar tagLine (remover # se presente)
      const cleanLinkTagLine = link.tag_line.replace('#', '');
      const cleanRequestTagLine = tagLine.replace('#', '');
      const tagLineMatch = cleanLinkTagLine.toLowerCase() === cleanRequestTagLine.toLowerCase();

      console.log('🔍 [Database] Comparação:', {
        gameNameMatch,
        tagLineMatch,
        cleanLinkTagLine,
        cleanRequestTagLine
      });

      return gameNameMatch && tagLineMatch;
    } catch (error) {
      console.error('❌ [Database] Erro ao verificar link Discord:', error);
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
        console.log('🔄 Calculando lpChanges com novo sistema MMR para partida', matchId);

        const team1Players = JSON.parse(match.team1_players);
        const team2Players = JSON.parse(match.team2_players);

        lpChanges = {};

        // Calcular MMR médio dos times
        const team1AverageMMR = await this.calculateTeamAverageMMRWithRealData(team1Players);
        const team2AverageMMR = await this.calculateTeamAverageMMRWithRealData(team2Players);

        console.log(`📊 MMR médio - Time 1: ${team1AverageMMR}, Time 2: ${team2AverageMMR}`);

        // Processar time 1
        for (const playerString of team1Players) {
          if (playerString && typeof playerString === 'string') {
            const playerMMR = await this.getPlayerCurrentMMR(playerString);
            const isWin = winnerTeam === 1;
            const opponentMMR = team2AverageMMR;

            const lpChange = this.calculateLPChange(playerMMR, opponentMMR, isWin);
            lpChanges[playerString] = lpChange;

            console.log(`👤 ${playerString} (MMR: ${playerMMR}) vs Time 2 (MMR: ${opponentMMR}) - ${isWin ? 'VITÓRIA' : 'DERROTA'}: ${lpChange > 0 ? '+' : ''}${lpChange} LP`);
          }
        }

        // Processar time 2
        for (const playerString of team2Players) {
          if (playerString && typeof playerString === 'string') {
            const playerMMR = await this.getPlayerCurrentMMR(playerString);
            const isWin = winnerTeam === 2;
            const opponentMMR = team1AverageMMR;

            const lpChange = this.calculateLPChange(playerMMR, opponentMMR, isWin);
            lpChanges[playerString] = lpChange;

            console.log(`👤 ${playerString} (MMR: ${playerMMR}) vs Time 1 (MMR: ${opponentMMR}) - ${isWin ? 'VITÓRIA' : 'DERROTA'}: ${lpChange > 0 ? '+' : ''}${lpChange} LP`);
          }
        }

        console.log('📊 lpChanges calculados com novo sistema:', lpChanges);
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

  /**
   * Verifica se a função JSON_CONTAINS está disponível no MySQL
   */
  private async isJsonContainsAvailable(): Promise<boolean> {
    if (!this.pool) return false;
    
    try {
      await this.pool.execute('SELECT JSON_CONTAINS(\'["test"]\', \'"test"\') as test');
      return true;
    } catch (error: any) {
      console.log('⚠️ JSON_CONTAINS não está disponível no MySQL:', error.message);
      return false;
    }
  }

  async getPlayerCustomMatches(playerIdentifier: string, limit: number = 20): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      // Garantir que a tabela existe antes de consultar
      await this.ensureCustomMatchesTable();

      // Validar parâmetros
      if (!playerIdentifier || typeof playerIdentifier !== 'string') {
        console.warn('getPlayerCustomMatches: playerIdentifier inválido:', playerIdentifier);
        return [];
      }

      if (typeof limit !== 'number' || limit < 1) {
        console.warn('getPlayerCustomMatches: limit inválido, usando padrão 20:', limit);
        limit = 20;
      }

      const limitValue = Math.min(limit, 100); // Máximo 100 registros

      // Verificar se JSON_CONTAINS está disponível
      const useJsonContains = await this.isJsonContainsAvailable();

      let query: string;
      let params: any[];

      if (useJsonContains) {
        // Query com JSON_CONTAINS
        query = `
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
            WHERE JSON_CONTAINS(team1_players, ?) OR JSON_CONTAINS(team2_players, ?)
            ORDER BY created_at DESC
        `;
        const playerJson = JSON.stringify(playerIdentifier.trim());
        params = [playerJson, playerJson];
      } else {
        // Fallback com LIKE
        query = `
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
        const fallbackSearchTerm = `%"${playerIdentifier.trim()}"%`;
        params = [fallbackSearchTerm, fallbackSearchTerm];
      }

      console.log('🔍 [getPlayerCustomMatches] Query:', query);
      console.log('🔍 [getPlayerCustomMatches] Params:', params);

      const [rows] = await this.pool.execute(query, params);
      console.log('✅ [getPlayerCustomMatches] Query executada com sucesso');

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

      // Verificar se JSON_CONTAINS está disponível
      const useJsonContains = await this.isJsonContainsAvailable();

      let query: string;
      let params: any[];

      if (useJsonContains) {
        // Query com JSON_CONTAINS
        query = `
          SELECT COUNT(*) as count FROM custom_matches 
          WHERE JSON_CONTAINS(team1_players, ?) OR JSON_CONTAINS(team2_players, ?)
        `;
        const playerJson = JSON.stringify(playerIdentifier.trim());
        params = [playerJson, playerJson];
      } else {
        // Fallback com LIKE
        query = `
          SELECT COUNT(*) as count FROM custom_matches 
          WHERE team1_players LIKE ? OR team2_players LIKE ?
        `;
        const fallbackSearchTerm = `%"${playerIdentifier.trim()}"%`;
        params = [fallbackSearchTerm, fallbackSearchTerm];
      }

      console.log('🔍 [getPlayerCustomMatchesCount] Query:', query);
      console.log('🔍 [getPlayerCustomMatchesCount] Params:', params);

      const [rows] = await this.pool.execute(query, params);
      console.log('✅ [getPlayerCustomMatchesCount] Query executada com sucesso');

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

    console.log(`🗑️ [Database] Tentando deletar partida customizada ID: ${matchId}`);

    try {
      // Garantir que a tabela existe antes de deletar
      await this.ensureCustomMatchesTable();

      // Verificar se a partida existe antes de deletar
      const [checkResult] = await this.pool.execute('SELECT id FROM custom_matches WHERE id = ?', [matchId]);
      const exists = (checkResult as any[]).length > 0;

      console.log(`🔍 [Database] Partida ${matchId} existe no banco: ${exists}`);

      if (!exists) {
        console.log(`⚠️ [Database] Partida ${matchId} não encontrada no banco para deletar`);
        return;
      }

      const [deleteResult] = await this.pool.execute('DELETE FROM custom_matches WHERE id = ?', [matchId]);
      const affectedRows = (deleteResult as any).affectedRows;

      console.log(`✅ [Database] Partida ${matchId} deletada com sucesso. Linhas afetadas: ${affectedRows}`);
    } catch (error) {
      console.error(`❌ [Database] Erro ao deletar partida customizada ${matchId}:`, error);
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

  async cleanupTestMatches(): Promise<{ deletedCount: number, remainingMatches: number, deletedMatches: any[] }> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      console.log('🧹 [cleanupTestMatches] Iniciando limpeza COMPLETA da tabela custom_matches...');

      // Garantir que a tabela existe antes de limpar
      await this.ensureCustomMatchesTable();

      // Buscar todas as partidas antes de deletar para mostrar detalhes
      const [allMatches] = await this.pool.execute(`
        SELECT id, title, description, team1_players, team2_players, created_by, status, created_at, winner_team, custom_lp
        FROM custom_matches
        ORDER BY created_at DESC
      `);

      const matchesToDelete = allMatches as any[];
      console.log(`🔍 [cleanupTestMatches] Encontradas ${matchesToDelete.length} partidas para remoção completa`);

      if (matchesToDelete.length === 0) {
        console.log('✅ [cleanupTestMatches] Nenhuma partida encontrada para remoção');
        return {
          deletedCount: 0,
          remainingMatches: 0,
          deletedMatches: []
        };
      }

      // Deletar TODAS as partidas da tabela
      const [deleteResult] = await this.pool.execute('DELETE FROM custom_matches');

      const deletedCount = (deleteResult as any).affectedRows;
      const remainingMatches = await this.getCustomMatchesCount();

      // Preparar detalhes das partidas deletadas
      const deletedMatches = matchesToDelete.map(match => ({
        id: match.id,
        title: match.title || 'Sem título',
        description: match.description || 'Sem descrição',
        created_by: match.created_by || 'Sistema',
        status: match.status || 'unknown',
        created_at: match.created_at,
        winner_team: match.winner_team,
        custom_lp: match.custom_lp,
        reasons: ['Limpeza completa da tabela']
      }));

      console.log(`✅ [cleanupTestMatches] Limpeza COMPLETA concluída: ${deletedCount} partidas removidas, ${remainingMatches} restantes`);

      return {
        deletedCount,
        remainingMatches,
        deletedMatches
      };

    } catch (error) {
      console.error('❌ [cleanupTestMatches] Erro ao limpar partidas:', error);
      throw error;
    }
  }

  /**
   * Determina as razões para deletar uma partida
   */
  private getDeletionReasons(match: any): string[] {
    const reasons: string[] = [];

    if (match.title?.toLowerCase().includes('test')) reasons.push('Título contém "test"');
    if (match.description?.toLowerCase().includes('test')) reasons.push('Descrição contém "test"');
    if (match.created_by?.toLowerCase().includes('test')) reasons.push('Criador contém "test"');
    if (match.created_by?.toLowerCase().includes('bot')) reasons.push('Criador contém "bot"');
    if (match.created_by?.toLowerCase().includes('fake')) reasons.push('Criador contém "fake"');

    if (match.team1_players?.toLowerCase().includes('bot')) reasons.push('Time 1 contém "bot"');
    if (match.team2_players?.toLowerCase().includes('bot')) reasons.push('Time 2 contém "bot"');
    if (match.team1_players?.toLowerCase().includes('test')) reasons.push('Time 1 contém "test"');
    if (match.team2_players?.toLowerCase().includes('test')) reasons.push('Time 2 contém "test"');

    if (['cancelled', 'abandoned', 'error'].includes(match.status)) {
      reasons.push(`Status suspeito: ${match.status}`);
    }

    if (match.team1_players === '[]' || match.team2_players === '[]') {
      reasons.push('Time vazio');
    }

    if (!match.winner_team && match.custom_lp === 0) {
      reasons.push('Partida sem resultado e sem LP');
    }

    return reasons;
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

  /**
   * Processa dados de participantes usando o DataDragonService
   * Similar ao método processParticipants do DataDragonService
   */
  private processParticipantsWithDataDragon(participants: any[]): any[] {
    if (!this.dataDragonService.isLoaded()) {
      console.warn('⚠️ DataDragonService não carregado. Processando sem conversão...');
      return participants;
    }

    return participants.map(participant => {
      const championId = participant.championId;
      const championName = this.dataDragonService.getChampionNameById(championId);
      
      return {
        ...participant,
        // Usar nome do campeão resolvido pelo DataDragonService
        championName: championName || `Champion${championId}`,
        // Adiciona URL da imagem se necessário
        championImageUrl: championName ? this.dataDragonService.getChampionImageUrl(championName) : null
      };
    });
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
                  // Processar o participante usando DataDragonService
                  const processedParticipant = this.processParticipantsWithDataDragon([participant])[0];
                  
                  gamesCounted++;
                  totalKills += processedParticipant.kills || 0;
                  totalDeaths += processedParticipant.deaths || 0;
                  totalAssists += processedParticipant.assists || 0;
                  totalGold += processedParticipant.goldEarned || 0;
                  totalDamage += processedParticipant.totalDamageDealtToChampions || 0;
                  totalCS += (processedParticipant.totalMinionsKilled || 0) + (processedParticipant.neutralMinionsKilled || 0);
                  totalVision += processedParticipant.visionScore || 0;

                  maxKills = Math.max(maxKills, processedParticipant.kills || 0);
                  maxDamage = Math.max(maxDamage, processedParticipant.totalDamageDealtToChampions || 0);

                  // Usar o nome do campeão já processado pelo DataDragonService
                  const championName = processedParticipant.championName;
                  console.log(`✅ [Leaderboard] ${player.summoner_name} jogou ${championName}`);
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
            updated_at TIMESTAMP NULL,
            pick_ban_data TEXT,
            linked_results TEXT,
            actual_winner INT,
            actual_duration INT,
            riot_id VARCHAR(255),
            mmr_changes TEXT
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

        if (!columnNames.includes('draft_data')) {
          console.log('📋 Adicionando campo draft_data...');
          await this.pool.execute(
            'ALTER TABLE custom_matches ADD COLUMN draft_data TEXT AFTER pick_ban_data'
          );
        }

        if (!columnNames.includes('game_data')) {
          console.log('📋 Adicionando campo game_data...');
          await this.pool.execute(
            'ALTER TABLE custom_matches ADD COLUMN game_data TEXT AFTER draft_data'
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

  // ========== FUNÇÕES DE CÁLCULO DE MMR E LP ==========

  /**
   * Calcula a mudança de LP baseada no sistema descrito em CUSTOM_MMR_LP_SYSTEM.md
   * RECALIBRADO para ser mais balanceado
   */
  private calculateLPChange(playerMMR: number, opponentMMR: number, isWin: boolean): number {
    // LP base: +15 para vitória, -18 para derrota (mais balanceado)
    const baseLpWin = 15;
    const baseLpLoss = -18;

    // Calcular diferença de MMR
    const mmrDifference = opponentMMR - playerMMR;

    // Ajuste por diferença de MMR: ±6 LP para cada 100 pontos de diferença (reduzido de 8)
    const mmrAdjustment = (mmrDifference / 100) * 6;

    // LP inicial baseado no resultado
    let lpChange = isWin ? baseLpWin : baseLpLoss;

    // Aplicar ajuste por diferença de MMR
    lpChange += mmrAdjustment;

    // Ajustes por MMR atual do jogador (reduzidos)
    if (playerMMR < 1200) {
      // Jogadores com MMR baixo (< 1200)
      const mmrBelow1200 = 1200 - playerMMR;
      if (isWin) {
        // Vitórias: +0.5 LP adicional para cada 100 MMR abaixo de 1200 (reduzido)
        lpChange += Math.floor(mmrBelow1200 / 100) * 0.5;
      } else {
        // Derrotas: Perdas reduzidas: +0.5 LP para cada 200 MMR abaixo de 1200 (reduzido)
        lpChange += Math.floor(mmrBelow1200 / 200) * 0.5;
      }
    } else if (playerMMR > 1800) {
      // Jogadores com MMR alto (> 1800)
      const mmrAbove1800 = playerMMR - 1800;
      if (isWin) {
        // Vitórias: -0.5 LP para cada 100 MMR acima de 1800 (reduzido)
        lpChange -= Math.floor(mmrAbove1800 / 100) * 0.5;
      } else {
        // Derrotas: Perdas aumentadas: -0.5 LP adicional para cada 100 MMR acima de 1800 (reduzido)
        lpChange -= Math.floor(mmrAbove1800 / 100) * 0.5;
      }
    }

    // Aplicar limites mais restritivos
    if (isWin) {
      lpChange = Math.max(5, Math.min(25, lpChange)); // Reduzido de 8-35 para 5-25
    } else {
      lpChange = Math.max(-30, Math.min(-5, lpChange)); // Aumentado de -25 a -8 para -30 a -5
    }

    return Math.round(lpChange);
  }

  /**
   * Calcula a mudança de MMR usando o sistema Elo (mais conservador)
   */
  private calculateMMRChange(playerMMR: number, opponentMMR: number, isWin: boolean): number {
    const K_FACTOR = 16; // Fator K mais conservador (metade do padrão)

    // Calcular score esperado usando fórmula Elo
    const expectedScore = 1 / (1 + Math.pow(10, (opponentMMR - playerMMR) / 400));

    // Score atual (1 para vitória, 0 para derrota)
    const actualScore = isWin ? 1 : 0;

    // Calcular mudança de MMR
    const mmrChange = Math.round(K_FACTOR * (actualScore - expectedScore));

    return mmrChange;
  }

  /**
   * Calcula o MMR médio de um time
   */
  private calculateTeamAverageMMR(teamPlayers: string[]): number {
    if (!teamPlayers || teamPlayers.length === 0) return 0; // MMR inicial 0

    let totalMMR = 0;
    let validPlayers = 0;

    for (const playerString of teamPlayers) {
      if (playerString && typeof playerString === 'string') {
        // Buscar MMR do jogador no banco
        // Por enquanto, usar MMR padrão de 0
        // TODO: Implementar busca real do MMR do jogador
        totalMMR += 0;
        validPlayers++;
      }
    }

    return validPlayers > 0 ? Math.round(totalMMR / validPlayers) : 0;
  }

  /**
   * Busca o MMR atual de um jogador
   */
  private async getPlayerCurrentMMR(playerString: string): Promise<number> {
    try {
      const [rows] = await this.pool!.execute(
        'SELECT custom_lp FROM players WHERE summoner_name = ?',
        [playerString]
      );

      if ((rows as any[]).length > 0) {
        return (rows as any[])[0].custom_lp || 0; // MMR inicial 0
      }

      return 0; // MMR padrão para novos jogadores
    } catch (error) {
      console.warn(`⚠️ Erro ao buscar MMR do jogador ${playerString}:`, error);
      return 0;
    }
  }

  /**
   * Calcula o MMR médio de um time usando dados reais do banco
   */
  private async calculateTeamAverageMMRWithRealData(teamPlayers: string[]): Promise<number> {
    if (!teamPlayers || teamPlayers.length === 0) return 0; // MMR inicial 0

    let totalMMR = 0;
    let validPlayers = 0;

    for (const playerString of teamPlayers) {
      if (playerString && typeof playerString === 'string') {
        const playerMMR = await this.getPlayerCurrentMMR(playerString);
        totalMMR += playerMMR;
        validPlayers++;
      }
    }

    return validPlayers > 0 ? Math.round(totalMMR / validPlayers) : 0;
  }

  /**
   * Recalcula LP de todas as partidas customizadas existentes usando o novo sistema MMR
   */
  async recalculateCustomLP(): Promise<{ affectedMatches: number, affectedPlayers: number, details: any[] }> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      console.log('🔄 Iniciando recálculo de LP para partidas customizadas...');

      // Buscar todas as partidas customizadas finalizadas
      const [matches] = await this.pool.execute(
        'SELECT id, team1_players, team2_players, winner_team, lp_changes FROM custom_matches WHERE status = "finished" AND winner_team IS NOT NULL'
      );

      const matchRows = matches as any[];
      let affectedMatches = 0;
      let affectedPlayers = 0;
      const details: any[] = [];

      console.log(`📊 Encontradas ${matchRows.length} partidas para recálculo`);

      for (const match of matchRows) {
        try {
          const team1Players = JSON.parse(match.team1_players);
          const team2Players = JSON.parse(match.team2_players);
          const winnerTeam = match.winner_team;

          // Calcular MMR médio dos times
          const team1AverageMMR = await this.calculateTeamAverageMMRWithRealData(team1Players);
          const team2AverageMMR = await this.calculateTeamAverageMMRWithRealData(team2Players);

          const newLpChanges: any = {};
          let matchAffectedPlayers = 0;

          // Processar time 1
          for (const playerString of team1Players) {
            if (playerString && typeof playerString === 'string') {
              const playerMMR = await this.getPlayerCurrentMMR(playerString);
              const isWin = winnerTeam === 1;
              const opponentMMR = team2AverageMMR;

              const newLpChange = this.calculateLPChange(playerMMR, opponentMMR, isWin);
              newLpChanges[playerString] = newLpChange;
              matchAffectedPlayers++;
            }
          }

          // Processar time 2
          for (const playerString of team2Players) {
            if (playerString && typeof playerString === 'string') {
              const playerMMR = await this.getPlayerCurrentMMR(playerString);
              const isWin = winnerTeam === 2;
              const opponentMMR = team1AverageMMR;

              const newLpChange = this.calculateLPChange(playerMMR, opponentMMR, isWin);
              newLpChanges[playerString] = newLpChange;
              matchAffectedPlayers++;
            }
          }

          // Calcular LP total da partida
          const totalLp = Object.values(newLpChanges).reduce((sum: number, lpChange: any) => {
            return sum + Math.abs(Number(lpChange));
          }, 0);

          // Atualizar partida com novos LP changes
          if (this.pool) {
            await this.pool.execute(
              'UPDATE custom_matches SET lp_changes = ?, custom_lp = ? WHERE id = ?',
              [JSON.stringify(newLpChanges), totalLp, match.id]
            );
          }

          // Recalcular estatísticas dos jogadores
          for (const [playerString, lpChange] of Object.entries(newLpChanges)) {
            const lpChangeValue = Number(lpChange);

            // Buscar o jogador
            if (this.pool) {
              const [playerRows] = await this.pool.execute(
                'SELECT id, custom_lp, custom_games_played, custom_wins, custom_losses FROM players WHERE summoner_name = ?',
                [playerString]
              );

              if ((playerRows as any[]).length > 0) {
                const player = (playerRows as any[])[0];
                const playerId = player.id;

                // Recalcular estatísticas do zero para este jogador
                await this.recalculatePlayerStats(playerId, playerString);
              }
            }
          }

          affectedMatches++;
          affectedPlayers += matchAffectedPlayers;

          details.push({
            matchId: match.id,
            team1MMR: team1AverageMMR,
            team2MMR: team2AverageMMR,
            winnerTeam,
            affectedPlayers: matchAffectedPlayers,
            newLpChanges
          });

          console.log(`✅ Partida ${match.id} recalculada - Time 1 MMR: ${team1AverageMMR}, Time 2 MMR: ${team2AverageMMR}, Vencedor: ${winnerTeam}`);

        } catch (matchError) {
          console.error(`❌ Erro ao recalcular partida ${match.id}:`, matchError);
        }
      }

      console.log(`✅ Recálculo concluído: ${affectedMatches} partidas e ${affectedPlayers} jogadores afetados`);

      return {
        affectedMatches,
        affectedPlayers,
        details
      };

    } catch (error) {
      console.error('❌ Erro no recálculo de LP:', error);
      throw error;
    }
  }

  /**
   * Recalcula estatísticas de um jogador específico baseado em suas partidas customizadas
   */
  private async recalculatePlayerStats(playerId: number, playerString: string): Promise<void> {
    if (!this.pool) return;

    try {
      // Buscar todas as partidas do jogador
      const [matches] = await this.pool.execute(
        'SELECT lp_changes, winner_team, team1_players, team2_players FROM custom_matches WHERE status = "finished" AND (team1_players LIKE ? OR team2_players LIKE ?)',
        [`%${playerString}%`, `%${playerString}%`]
      );

      let totalLp = 0;
      let gamesPlayed = 0;
      let wins = 0;
      let losses = 0;

      for (const match of matches as any[]) {
        if (match.lp_changes) {
          const lpChanges = JSON.parse(match.lp_changes);
          const playerLpChange = lpChanges[playerString];

          if (playerLpChange !== undefined) {
            totalLp += Number(playerLpChange);
            gamesPlayed++;

            if (Number(playerLpChange) > 0) {
              wins++;
            } else {
              losses++;
            }
          }
        }
      }

      // Atualizar estatísticas do jogador
      if (this.pool) {
        await this.pool.execute(
          `UPDATE players SET 
            custom_lp = ?,
            custom_games_played = ?,
            custom_wins = ?,
            custom_losses = ?,
            custom_peak_mmr = GREATEST(custom_peak_mmr, ?),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [totalLp, gamesPlayed, wins, losses, totalLp, playerId]
        );
      }

      console.log(`✅ Estatísticas recalculadas para ${playerString}: LP ${totalLp}, Jogos ${gamesPlayed}, Vitórias ${wins}, Derrotas ${losses}`);

    } catch (error) {
      console.error(`❌ Erro ao recalcular estatísticas do jogador ${playerString}:`, error);
    }
  }

  async updatePlayerSummonerName(playerId: number, newSummonerName: string): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      await this.pool.execute(
        'UPDATE players SET summoner_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newSummonerName, playerId]
      );
      console.log(`✅ [DatabaseManager] Nome do jogador ${playerId} atualizado para: ${newSummonerName}`);
    } catch (error) {
      console.error('❌ [DatabaseManager] Erro ao atualizar nome do jogador:', error);
      throw error;
    }
  }

  // Método para verificar e adicionar colunas faltantes na tabela custom_matches
  private async ensureCustomMatchesColumns(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      console.log('🔍 Verificando colunas da tabela custom_matches...');

      const [columns] = await this.pool.execute(
        "SHOW COLUMNS FROM custom_matches"
      );
      const columnNames = (columns as any[]).map(col => col.Field);

      const missingColumns = [];

      // Verificar colunas que podem estar faltando
      if (!columnNames.includes('pick_ban_data')) {
        missingColumns.push('pick_ban_data TEXT');
      }

      if (!columnNames.includes('linked_results')) {
        missingColumns.push('linked_results TEXT');
      }

      if (!columnNames.includes('actual_winner')) {
        missingColumns.push('actual_winner INT');
      }

      if (!columnNames.includes('actual_duration')) {
        missingColumns.push('actual_duration INT');
      }

      if (!columnNames.includes('riot_id')) {
        missingColumns.push('riot_id VARCHAR(255)');
      }

      if (!columnNames.includes('mmr_changes')) {
        missingColumns.push('mmr_changes TEXT');
      }

      // Adicionar colunas faltantes
      for (const columnDef of missingColumns) {
        const columnName = columnDef.split(' ')[0];
        console.log(`📋 Adicionando coluna ${columnName}...`);
        await this.pool.execute(
          `ALTER TABLE custom_matches ADD COLUMN ${columnDef}`
        );
      }

      if (missingColumns.length > 0) {
        console.log(`✅ ${missingColumns.length} colunas adicionadas à tabela custom_matches`);
      } else {
        console.log('✅ Todas as colunas necessárias já existem na tabela custom_matches');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar/adicionar colunas da tabela custom_matches:', error);
      throw error;
    }
  }

  // NOVO: Método para atualizar posição de um jogador na fila
  async updateQueuePosition(playerId: number, position: number): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      await this.pool.execute(
        'UPDATE queue_players SET queue_position = ? WHERE player_id = ?',
        [position, playerId]
      );
    } catch (error) {
      console.error('❌ [Database] Erro ao atualizar posição na fila:', error);
      throw error;
    }
  }

  // Verificar e corrigir charset da tabela settings se necessário
  private async ensureSettingsTableCharset(): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      const [rows] = await this.pool.execute('SHOW CREATE TABLE settings');
      const results = rows as any[];
      const createTableQuery = results[0]['Create Table'];

      if (!createTableQuery.includes('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')) {
        console.log('📋 Tabela settings não está configurada corretamente, corrigindo...');
        await this.pool.execute('ALTER TABLE settings CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar/corrigir charset da tabela settings:', error);
      throw error;
    }
  }

  // ✅ NOVO: Buscar partidas custom ativas (status = 'pending')
  async getActiveCustomMatches(): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      const [rows] = await this.pool.execute(
        `SELECT * FROM custom_matches 
         WHERE status = 'pending' 
         ORDER BY created_at ASC`
      );
      return rows as any[];
    } catch (error) {
      console.error('❌ [Database] Erro ao buscar partidas ativas:', error);
      return [];
    }
  }

  // ✅ NOVO: Buscar partidas custom por status
  async getCustomMatchesByStatus(status: string): Promise<any[]> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      const [rows] = await this.pool.execute(
        `SELECT * FROM custom_matches 
         WHERE status = ? 
         ORDER BY created_at DESC`,
        [status]
      );
      return rows as any[];
    } catch (error) {
      console.error('❌ [Database] Erro ao buscar partidas por status:', error);
      return [];
    }
  }

  // ✅ NOVO: Atualizar status da partida custom
  async updateCustomMatchStatus(matchId: number, status: string, extraData?: any): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      let query = 'UPDATE custom_matches SET status = ?';
      let params: any[] = [status, matchId];

      if (extraData) {
        if (extraData.completedAt) {
          query += ', completed_at = ?';
          params.splice(-1, 0, extraData.completedAt);
        }
        if (extraData.winnerTeam !== undefined) {
          query += ', winner_team = ?';
          params.splice(-1, 0, extraData.winnerTeam);
        }
        if (extraData.duration !== undefined) {
          query += ', duration = ?';
          params.splice(-1, 0, extraData.duration);
        }
      }

      query += ' WHERE id = ?';

      await this.pool.execute(query, params);
      console.log(`✅ [Database] Status da partida ${matchId} atualizado para: ${status}`);
    } catch (error) {
      console.error('❌ [Database] Erro ao atualizar status da partida:', error);
      throw error;
    }
  }

  // ✅ NOVO: Atualizar dados do jogador
  async updatePlayer(playerId: number, updateData: Partial<Player>): Promise<void> {
    if (!this.pool) throw new Error('Pool de conexão não inicializado');

    try {
      const fields = Object.keys(updateData);
      const values = Object.values(updateData);
      
      if (fields.length === 0) {
        console.warn('⚠️ [Database] Nenhum campo para atualizar');
        return;
      }

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const query = `UPDATE players SET ${setClause} WHERE id = ?`;
      
      await this.pool.execute(query, [...values, playerId]);
      console.log(`✅ [Database] Jogador ${playerId} atualizado com sucesso`);
    } catch (error) {
      console.error('❌ [Database] Erro ao atualizar jogador:', error);
      throw error;
    }
  }
}
