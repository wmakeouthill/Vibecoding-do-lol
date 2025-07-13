import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { DatabaseManager } from '../database/DatabaseManager';

export interface DiscordPlayer {
  userId: string;
  username: string;
  role: string;
  timestamp: number;
  linkedNickname?: {
    gameName: string;
    tagLine: string;
  };
}

export interface DiscordMatch {
  id: string;
  blueTeam: DiscordPlayer[];
  redTeam: DiscordPlayer[];
  blueChannelId: string;
  redChannelId: string;
  categoryId: string;
  startTime: number;
  originalChannels: Map<string, string>; // userId -> originalChannelId
}

export class DiscordService {
  private client: Client;
  private queue: Map<string, DiscordPlayer> = new Map();
  private activeMatches: Map<string, DiscordMatch> = new Map();
  private isConnected = false;
  private botToken?: string;
  private targetChannelName = 'lol-matchmaking'; // Valor padrão, será sobrescrito pelo banco
  private databaseManager: DatabaseManager;

  // WebSocket principal do servidor
  private wss: any = null;

  // Throttling para broadcasts - OTIMIZADO PARA TEMPO REAL
  private lastBroadcastTime = 0;
  private readonly BROADCAST_COOLDOWN = 500; // Reduzido para 500ms entre broadcasts normais
  private readonly IMMEDIATE_BROADCAST_COOLDOWN = 50; // Reduzido para 50ms para broadcasts imediatos (entrada/saída)

  // Cache de usuários para evitar broadcasts desnecessários
  private lastBroadcastedUsers: any[] = [];
  private lastBroadcastHash = '';

  // NOVO: Sistema de broadcast automático para eventos críticos
  private readonly CRITICAL_EVENT_COOLDOWN = 0; // Sem throttling para eventos críticos
  private lastCriticalEventTime = 0;

  // NOVO: Cache dos últimos dados do LCU conhecidos
  private lastKnownLCUData?: { gameName: string, tagLine: string };

  constructor(databaseManager: DatabaseManager) {
    console.log('🔧 [DiscordService] Construtor chamado');
    console.log('🔧 [DiscordService] DatabaseManager recebido:', !!databaseManager);

    this.databaseManager = databaseManager;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
      ]
    });

    console.log('🔧 [DiscordService] Client criado:', !!this.client);
    this.setupDiscordEvents();
    console.log('🔧 [DiscordService] Construtor finalizado');
  }

  private setupDiscordEvents(): void {
    this.client.on('ready', () => {
      console.log(`🎮 [DiscordService] Discord Bot ${this.client.user?.tag} conectado!`);
      console.log(`🎮 [DiscordService] Bot ID: ${this.client.user?.id}`);
      console.log(`🎮 [DiscordService] Servidores conectados: ${this.client.guilds.cache.size}`);
      this.isConnected = true;
      this.registerSlashCommands();

      // Teste inicial de detecção
      this.performInitialChannelCheck();

      // NOVO: Broadcast inicial para todos os clientes conectados
      setTimeout(async () => {
        console.log('🚀 [DiscordService] Enviando broadcast inicial...');
        await this.broadcastUsersInChannelCritical();
      }, 3000); // Aguardar 3 segundos para garantir que tudo esteja carregado
    });

    // Detectar quando alguém entra/sai do canal
    this.client.on('voiceStateUpdate', (oldState, newState) => {
      this.handleVoiceStateChange(oldState, newState);
    });

    // Comandos slash
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        switch (interaction.commandName) {
          case 'vincular':
            await this.handleVincularCommand(interaction);
            break;
          case 'desvincular':
            await this.handleDesvincularCommand(interaction);
            break;
          case 'queue':
            await this.handleQueueCommand(interaction);
            break;
          case 'clear_queue':
            await this.handleClearQueueCommand(interaction);
            break;
          case 'lobby':
            await this.handleLobbyCommand(interaction);
            break;
          default:
            await interaction.reply({ content: '❌ Comando não reconhecido', ephemeral: true });
        }
      } catch (error) {
        console.error('❌ Erro ao processar comando:', error);
        await interaction.reply({
          content: '❌ Erro interno ao processar comando',
          ephemeral: true
        });
      }
    });

    this.client.on('error', (error) => {
      console.error('❌ Erro no Discord Bot:', error);
    });

    this.client.on('disconnect', () => {
      console.log('🔌 Discord Bot desconectado');
      this.isConnected = false;
    });
  }

  // Carregar configuração do canal do banco de dados
  private async loadChannelConfiguration(): Promise<void> {
    try {
      const channelName = await this.databaseManager.getSetting('discord_channel');
      if (channelName && channelName.trim() !== '') {
        this.targetChannelName = channelName.trim();
        console.log(`🎯 [DiscordService] Canal configurado: ${this.targetChannelName}`);
      } else {
        console.log(`🎯 [DiscordService] Usando canal padrão: ${this.targetChannelName}`);
      }
    } catch (error) {
      console.error('❌ [DiscordService] Erro ao carregar configuração do canal:', error);
      console.log(`🎯 [DiscordService] Usando canal padrão: ${this.targetChannelName}`);
    }
  }

  // Método público para atualizar configuração do canal
  async updateChannelConfiguration(channelName: string): Promise<void> {
    try {
      await this.databaseManager.setSetting('discord_channel', channelName.trim());
      this.targetChannelName = channelName.trim();
      console.log(`🎯 [DiscordService] Canal atualizado para: ${this.targetChannelName}`);

      // ✅ NOVO: Invalidar cache e fazer broadcast para todos os clientes
      await this.invalidateChannelCache();
      await this.broadcastChannelConfigurationUpdate();
    } catch (error) {
      console.error('❌ [DiscordService] Erro ao atualizar configuração do canal:', error);
      throw error;
    }
  }

  // ✅ NOVO: Invalidar cache de configuração do canal
  private async invalidateChannelCache(): Promise<void> {
    try {
      // Recarregar configuração do banco de dados
      await this.loadChannelConfiguration();

      // Forçar uma nova verificação do canal após mudança
      setTimeout(async () => {
        await this.performInitialChannelCheck();
        await this.broadcastUsersInChannelCritical();
      }, 1000);

      console.log('🔄 [DiscordService] Cache de configuração invalidado e recarregado');
    } catch (error) {
      console.error('❌ [DiscordService] Erro ao invalidar cache:', error);
    }
  }

  // ✅ NOVO: Broadcast de atualização de configuração do canal
  private async broadcastChannelConfigurationUpdate(): Promise<void> {
    try {
      const configUpdate = {
        type: 'discord_channel_config_update',
        channelName: this.targetChannelName,
        timestamp: Date.now()
      };

      this.broadcastToClients(configUpdate);
      console.log(`📡 [DiscordService] Broadcast de atualização de configuração enviado`);
    } catch (error) {
      console.error('❌ [DiscordService] Erro ao fazer broadcast de configuração:', error);
    }
  }

  // Método para verificação inicial do canal
  private async performInitialChannelCheck(): Promise<void> {
    console.log('🔍 [INIT] Verificação inicial do canal de matchmaking...');

    const guild = this.client.guilds.cache.first();
    if (!guild) {
      console.log('❌ [INIT] Guild não encontrada');
      return;
    }

    console.log(`🏠 [INIT] Servidor: ${guild.name}`);
    console.log(`👥 [INIT] Total de membros no servidor: ${guild.memberCount}`);

    const matchmakingChannel = guild.channels.cache.find(
      channel => channel.name === this.targetChannelName && channel.type === ChannelType.GuildVoice
    );

    if (!matchmakingChannel) {
      console.log(`❌ [INIT] Canal ${this.targetChannelName} não encontrado`);
      console.log(`📋 [INIT] Canais disponíveis:`, guild.channels.cache.map(c => `${c.name} (${c.type})`));
      return;
    }

    console.log(`✅ [INIT] Canal ${this.targetChannelName} encontrado`);

    // Verificar permissões do bot no canal
    const botMember = guild.members.cache.get(this.client.user?.id || '');
    if (botMember) {
      const permissions = botMember.permissionsIn(matchmakingChannel);
      console.log(`🔐 [INIT] Permissões do bot no canal:`);
      console.log(`  - View Channel: ${permissions.has(PermissionFlagsBits.ViewChannel)}`);
      console.log(`  - Connect: ${permissions.has(PermissionFlagsBits.Connect)}`);
      console.log(`  - View Members: ${permissions.has(PermissionFlagsBits.ViewAuditLog)}`);
    }

    // Fazer primeira verificação de usuários
    setTimeout(async () => {
      const usersInChannel = await this.getUsersInMatchmakingChannel();
      console.log(`👥 [INIT] Usuários encontrados no canal: ${usersInChannel.length}`);

      // NOVO: Broadcast inicial para todos os clientes
      if (usersInChannel.length > 0) {
        console.log('🚀 [INIT] Enviando broadcast inicial com usuários encontrados...');
        await this.broadcastUsersInChannelCritical();
      }
    }, 2000);
  }

  async initialize(token?: string): Promise<boolean> {
    console.log('🚀 [DiscordService] Iniciando inicialização do Discord Bot...');

    if (!token) {
      console.log('⚠️ [DiscordService] Token do Discord não fornecido, Discord Bot não será iniciado');
      return false;
    }

    // Validar formato do token
    if (!token.match(/^[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}$/)) {
      console.error('❌ [DiscordService] Formato de token inválido. O token deve ter o formato correto do Discord Bot.');
      console.error('💡 Dica: Verifique se você copiou o token correto do Discord Developer Portal');
      return false;
    }

    console.log('🔑 [DiscordService] Token fornecido, validando formato...');

    try {
      // Se já está conectado, desconectar antes de trocar o token
      if (this.isConnected || this.client?.user) {
        console.log('🔄 [DiscordService] Reinicializando Discord Bot com novo token...');
        await this.client.destroy();
        // Criar nova instância do client
        this.client = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers
          ]
        });
        this.setupDiscordEvents();
        this.isConnected = false;
      }

      this.botToken = token;
      console.log('🔐 [DiscordService] Tentando login com token...');

      // Tentar conectar com timeout
      const loginPromise = this.client.login(token);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout ao conectar ao Discord')), 10000);
      });

      await Promise.race([loginPromise, timeoutPromise]);

      console.log('✅ [DiscordService] Discord Bot inicializado com sucesso');
      console.log('🎮 [DiscordService] Bot conectado como:', this.client.user?.tag);
      console.log('🏠 [DiscordService] Servidores conectados:', this.client.guilds.cache.size);

      // Carregar configuração do canal após conectar com sucesso
      await this.loadChannelConfiguration();

      return true;
    } catch (error: any) {
      console.error('❌ [DiscordService] Erro ao inicializar Discord Bot:', error.message);

      // Dar dicas específicas baseadas no erro
      if (error.code === 'TokenInvalid') {
        console.error('🔧 [DiscordService] SOLUÇÃO:');
        console.error('   1. Vá para https://discord.com/developers/applications');
        console.error('   2. Selecione sua aplicação');
        console.error('   3. Vá em "Bot" → "Reset Token"');
        console.error('   4. Copie o novo token');
        console.error('   5. Cole no app e salve');
      } else if (error.code === 'DisallowedIntents') {
        console.error('🔧 [DiscordService] SOLUÇÃO:');
        console.error('   1. Vá para https://discord.com/developers/applications');
        console.error('   2. Selecione sua aplicação → "Bot"');
        console.error('   3. Ative "Server Members Intent"');
        console.error('   4. Salve as alterações');
      } else if (error.message.includes('Timeout')) {
        console.error('🔧 [DiscordService] SOLUÇÃO:');
        console.error('   1. Verifique sua conexão com a internet');
        console.error('   2. Tente novamente em alguns segundos');
      }

      return false;
    }
  }

  // Detectar quando alguém entra/sai do canal
  private async handleVoiceStateChange(oldState: any, newState: any): Promise<void> {
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const user = newState.member?.user || oldState.member?.user;

    if (!user) return;

    const isTargetChannel = (channel: any) => channel && channel.name === this.targetChannelName;
    const wasInTargetChannel = isTargetChannel(oldChannel);
    const isInTargetChannel = isTargetChannel(newChannel);

    // Detectar entrada ou saída do canal de matchmaking
    if (wasInTargetChannel !== isInTargetChannel) {
      const action = isInTargetChannel ? 'entrou' : 'saiu';
      console.log(`👤 [DiscordService] ${user.username} ${action} do canal ${this.targetChannelName}`);

      // BROADCAST IMEDIATO para entrada/saída (SEM throttling para eventos críticos)
      await this.broadcastUsersInChannelCritical();

      // Verificar se o usuário tem nick vinculado e está na fila
      if (isInTargetChannel) {
        await this.checkUserForQueue(user);
      }
    }
  }

  private async checkUserForQueue(user: any): Promise<void> {
    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const member = guild.members.cache.get(user.id);
    if (!member) return;

    const inMatchmakingChannel = member.voice.channel &&
      member.voice.channel.name === this.targetChannelName;

    if (inMatchmakingChannel) {
      console.log(`✅ ${user.username} qualificado para fila (no canal de matchmaking)`);
      this.broadcastToClients({
        type: 'user_qualified',
        userId: user.id,
        username: user.username
      });
    }
  }



  private async addToQueue(userId: string, username: string, role: string, lcuData?: { gameName: string, tagLine: string }): Promise<void> {
    // Usar dados do LCU se disponíveis, senão usar username do Discord
    let displayName = username;
    let linkedNickname = undefined;

    if (lcuData && lcuData.gameName && lcuData.tagLine) {
      displayName = `${lcuData.gameName}#${lcuData.tagLine}`;
      linkedNickname = {
        gameName: lcuData.gameName,
        tagLine: lcuData.tagLine
      };

      // Salvar vinculação automática no banco (opcional, para histórico)
      try {
        await this.databaseManager.createDiscordLink(userId, username, lcuData.gameName, lcuData.tagLine);
        console.log(`🔗 Vinculação automática criada: ${username} -> ${lcuData.gameName}#${lcuData.tagLine}`);
      } catch (error) {
        console.error('❌ Erro ao salvar vinculação automática:', error);
      }
    }

    this.queue.set(userId, {
      userId,
      username,
      role,
      timestamp: Date.now(),
      linkedNickname
    });

    console.log(`🎮 ${displayName} entrou na fila como ${role} (${this.queue.size}/10)`);

    this.broadcastQueueUpdate();

    // Verificar se pode formar match
    if (this.queue.size >= 10) {
      this.tryCreateMatch();
    }
  }

  private removeFromQueue(userId: string): void {
    const player = this.queue.get(userId);
    if (player) {
      this.queue.delete(userId);
      console.log(`👋 ${player.username} saiu da fila (${this.queue.size}/10)`);
      this.broadcastQueueUpdate();
    }
  }

  private tryCreateMatch(): void {
    if (this.queue.size < 10) return;

    const players = Array.from(this.queue.values());

    // Validar composição de roles
    const roleCount: { [key: string]: number } = {};
    players.forEach(player => {
      roleCount[player.role] = (roleCount[player.role] || 0) + 1;
    });

    // Verificar se tem pelo menos 2 de cada role (para dividir em times)
    const requiredRoles = ['top', 'jungle', 'mid', 'adc', 'support'];
    const canCreateMatch = requiredRoles.every(role =>
      (roleCount[role] || 0) >= 2
    );

    if (canCreateMatch) {
      this.createMatch(players.slice(0, 10));
    }
  }

  private async createMatch(players: DiscordPlayer[]): Promise<void> {
    const matchId = Date.now().toString();

    // Verificar se o match já existe
    if (this.activeMatches.has(matchId)) {
      console.log(`⚠️ [DiscordService] Match ${matchId} já existe, ignorando criação duplicada.`);
      return;
    }

    const guild = this.client.guilds.cache.first();

    if (!guild) {
      console.error('❌ Guild não encontrada');
      return;
    }

    console.log(`🎮 [DiscordService] Criando match ${matchId} com ${players.length} jogadores:`);
    players.forEach((player, index) => {
      console.log(`   ${index + 1}. ${player.username} (${player.role}) - Discord ID: ${player.userId}`);
      if (player.linkedNickname) {
        console.log(`      ↳ Vinculado: ${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}`);
      }
    });

    try {
      // Criar canais temporários
      const category = await guild.channels.create({
        name: `Match ${matchId}`,
        type: ChannelType.GuildCategory
      });

      const blueChannel = await guild.channels.create({
        name: `🔵-blue-team-${matchId}`,
        type: ChannelType.GuildVoice,
        parent: category.id
      });

      const redChannel = await guild.channels.create({
        name: `🔴-red-team-${matchId}`,
        type: ChannelType.GuildVoice,
        parent: category.id
      });

      console.log(`✅ [DiscordService] Canais criados para match ${matchId}:`);
      console.log(`   📁 Categoria: ${category.name} (${category.id})`);
      console.log(`   🔵 Blue Team: ${blueChannel.name} (${blueChannel.id})`);
      console.log(`   🔴 Red Team: ${redChannel.name} (${redChannel.id})`);

      // Dividir times (5v5)
      const blueTeam = players.slice(0, 5);
      const redTeam = players.slice(5, 10);

      console.log(`🔵 Blue Team (${blueTeam.length} jogadores):`);
      blueTeam.forEach((p, i) => console.log(`   ${i + 1}. ${p.username} (${p.role}) ${p.linkedNickname ? `[${p.linkedNickname.gameName}#${p.linkedNickname.tagLine}]` : '[Sem vinculação]'}`));

      console.log(`🔴 Red Team (${redTeam.length} jogadores):`);
      redTeam.forEach((p, i) => console.log(`   ${i + 1}. ${p.username} (${p.role}) ${p.linkedNickname ? `[${p.linkedNickname.gameName}#${p.linkedNickname.tagLine}]` : '[Sem vinculação]'}`));

      // Salvar match ativo ANTES de mover jogadores para poder armazenar canais originais
      const match: DiscordMatch = {
        id: matchId,
        blueTeam,
        redTeam,
        blueChannelId: blueChannel.id,
        redChannelId: redChannel.id,
        categoryId: category.id,
        startTime: Date.now(),
        originalChannels: new Map<string, string>()
      };

      this.activeMatches.set(matchId, match);

      // Mover players para canais e armazenar canais de origem
      await this.movePlayersToChannels(blueTeam, blueChannel, redTeam, redChannel, matchId);

      // ✅ CORREÇÃO: Limpar fila dos players que entraram no match
      players.forEach(player => {
        this.queue.delete(player.userId);
      });

      // ✅ NOVO: Sincronizar com a tabela MySQL se houver dados vinculados
      const playersToRemove: string[] = [];
      for (const player of players) {
        if (player.linkedNickname) {
          const fullName = `${player.linkedNickname.gameName}${player.linkedNickname.tagLine}`;
          playersToRemove.push(fullName);
        }
      }

      // Notificar MatchmakingService para remover da tabela MySQL
      if (playersToRemove.length > 0) {
        console.log(`🔄 [Discord] Sincronizando ${playersToRemove.length} jogadores com MySQL`);
        // Aqui você pode chamar um método do MatchmakingService se necessário
        // this.matchmakingService?.removePlayersFromQueueForMatch([], playersToRemove);
      }

      console.log(`🎮 Match ${matchId} criado! Blue vs Red`);
      this.broadcastQueueUpdate();

      // Notificar clientes sobre o match
      this.broadcastToClients({
        type: 'match_created',
        matchId,
        blueTeam,
        redTeam
      });

      // Auto-deletar canais após 2 horas
      setTimeout(() => {
        this.cleanupMatch(matchId);
      }, 2 * 60 * 60 * 1000);

    } catch (error) {
      console.error('❌ Erro ao criar match:', error);
    }
  }

  private async movePlayersToChannels(blueTeam: DiscordPlayer[], blueChannel: any, redTeam: DiscordPlayer[], redChannel: any, matchId: string): Promise<void> {
    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const match = this.activeMatches.get(matchId);
    if (!match) return;

    console.log(`🔄 [DiscordService] Movendo jogadores para canais de match ${matchId}`);

    // Armazenar canais de origem para cada jogador do Blue Team
    for (const player of blueTeam) {
      console.log(`🔵 [DiscordService] Processando jogador Blue Team:`, player);

      let discordId = player.userId;

      // Se o jogador tem vinculação, usar ela para encontrar o Discord ID correto
      if (player.linkedNickname) {
        const foundDiscordId = await this.findDiscordIdByLinkedNickname(
          player.linkedNickname.gameName,
          player.linkedNickname.tagLine
        );
        if (foundDiscordId) {
          discordId = foundDiscordId;
          console.log(`🔗 [DiscordService] Usando Discord ID da vinculação: ${discordId} para ${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}`);
        }
      }

      const member = guild.members.cache.get(discordId);
      if (member && member.voice.channel) {
        try {
          // Salvar canal de origem ANTES de mover
          const originalChannelName = member.voice.channel.name;
          match.originalChannels.set(discordId, member.voice.channel.id);
          await member.voice.setChannel(blueChannel);
          console.log(`🔵 ${member.user.username} (${player.linkedNickname ? `${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}` : player.username}) movido para Blue Team (origem: ${originalChannelName})`);
        } catch (error) {
          console.error(`❌ Erro ao mover ${member.user.username}:`, error);
        }
      } else {
        console.log(`⚠️ [DiscordService] Jogador não encontrado no Discord ou não está em canal de voz: ${player.username} (ID: ${discordId})`);
      }
    }

    // Armazenar canais de origem para cada jogador do Red Team
    for (const player of redTeam) {
      console.log(`🔴 [DiscordService] Processando jogador Red Team:`, player);

      let discordId = player.userId;

      // Se o jogador tem vinculação, usar ela para encontrar o Discord ID correto
      if (player.linkedNickname) {
        const foundDiscordId = await this.findDiscordIdByLinkedNickname(
          player.linkedNickname.gameName,
          player.linkedNickname.tagLine
        );
        if (foundDiscordId) {
          discordId = foundDiscordId;
          console.log(`🔗 [DiscordService] Usando Discord ID da vinculação: ${discordId} para ${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}`);
        }
      }

      const member = guild.members.cache.get(discordId);
      if (member && member.voice.channel) {
        try {
          // Salvar canal de origem ANTES de mover
          const originalChannelName = member.voice.channel.name;
          match.originalChannels.set(discordId, member.voice.channel.id);
          await member.voice.setChannel(redChannel);
          console.log(`🔴 ${member.user.username} (${player.linkedNickname ? `${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}` : player.username}) movido para Red Team (origem: ${originalChannelName})`);
        } catch (error) {
          console.error(`❌ Erro ao mover ${member.user.username}:`, error);
        }
      } else {
        console.log(`⚠️ [DiscordService] Jogador não encontrado no Discord ou não está em canal de voz: ${player.username} (ID: ${discordId})`);
      }
    }
  }

  private async cleanupMatch(matchId: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`❌ [cleanupMatch] Match ${matchId} não encontrado.`);
      return;
    }

    const guild = this.client.guilds.cache.first();
    if (!guild) {
      console.log('❌ [cleanupMatch] Guild não encontrada.');
      return;
    }

    console.log(`🧹 [cleanupMatch] Iniciando limpeza do match ${matchId}...`);

    try {
      // 1. Mover jogadores de volta ao canal de origem ou ao canal principal
      const originChannel = guild.channels.cache.find(
        c => c.isVoiceBased() && c.name === this.targetChannelName
      );

      if (!originChannel) {
        console.error(`❌ [cleanupMatch] Canal de origem "${this.targetChannelName}" não encontrado.`);
        throw new Error('Canal de origem não encontrado');
      }

      const channelsToClear = [match.blueChannelId, match.redChannelId].filter(Boolean);
      let allMoved = true;

      for (const channelId of channelsToClear) {
        const channel = guild.channels.cache.get(channelId);
        if (channel?.isVoiceBased()) {
          console.log(`🔍 [cleanupMatch] Verificando canal ${channel.name} (${channelId})...`);

          // Garantir que todos os membros sejam movidos, mesmo que ocorram erros
          for (const [_, member] of channel.members) {
            try {
              console.log(`👤 [cleanupMatch] Movendo ${member.displayName} para ${originChannel.name}...`);
              await member.voice.setChannel(originChannel.id);
              console.log(`✅ [cleanupMatch] ${member.displayName} movido com sucesso.`);
            } catch (error) {
              console.error(`❌ [cleanupMatch] Falha ao mover ${member.displayName}:`, error);
              allMoved = false;
            }
          }
        }
      }

      if (!allMoved) {
        console.warn('⚠️ [cleanupMatch] Nem todos os jogadores foram movidos. Verifique os logs.');
      }

      // 2. Deletar canais temporários
      const channelsToDelete = [match.blueChannelId, match.redChannelId, match.categoryId].filter(Boolean);
      console.log(`🗑️ [cleanupMatch] Preparando para deletar canais: ${channelsToDelete.join(', ')}`);

      for (const channelId of channelsToDelete) {
        try {
          const channel = guild.channels.cache.get(channelId);
          if (channel) {
            console.log(`🔍 [cleanupMatch] Deletando canal ${channel.name} (${channelId})...`);
            await channel.delete();
            console.log(`✅ [cleanupMatch] Canal ${channel.name} deletado com sucesso.`);
          }
        } catch (error) {
          console.error(`❌ [cleanupMatch] Falha ao deletar canal ${channelId}:`, error);
          throw error;
        }
      }

      // 3. Remover o match do cache
      this.activeMatches.delete(matchId);
      console.log(`✅ [cleanupMatch] Partida ${matchId} finalizada com sucesso.`);

    } catch (error) {
      console.error(`❌ [cleanupMatch] Falha crítica ao limpar partida ${matchId}:`, error);
      throw error;
    }
  }

  // Método para mover jogadores de volta ao canal de origem
  private async movePlayersBackToOrigin(matchId: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    console.log(`🏠 [DiscordService] Movendo jogadores de volta aos canais de origem para match ${matchId}`);

    // Combinar todos os jogadores do match
    const allPlayers = [...match.blueTeam, ...match.redTeam];

    for (const player of allPlayers) {
      console.log(`🏠 [DiscordService] Processando retorno do jogador:`, player);

      let discordId = player.userId;

      // Se o jogador tem vinculação, usar ela para encontrar o Discord ID correto
      if (player.linkedNickname) {
        const foundDiscordId = await this.findDiscordIdByLinkedNickname(
          player.linkedNickname.gameName,
          player.linkedNickname.tagLine
        );
        if (foundDiscordId) {
          discordId = foundDiscordId;
          console.log(`🔗 [DiscordService] Usando Discord ID da vinculação: ${discordId} para ${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}`);
        }
      }

      const member = guild.members.cache.get(discordId);
      const originalChannelId = match.originalChannels.get(discordId);

      if (member && member.voice.channel && originalChannelId) {
        try {
          const originalChannel = guild.channels.cache.get(originalChannelId);
          if (originalChannel && originalChannel.type === ChannelType.GuildVoice) {
            await member.voice.setChannel(originalChannel);
            console.log(`🏠 ${member.user.username} (${player.linkedNickname ? `${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}` : player.username}) movido de volta para ${originalChannel.name}`);
          } else {
            // Se o canal original não existe mais, mover para o canal de matchmaking
            const matchmakingChannel = guild.channels.cache.find(
              channel => channel.name === this.targetChannelName && channel.type === ChannelType.GuildVoice
            );
            if (matchmakingChannel && matchmakingChannel.type === ChannelType.GuildVoice) {
              await member.voice.setChannel(matchmakingChannel);
              console.log(`🏠 ${member.user.username} (${player.linkedNickname ? `${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}` : player.username}) movido para ${this.targetChannelName} (canal original não encontrado)`);
            }
          }
        } catch (error) {
          console.error(`❌ Erro ao mover ${member.user.username} de volta:`, error);
        }
      } else {
        console.log(`⚠️ [DiscordService] Jogador não encontrado, não está em canal de voz, ou canal original não foi salvo: ${player.username} (ID: ${discordId})`);
      }
    }
  }

  private broadcastQueueUpdate(): void {
    const queueData = {
      type: 'queue_update',
      queue: Array.from(this.queue.values()),
      size: this.queue.size
    };

    this.broadcastToClients(queueData);
  }

  private broadcastToClients(data: any): void {
    if (!this.wss) {
      console.warn('⚠️ WebSocket não configurado no DiscordService');
      return;
    }

    // Enviar para todos os clientes conectados ao WebSocket principal
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify(data));
      }
    });
  }

  private async registerSlashCommands(): Promise<void> {
    const commands = [
      {
        name: 'vincular',
        description: 'Vincular seu Discord ao seu nickname do LoL',
        options: [
          {
            name: 'nickname',
            description: 'Seu nickname no LoL (sem a tag)',
            type: 3, // STRING
            required: true
          },
          {
            name: 'tag',
            description: 'Sua tag no LoL (ex: #BR1)',
            type: 3, // STRING
            required: true
          }
        ]
      },
      {
        name: 'desvincular',
        description: 'Remover vinculação do seu Discord com LoL'
      },
      {
        name: 'queue',
        description: 'Ver status da fila atual'
      },
      {
        name: 'clear_queue',
        description: 'Limpar fila (apenas moderadores)'
      },
      {
        name: 'lobby',
        description: 'Ver usuários no lobby #lol-matchmaking'
      }
    ];

    try {
      const guild = this.client.guilds.cache.first();
      if (guild) {
        await guild.commands.set(commands);
        console.log('✅ Comandos slash registrados');
      }
    } catch (error) {
      console.error('❌ Erro ao registrar comandos:', error);
    }
  }

  private async handleVincularCommand(interaction: any): Promise<void> {
    const gameName = interaction.options.getString('nickname');
    const tagLine = interaction.options.getString('tag');

    if (!gameName || !tagLine) {
      await interaction.reply({
        content: '❌ Uso: `/vincular <nickname> <#tag>`\nExemplo: `/vincular PlayerName #BR1`',
        ephemeral: true
      });
      return;
    }

    try {
      // Validar formato do tag (deve começar com #)
      if (!tagLine.startsWith('#')) {
        await interaction.reply({
          content: '❌ Tag deve começar com #\nExemplo: `/vincular PlayerName #BR1`',
          ephemeral: true
        });
        return;
      }

      const cleanTagLine = tagLine.substring(1); // Remove o #
      const discordId = interaction.user.id;
      const discordUsername = interaction.user.username;

      // Verificar se já existe vinculação para este Discord ID
      const existingLink = await this.databaseManager.getDiscordLink(discordId);
      if (existingLink) {
        await interaction.reply({
          content: `❌ Você já tem uma vinculação: **${existingLink.game_name}#${existingLink.tag_line}**\nUse \`/desvincular\` primeiro para criar uma nova.`,
          ephemeral: true
        });
        return;
      }

      // Verificar se este nickname já está vinculado a outro Discord
      const existingNicknameLink = await this.databaseManager.getDiscordLinkByGameName(gameName, cleanTagLine);
      if (existingNicknameLink) {
        await interaction.reply({
          content: `❌ O nickname **${gameName}#${cleanTagLine}** já está vinculado a outro usuário Discord.`,
          ephemeral: true
        });
        return;
      }

      // Criar vinculação
      await this.databaseManager.createDiscordLink(discordId, discordUsername, gameName, cleanTagLine);

      await interaction.reply({
        content: `✅ **Vinculação criada com sucesso!**\n\n🎮 **Discord:** ${discordUsername}\n🎯 **LoL:** ${gameName}#${cleanTagLine}\n\nAgora você será identificado automaticamente na fila!`,
        ephemeral: false
      });

      console.log(`🔗 Vinculação criada via Discord: ${discordUsername} -> ${gameName}#${cleanTagLine}`);

      // Broadcast das vinculações para todos os clientes
      await this.broadcastDiscordLinks();

    } catch (error) {
      console.error('❌ Erro ao criar vinculação:', error);
      await interaction.reply({
        content: '❌ Erro interno ao criar vinculação. Tente novamente.',
        ephemeral: true
      });
    }
  }

  private async handleDesvincularCommand(interaction: any): Promise<void> {
    const discordId = interaction.user.id;
    const discordUsername = interaction.user.username;

    try {
      // Verificar se existe vinculação
      const existingLink = await this.databaseManager.getDiscordLink(discordId);
      if (!existingLink) {
        await interaction.reply({
          content: '❌ Você não tem nenhuma vinculação para remover.',
          ephemeral: true
        });
        return;
      }

      // Remover vinculação
      await this.databaseManager.deleteDiscordLink(discordId);

      await interaction.reply({
        content: `✅ **Vinculação removida com sucesso!**\n\n🎮 **Discord:** ${discordUsername}\n🎯 **LoL:** ${existingLink.game_name}#${existingLink.tag_line}\n\nUse \`/vincular\` para criar uma nova vinculação.`,
        ephemeral: false
      });

      console.log(`🔗 Vinculação removida via Discord: ${discordUsername} -> ${existingLink.game_name}#${existingLink.tag_line}`);

      // Broadcast das vinculações para todos os clientes
      await this.broadcastDiscordLinks();

    } catch (error) {
      console.error('❌ Erro ao remover vinculação:', error);
      await interaction.reply({
        content: '❌ Erro interno ao remover vinculação. Tente novamente.',
        ephemeral: true
      });
    }
  }

  private async handleQueueCommand(interaction: any): Promise<void> {
    const queueSize = this.queue.size;
    const queueList = Array.from(this.queue.values()).map(player => {
      const nickname = player.linkedNickname
        ? `${player.linkedNickname.gameName}#${player.linkedNickname.tagLine}`
        : player.username;
      return `• ${nickname} (${player.role})`;
    }).join('\n');

    const embed = {
      color: 0x00ff00,
      title: '🎯 Fila de Matchmaking',
      description: queueList || 'Nenhum jogador na fila',
      fields: [
        {
          name: '👥 Jogadores na Fila',
          value: `${queueSize}/10`,
          inline: true
        },
        {
          name: '⏱️ Tempo Estimado',
          value: queueSize >= 8 ? '~2-5 minutos' : '~5-15 minutos',
          inline: true
        }
      ],
      footer: {
        text: 'Entre no canal #lol-matchmaking e abra o app para participar!'
      }
    };

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }

  private async handleClearQueueCommand(interaction: any): Promise<void> {
    // Verificar se é moderador
    const member = interaction.member;
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: '❌ Você não tem permissão para limpar a fila.',
        ephemeral: true
      });
      return;
    }

    this.queue.clear();
    this.broadcastQueueUpdate();

    await interaction.reply({
      content: '✅ Fila limpa com sucesso!',
      ephemeral: false
    });

    console.log(`🧹 Fila limpa por ${interaction.user.username}`);
  }

  private async handleLobbyCommand(interaction: any): Promise<void> {
    const guild = this.client.guilds.cache.first();
    if (!guild) {
      await interaction.reply({
        content: '❌ Servidor não encontrado.',
        ephemeral: true
      });
      return;
    }

    // Encontrar canal de matchmaking
    const matchmakingChannel = guild.channels.cache.find(
      channel => channel.name === this.targetChannelName && channel.type === ChannelType.GuildVoice
    );

    if (!matchmakingChannel) {
      await interaction.reply({
        content: '❌ Canal #lol-matchmaking não encontrado.',
        ephemeral: true
      });
      return;
    }

    // Obter usuários no canal de forma segura
    const membersInChannel: any[] = [];
    try {
      // @ts-ignore - Ignorar erro de tipo para acessar members
      const members = matchmakingChannel.members;
      if (members) {
        // @ts-ignore - Iterar sobre os membros
        members.forEach((member: any) => {
          const linkedNickname = this.getLinkedNicknameForUser(member.user.id);
          membersInChannel.push({
            username: member.user.username,
            linkedNickname,
            hasAppOpen: this.queue.has(member.user.id)
          });
        });
      }
    } catch (error) {
      console.error('❌ Erro ao obter membros do canal:', error);
    }

    const lobbyList = membersInChannel.map((user: any) => {
      const nickname = user.linkedNickname
        ? `${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`
        : user.username;
      const status = user.hasAppOpen ? '📱 App Aberto' : '💻 Apenas Discord';
      return `• ${nickname} - ${status}`;
    }).join('\n');

    const embed = {
      color: 0x0099ff,
      title: '👥 Lobby #lol-matchmaking',
      description: lobbyList || 'Nenhum usuário no canal',
      fields: [
        {
          name: '👤 Usuários no Canal',
          value: `${membersInChannel.length}`,
          inline: true
        },
        {
          name: '📱 Com App Aberto',
          value: `${membersInChannel.filter((u: any) => u.hasAppOpen).length}`,
          inline: true
        }
      ],
      footer: {
        text: 'Abra o app LoL Matchmaking para entrar na fila!'
      }
    };

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }

  private async getLinkedNicknameForUser(discordId: string): Promise<{ gameName: string, tagLine: string } | null> {
    try {
      console.log(`🔍 [DiscordService] Buscando vinculação para Discord ID: ${discordId}`);
      const link = await this.databaseManager.getDiscordLink(discordId);

      if (link) {
        const result = {
          gameName: link.game_name,
          tagLine: link.tag_line
        };
        console.log(`✅ [DiscordService] Vinculação encontrada para ${discordId}:`, result);
        return result;
      } else {
        console.log(`❌ [DiscordService] Nenhuma vinculação encontrada para Discord ID: ${discordId}`);
      }
    } catch (error) {
      console.error(`❌ [DiscordService] Erro ao buscar vinculação para ${discordId}:`, error);
    }
    return null;
  }

  // Métodos públicos para integração
  isDiscordConnected(): boolean {
    const clientReady = this.client?.user !== undefined;
    const isConnected = this.isConnected;
    const hasToken = !!this.botToken;
    const finalStatus = isConnected && clientReady;

    console.log(`🔍 [DiscordService] Status de conexão detalhado:`, {
      isConnected,
      clientReady,
      hasToken,
      finalStatus,
      botUsername: this.client?.user?.tag || 'N/A',
      clientExists: !!this.client,
      userExists: !!this.client?.user,
      tokenExists: hasToken
    });

    // Se não está conectado, dar dicas sobre o problema
    if (!finalStatus) {
      if (!hasToken) {
        console.log('❌ [DiscordService] Problema: Token não configurado');
      } else if (!this.client) {
        console.log('❌ [DiscordService] Problema: Client não inicializado');
      } else if (!clientReady) {
        console.log('❌ [DiscordService] Problema: Client não está pronto (user não definido)');
      } else if (!isConnected) {
        console.log('❌ [DiscordService] Problema: Flag isConnected é false');
      }
    }

    return finalStatus;
  }

  getBotUsername(): string {
    return this.client.user?.tag || 'LoL Matchmaking Bot';
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getActiveMatches(): number {
    return this.activeMatches.size;
  }

  // Verificar se há usuários no canal de matchmaking
  async hasUsersInMatchmakingChannel(): Promise<boolean> {
    console.log('🔍 [DEBUG] Verificando se há usuários no canal...');

    if (!this.isConnected || !this.client) {
      console.log('❌ [DEBUG] Discord não conectado ou client não disponível');
      return false;
    }

    const guild = this.client.guilds.cache.first();
    if (!guild) {
      console.log('❌ [DEBUG] Guild não encontrada');
      return false;
    }

    console.log(`🔍 [DEBUG] Procurando canal: ${this.targetChannelName}`);
    const matchmakingChannel = guild.channels.cache.find(
      channel => channel.name === this.targetChannelName && channel.type === ChannelType.GuildVoice
    );

    if (!matchmakingChannel) {
      console.log(`❌ [DEBUG] Canal ${this.targetChannelName} não encontrado`);
      return false;
    }

    // Verificar se há membros no canal (apenas para canais de voz)
    if (matchmakingChannel.type === ChannelType.GuildVoice) {
      const voiceChannel = matchmakingChannel as any;
      const membersInChannel = voiceChannel.members?.size || 0;
      console.log(`👥 [DEBUG] Usuários no canal ${this.targetChannelName}: ${membersInChannel}`);
      return membersInChannel > 0;
    }

    console.log('❌ [DEBUG] Canal encontrado mas não é de voz');
    return false;
  }

  // Obter lista de usuários no canal de matchmaking
  async getUsersInMatchmakingChannel(): Promise<any[]> {
    console.log('🔍 [DEBUG] Iniciando busca de usuários no canal...');

    if (!this.isConnected || !this.client) {
      console.log('❌ [DEBUG] Discord não conectado ou client não disponível');
      return [];
    }

    const guild = this.client.guilds.cache.first();
    if (!guild) {
      console.log('❌ [DEBUG] Guild não encontrada');
      return [];
    }

    console.log(`🔍 [DEBUG] Procurando canal: ${this.targetChannelName}`);
    console.log(`🔍 [DEBUG] Canais disponíveis:`, guild.channels.cache.map(c => `${c.name} (${c.type})`));

    const matchmakingChannel = guild.channels.cache.find(
      channel => channel.name === this.targetChannelName && channel.type === ChannelType.GuildVoice
    );

    if (!matchmakingChannel) {
      console.log(`❌ [DEBUG] Canal ${this.targetChannelName} não encontrado`);
      return [];
    }

    if (matchmakingChannel.type !== ChannelType.GuildVoice) {
      console.log(`❌ [DEBUG] Canal encontrado mas não é de voz: ${matchmakingChannel.type}`);
      return [];
    }

    console.log(`✅ [DEBUG] Canal encontrado: ${matchmakingChannel.name}`);

    // Tentar buscar membros do canal de forma mais robusta
    let members: any = null;

    try {
      // Método 1: Tentar acessar members diretamente
      const voiceChannel = matchmakingChannel as any;
      if (voiceChannel.members && voiceChannel.members.size > 0) {
        members = voiceChannel.members;
        console.log(`✅ [DEBUG] Members encontrados via cache: ${members.size}`);
      } else {
        console.log('⚠️ [DEBUG] Cache vazia, tentando buscar da API...');

        // Método 2: Tentar buscar via API
        try {
          await guild.members.fetch();
          console.log('✅ [DEBUG] Cache de membros atualizada via API');

          // Tentar novamente após atualizar cache
          if (voiceChannel.members && voiceChannel.members.size > 0) {
            members = voiceChannel.members;
            console.log(`✅ [DEBUG] Members encontrados após atualização: ${members.size}`);
          }
        } catch (fetchError) {
          console.error('❌ [DEBUG] Erro ao buscar membros via API:', fetchError);
        }
      }

      // Método 3: Se ainda não funcionou, tentar buscar via guild.members
      if (!members || members.size === 0) {
        console.log('⚠️ [DEBUG] Tentando método alternativo via guild.members...');
        const allMembers = guild.members.cache;
        const membersInChannel: any[] = [];

        for (const member of Array.from(allMembers.values())) {
          if (member.voice.channel && member.voice.channel.id === matchmakingChannel.id) {
            membersInChannel.push(member);
          }
        }

        if (membersInChannel.length > 0) {
          console.log(`✅ [DEBUG] Members encontrados via guild.members: ${membersInChannel.length}`);
          members = new Map();
          membersInChannel.forEach(member => {
            members.set(member.id, member);
          });
        }
      }

    } catch (error) {
      console.error('❌ [DEBUG] Erro ao buscar membros do canal:', error);
      return [];
    }

    if (!members || members.size === 0) {
      console.log('❌ [DEBUG] Nenhum membro encontrado no canal');
      return [];
    }

    console.log(`🔍 [DEBUG] Processando ${members.size} membros do canal`);

    const usersInChannel = [];

    for (const member of members.values()) {
      const user = member.user;

      // Buscar nick vinculado no banco de dados
      let linkedNickname = null;
      try {
        linkedNickname = await this.getLinkedNicknameForUser(user.id);
        console.log(`🔗 [DEBUG] Nick vinculado para ${user.username}:`, linkedNickname);
      } catch (error) {
        console.error(`❌ [DEBUG] Erro ao buscar nick vinculado para ${user.username}:`, error);
      }

      const userData = {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        displayName: member.displayName || user.username, // Usar nickname customizado se disponível
        hasAppOpen: true, // Se está no canal Discord, considera que tem o app aberto
        discordId: user.id,
        linkedNickname: linkedNickname // Incluir nick vinculado
      };

      // Log detalhado para debug
      console.log(`👤 [DEBUG] Usuário processado:`, {
        id: userData.id,
        username: userData.username,
        displayName: userData.displayName,
        linkedNickname: userData.linkedNickname,
        hasCustomNick: member.displayName !== user.username
      });

      usersInChannel.push(userData);
    }

    console.log(`👥 Usuários no canal ${this.targetChannelName}:`, usersInChannel.map(u => {
      const discordName = u.displayName || u.username;
      const lolInfo = u.linkedNickname ? ` (${u.linkedNickname.gameName}#${u.linkedNickname.tagLine})` : '';
      return `${discordName}${lolInfo}`;
    }));
    return usersInChannel;
  }

  // Método para atualizar membros do canal via API
  private async refreshChannelMembers(channelId: string): Promise<void> {
    try {
      const guild = this.client.guilds.cache.first();
      if (!guild) return;

      console.log('🔄 [DEBUG] Atualizando cache de membros...');

      // Buscar todos os membros da guild
      await guild.members.fetch();
      console.log('✅ [DEBUG] Cache de membros atualizada');

      // Buscar especificamente o canal
      const channel = guild.channels.cache.get(channelId);
      if (channel && channel.type === ChannelType.GuildVoice) {
        const voiceChannel = channel as any;
        console.log(`🔍 [DEBUG] Canal ${channel.name} tem ${voiceChannel.members?.size || 0} membros após atualização`);
      }

    } catch (error) {
      console.error('❌ [DEBUG] Erro ao atualizar cache de membros:', error);
    }
  }

  // Enviar lista de usuários online para todos os clientes (com throttling normal)
  async broadcastUsersInChannel(): Promise<void> {
    // Verificar throttling
    const now = Date.now();
    if (now - this.lastBroadcastTime < this.BROADCAST_COOLDOWN) {
      console.log(`⏱️ [DiscordService] Broadcast ignorado (throttling): ${now - this.lastBroadcastTime}ms desde último broadcast`);
      return;
    }

    await this.performBroadcast(false); // Broadcast normal
  }

  // Enviar lista de usuários online IMEDIATAMENTE (com throttling mínimo)
  async broadcastUsersInChannelImmediate(): Promise<void> {
    // Verificar throttling mínimo para evitar spam extremo
    const now = Date.now();
    if (now - this.lastBroadcastTime < this.IMMEDIATE_BROADCAST_COOLDOWN) {
      console.log(`⏱️ [DiscordService] Broadcast imediato ignorado (throttling mínimo): ${now - this.lastBroadcastTime}ms desde último broadcast`);
      return;
    }

    console.log(`🚀 [DiscordService] Broadcast IMEDIATO de usuários no canal...`);
    await this.performBroadcast(false); // Broadcast imediato (não crítico)
  }

  // Método privado para executar o broadcast real
  private async performBroadcast(isCritical: boolean = false): Promise<void> {
    const now = Date.now();
    this.lastBroadcastTime = now;

    console.log('📡 [DiscordService] Iniciando broadcast de usuários no canal...');
    const usersInChannel = await this.getUsersInMatchmakingChannel();

    // Verificar se houve mudança real nos usuários (exceto para broadcasts críticos)
    if (!isCritical && !this.hasUsersChanged(usersInChannel)) {
      console.log(`📡 [DiscordService] Nenhuma mudança nos usuários, broadcast ignorado`);
      return;
    }

    console.log(`📡 [DiscordService] Broadcast enviando ${usersInChannel.length} usuários`);

    // Preparar dados do broadcast
    const broadcastData: any = {
      type: 'discord_users_online',
      users: usersInChannel,
      timestamp: now,
      critical: isCritical
    };

    // NOVO: Incluir informações do usuário atual se disponível
    // Isso será preenchido pelo frontend quando enviar dados do LCU
    if (this.lastKnownLCUData) {
      const currentUser = await this.identifyCurrentUserFromLCU(this.lastKnownLCUData);
      if (currentUser) {
        broadcastData.currentUser = currentUser;
        console.log('✅ [DiscordService] Incluindo usuário atual no broadcast:', currentUser.displayName);
      }
    }

    this.broadcastToClients(broadcastData);

    // Atualizar cache
    this.lastBroadcastedUsers = [...usersInChannel];
    this.lastBroadcastHash = this.calculateUsersHash(usersInChannel);
  }

  setWebSocketServer(wss: any): void {
    this.wss = wss;
    console.log('🔗 DiscordService conectado ao WebSocket principal');
  }

  private async broadcastDiscordLinks(): Promise<void> {
    try {
      const links = await this.databaseManager.getAllDiscordLinks();
      this.broadcastToClients({
        type: 'discord_links_update',
        links: links
      });
    } catch (error) {
      console.error('❌ Erro ao broadcast vinculações:', error);
    }
  }

  // Obter informações do usuário atual no canal Discord
  async getCurrentUserInfo(): Promise<any> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    const guild = this.client.guilds.cache.first();
    if (!guild) {
      return null;
    }

    const matchmakingChannel = guild.channels.cache.find(
      channel => channel.name === this.targetChannelName && channel.type === ChannelType.GuildVoice
    );

    if (!matchmakingChannel || matchmakingChannel.type !== ChannelType.GuildVoice) {
      return null;
    }

    // Retornar informações sobre o canal em vez de um usuário específico
    // O usuário atual será identificado pelo frontend baseado nos dados do LCU
    const voiceChannel = matchmakingChannel as any;
    const members = voiceChannel.members;

    return {
      channelId: matchmakingChannel.id,
      channelName: matchmakingChannel.name,
      membersCount: members ? members.size : 0,
      // Não retornar um usuário específico para evitar confusão
      // O frontend deve identificar o usuário atual baseado nos dados do LCU
    };
  }

  // Método para calcular hash dos usuários para detectar mudanças
  private calculateUsersHash(users: any[]): string {
    const userData = users.map(u => `${u.id}-${u.username}-${u.linkedNickname ? `${u.linkedNickname.gameName}#${u.linkedNickname.tagLine}` : 'none'}`).sort();
    return userData.join('|');
  }

  // Método para verificar se houve mudança real nos usuários
  private hasUsersChanged(users: any[]): boolean {
    const currentHash = this.calculateUsersHash(users);
    const hasChanged = currentHash !== this.lastBroadcastHash;

    if (hasChanged) {
      console.log(`🔄 [DiscordService] Mudança detectada nos usuários do canal`);
      this.lastBroadcastHash = currentHash;
    }

    return hasChanged;
  }

  // NOVO: Broadcast crítico sem throttling
  async broadcastUsersInChannelCritical(): Promise<void> {
    console.log(`🚨 [DiscordService] Broadcast CRÍTICO de usuários no canal (sem throttling)...`);

    // SEM throttling para eventos críticos - sempre enviar
    await this.performBroadcast(true); // Broadcast crítico
  }

  // NOVO: Método para identificar o usuário atual no Discord baseado nos dados do LCU
  async identifyCurrentUserFromLCU(lcuData?: { gameName: string, tagLine: string } | { displayName: string }): Promise<any> {
    if (!lcuData) {
      console.log('⚠️ [DiscordService] Dados do LCU não disponíveis para identificação do usuário atual');
      return null;
    }

    // Processar dados do LCU - aceitar tanto formato separado quanto displayName completo
    let gameName: string;
    let tagLine: string;

    if ('displayName' in lcuData) {
      // Se recebeu displayName, extrair gameName e tagLine
      const displayName = lcuData.displayName;
      const parts = displayName.split('#');
      if (parts.length === 2) {
        gameName = parts[0];
        tagLine = parts[1];
        console.log('🔍 [DiscordService] Processando displayName:', displayName, '→', { gameName, tagLine });
      } else {
        console.error('❌ [DiscordService] Formato de displayName inválido:', displayName);
        return null;
      }
    } else {
      // Se recebeu formato separado, usar diretamente
      gameName = lcuData.gameName;
      tagLine = lcuData.tagLine;
    }

    if (!gameName || !tagLine) {
      console.log('⚠️ [DiscordService] gameName ou tagLine não disponíveis');
      return null;
    }

    const lcuFullName = `${gameName}#${tagLine}`;
    console.log('🔍 [DiscordService] Identificando usuário atual para:', lcuFullName);

    // Buscar usuários no canal
    const usersInChannel = await this.getUsersInMatchmakingChannel();

    // Procurar nos usuários online do Discord que tenham o nick vinculado
    const matchingUser = usersInChannel.find(user => {
      if (user.linkedNickname) {
        // Discord salva com # no tagLine, então comparar diretamente
        const discordFullName = `${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`;
        console.log(`🔍 [DiscordService] Comparando: "${discordFullName}" com "${lcuFullName}"`);
        return discordFullName === lcuFullName;
      }
      return false;
    });

    if (matchingUser) {
      const currentUser = {
        id: matchingUser.id,
        username: matchingUser.username,
        displayName: matchingUser.displayName || matchingUser.username,
        linkedNickname: matchingUser.linkedNickname,
        isInChannel: true
      };
      console.log('✅ [DiscordService] Usuário atual identificado:', currentUser);
      return currentUser;
    } else {
      console.log('❌ [DiscordService] Usuário atual não encontrado nos usuários Discord online');
      console.log('🔍 [DiscordService] Usuários disponíveis:', usersInChannel.map(u => ({
        username: u.username,
        linkedNickname: u.linkedNickname ? `${u.linkedNickname.gameName}#${u.linkedNickname.tagLine}` : 'none'
      })));
      return null;
    }
  }

  // NOVO: Método para broadcast do usuário atual
  async broadcastCurrentUser(lcuData?: { gameName: string, tagLine: string } | { displayName: string }): Promise<void> {
    const currentUser = await this.identifyCurrentUserFromLCU(lcuData);

    this.broadcastToClients({
      type: 'discord_current_user',
      currentUser: currentUser,
      timestamp: Date.now()
    });
  }

  // NOVO: Método para atualizar dados do LCU e fazer broadcast
  async updateLCUDataAndBroadcast(lcuData: { gameName: string, tagLine: string } | { displayName: string }): Promise<void> {
    console.log('🔄 [DiscordService] Atualizando dados do LCU:', lcuData);

    // Processar dados do LCU - aceitar tanto formato separado quanto displayName completo
    let processedLCUData: { gameName: string, tagLine: string };

    if ('displayName' in lcuData) {
      // Se recebeu displayName, extrair gameName e tagLine
      const displayName = lcuData.displayName;
      const parts = displayName.split('#');
      if (parts.length === 2) {
        processedLCUData = {
          gameName: parts[0],
          tagLine: parts[1]
        };
        console.log('🔄 [DiscordService] Processando displayName:', displayName, '→', processedLCUData);
      } else {
        console.error('❌ [DiscordService] Formato de displayName inválido:', displayName);
        return;
      }
    } else {
      // Se recebeu formato separado, usar diretamente
      processedLCUData = lcuData as { gameName: string, tagLine: string };
    }

    // Atualizar cache dos dados do LCU
    this.lastKnownLCUData = processedLCUData;

    // Fazer broadcast do usuário atual
    await this.broadcastCurrentUser(processedLCUData);

    // Também fazer broadcast dos usuários no canal com informações do usuário atual
    await this.performBroadcast(true); // Broadcast crítico para incluir usuário atual
  }

  // ===== MÉTODOS PÚBLICOS PARA GERENCIAMENTO DE MATCHES =====

  // Obter match ativo por ID
  getActiveMatch(matchId: string): DiscordMatch | undefined {
    return this.activeMatches.get(matchId);
  }

  // Obter todos os matches ativos
  getAllActiveMatches(): Map<string, DiscordMatch> {
    return new Map(this.activeMatches);
  }

  // Verificar se um jogador está em um match ativo
  isPlayerInActiveMatch(userId: string): boolean {
    for (const match of Array.from(this.activeMatches.values())) {
      const isInMatch = match.blueTeam.some(p => p.userId === userId) ||
        match.redTeam.some(p => p.userId === userId);
      if (isInMatch) return true;
    }
    return false;
  }

  // Obter match de um jogador específico
  getPlayerMatch(userId: string): DiscordMatch | undefined {
    for (const match of Array.from(this.activeMatches.values())) {
      const isInMatch = match.blueTeam.some(p => p.userId === userId) ||
        match.redTeam.some(p => p.userId === userId);
      if (isInMatch) return match;
    }
    return undefined;
  }

  // Finalizar partida (chamado quando a partida termina normalmente)
  async finishMatch(matchId: string, winner?: 'blue' | 'red'): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`❌ Match ${matchId} não encontrado para finalizar`);
      return;
    }

    console.log(`🏆 [DiscordService] Finalizando match ${matchId}${winner ? ` - Vencedor: ${winner} team` : ''}`);

    try {
      // 1. Mover jogadores de volta aos canais de origem
      await this.movePlayersBackToOrigin(matchId);

      // 2. Aguardar um pouco para garantir que todos foram movidos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Limpar canais temporários
      await this.cleanupMatch(matchId);

      // 4. Broadcast da finalização
      this.broadcastToClients({
        type: 'match_finished',
        matchId,
        winner,
        timestamp: Date.now()
      });

      console.log(`✅ [DiscordService] Match ${matchId} finalizado com sucesso`);

    } catch (error) {
      console.error(`❌ Erro ao finalizar match ${matchId}:`, error);
    }
  }

  // Cancelar partida (chamado quando a partida é cancelada no draft ou durante o jogo)
  async cancelMatch(matchId: string, reason: string = 'Cancelada'): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`❌ Match ${matchId} não encontrado para cancelar`);
      return;
    }

    console.log(`❌ [DiscordService] Cancelando match ${matchId} - Motivo: ${reason}`);

    try {
      // 1. Mover jogadores de volta aos canais de origem
      await this.movePlayersBackToOrigin(matchId);

      // 2. Aguardar um pouco para garantir que todos foram movidos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. Limpar canais temporários
      await this.cleanupMatch(matchId);

      // 4. Broadcast do cancelamento
      this.broadcastToClients({
        type: 'match_cancelled',
        matchId,
        reason,
        timestamp: Date.now()
      });

      console.log(`✅ [DiscordService] Match ${matchId} cancelado com sucesso`);

    } catch (error) {
      console.error(`❌ Erro ao cancelar match ${matchId}:`, error);
    }
  }

  // Método para ser chamado quando uma partida termina (integração externa)
  async onGameEnd(gameData: {
    gameId?: string,
    matchId?: string,
    winner?: 'blue' | 'red',
    players?: string[] // IDs dos jogadores
  }): Promise<void> {
    console.log('🎮 [DiscordService] Partida finalizada detectada:', gameData);

    // Tentar encontrar o match Discord correspondente
    let discordMatch: DiscordMatch | undefined;

    if (gameData.matchId) {
      // Se temos o ID do match Discord, usar diretamente
      discordMatch = this.activeMatches.get(gameData.matchId);
    } else if (gameData.players && gameData.players.length > 0) {
      // Se temos lista de jogadores, tentar encontrar o match por jogadores
      for (const match of Array.from(this.activeMatches.values())) {
        const allPlayerIds = [...match.blueTeam, ...match.redTeam].map(p => p.userId);
        const hasCommonPlayers = gameData.players.some(playerId => allPlayerIds.includes(playerId));

        if (hasCommonPlayers) {
          discordMatch = match;
          break;
        }
      }
    }

    if (discordMatch) {
      console.log(`🏆 [DiscordService] Finalizando match Discord ${discordMatch.id} baseado no fim da partida`);
      await this.finishMatch(discordMatch.id, gameData.winner);
    } else {
      console.log('⚠️ [DiscordService] Nenhum match Discord correspondente encontrado para a partida finalizada');
    }
  }

  // Método para ser chamado quando uma partida é cancelada (draft dodged, game cancelled, etc.)
  async onGameCancel(gameData: {
    gameId?: string,
    matchId?: string,
    reason?: string,
    players?: string[] // IDs dos jogadores
  }): Promise<void> {
    console.log('❌ [DiscordService] Cancelamento de partida detectado:', gameData);

    // Tentar encontrar o match Discord correspondente
    let discordMatch: DiscordMatch | undefined;

    if (gameData.matchId) {
      discordMatch = this.activeMatches.get(gameData.matchId);
    } else if (gameData.players && gameData.players.length > 0) {
      for (const match of Array.from(this.activeMatches.values())) {
        const allPlayerIds = [...match.blueTeam, ...match.redTeam].map(p => p.userId);
        const hasCommonPlayers = gameData.players.some(playerId => allPlayerIds.includes(playerId));

        if (hasCommonPlayers) {
          discordMatch = match;
          break;
        }
      }
    }

    if (discordMatch) {
      console.log(`❌ [DiscordService] Cancelando match Discord ${discordMatch.id} baseado no cancelamento da partida`);
      await this.cancelMatch(discordMatch.id, gameData.reason || 'Partida cancelada');
    } else {
      console.log('⚠️ [DiscordService] Nenhum match Discord correspondente encontrado para a partida cancelada');
    }
  }

  private async findDiscordIdByLinkedNickname(gameName: string, tagLine: string): Promise<string | null> {
    try {
      console.log(`🔍 [DiscordService] Buscando Discord ID para ${gameName}#${tagLine}`);
      const link = await this.databaseManager.getDiscordLinkByGameName(gameName, tagLine);

      if (link) {
        console.log(`✅ [DiscordService] Discord ID encontrado: ${link.discord_id} para ${gameName}#${tagLine}`);
        return link.discord_id;
      } else {
        console.log(`❌ [DiscordService] Nenhuma vinculação encontrada para ${gameName}#${tagLine}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ [DiscordService] Erro ao buscar Discord ID para ${gameName}#${tagLine}:`, error);
      return null;
    }
  }

  // Adicionar ao DiscordService
  async createDiscordMatch(matchId: number, matchData: any): Promise<void> {
    const guild = this.client.guilds.cache.first();
    if (!guild) {
      throw new Error('Guild não encontrada');
    }

    // Verificar se o match já existe
    if (this.activeMatches.has(matchId.toString())) {
      console.log(`⚠️ [DiscordService] Match ${matchId} já existe, ignorando criação duplicada`);
      return;
    }

    try {
      // 1. Criar categoria e canais de voz
      const category = await guild.channels.create({
        name: `Match ${matchId}`,
        type: ChannelType.GuildCategory
      });

      const blueChannel = await guild.channels.create({
        name: `🔵-blue-team-${matchId}`,
        type: ChannelType.GuildVoice,
        parent: category.id
      });

      const redChannel = await guild.channels.create({
        name: `🔴-red-team-${matchId}`,
        type: ChannelType.GuildVoice,
        parent: category.id
      });

      // 2. Obter informações dos jogadores do matchData
      const team1Players = typeof matchData.team1_players === 'string'
        ? JSON.parse(matchData.team1_players)
        : (matchData.team1_players || []);
      const team2Players = typeof matchData.team2_players === 'string'
        ? JSON.parse(matchData.team2_players)
        : (matchData.team2_players || []);

      // 3. Criar objetos DiscordPlayer para cada time
      const blueTeam: DiscordPlayer[] = [];
      const redTeam: DiscordPlayer[] = [];

      // 4. Mapear jogadores para os times do Discord
      for (const playerName of team1Players) {
        const discordId = await this.findDiscordIdBySummonerName(playerName);
        if (discordId) {
          blueTeam.push({
            userId: discordId,
            username: playerName,
            role: '', // Preencher com a role adequada
            timestamp: Date.now()
          });
        }
      }

      for (const playerName of team2Players) {
        const discordId = await this.findDiscordIdBySummonerName(playerName);
        if (discordId) {
          redTeam.push({
            userId: discordId,
            username: playerName,
            role: '', // Preencher com a role adequada
            timestamp: Date.now()
          });
        }
      }

      // 5. Criar objeto de match
      const match: DiscordMatch = {
        id: matchId.toString(),
        blueTeam,
        redTeam,
        blueChannelId: blueChannel.id,
        redChannelId: redChannel.id,
        categoryId: category.id,
        startTime: Date.now(),
        originalChannels: new Map<string, string>()
      };

      this.activeMatches.set(matchId.toString(), match);

      // 6. Mover jogadores para os canais
      await this.movePlayersToChannels(blueTeam, blueChannel, redTeam, redChannel, matchId.toString());

      console.log(`✅ [DiscordService] Match ${matchId} criado com sucesso e jogadores movidos`);

    } catch (error) {
      console.error(`❌ [DiscordService] Erro ao criar match ${matchId}:`, error);
      throw error;
    }
  }

  async cleanupMatchByCustomId(matchId: number): Promise<void> {
    const match = this.activeMatches.get(matchId.toString());
    if (!match) {
      console.log(`❌ [cleanupMatchByCustomId] Match ${matchId} não encontrado`);
      return;
    }

    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    try {
      // Mover jogadores de volta
      await this.movePlayersBackToOrigin(matchId.toString());

      // Deletar canais
      const channelsToDelete = [match.blueChannelId, match.redChannelId, match.categoryId].filter(Boolean);
      for (const channelId of channelsToDelete) {
        try {
          const channel = guild.channels.cache.get(channelId);
          if (channel) {
            await channel.delete(`Cleanup for match ${matchId}`);
            console.log(`🗑️ [cleanupMatchByCustomId] Canal ${channel.name} (${channelId}) deletado`);
          }
        } catch (error) {
          console.error(`❌ [cleanupMatchByCustomId] Erro ao deletar canal ${channelId}:`, error);
        }
      }

      // Remover do mapa de matches ativos
      this.activeMatches.delete(matchId.toString());
      console.log(`✅ [cleanupMatchByCustomId] Match ${matchId} completamente limpo`);

    } catch (error) {
      console.error(`❌ [cleanupMatchByCustomId] Erro ao limpar match ${matchId}:`, error);
      throw error;
    }
  }

  // Adicionar ao DiscordService
  private async findDiscordIdBySummonerName(summonerName: string): Promise<string | null> {
    try {
      // Dividir o summonerName em gameName e tagLine (se houver '#')
      const [gameName, tagLine] = summonerName.includes('#')
        ? summonerName.split('#')
        : [summonerName, ''];

      const link = await this.databaseManager.getDiscordLinkByGameName(gameName, tagLine);
      return link?.discord_id || null;
    } catch (error) {
      console.error(`❌ [findDiscordIdBySummonerName] Erro ao buscar Discord ID para ${summonerName}:`, error);
      return null;
    }
  }

  // Adicionar ao DiscordService
  isReady(): boolean {
    return this.isConnected && !!this.client?.user;
  }
}