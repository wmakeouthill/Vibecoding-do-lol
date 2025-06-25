import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { WebSocket as WSClient } from 'ws';
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
}

export class DiscordService {
  private client: Client;
  private queue: Map<string, DiscordPlayer> = new Map();
  private activeMatches: Map<string, DiscordMatch> = new Map();
  private isConnected = false;
  private botToken?: string;
  private targetChannelName = 'lol-matchmaking';
  private databaseManager: DatabaseManager;

  // WebSocket para comunicação com frontend
  private connectedClients: Set<WSClient> = new Set();

  constructor(databaseManager: DatabaseManager) {
    this.databaseManager = databaseManager;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
      ]
    });

    this.setupDiscordEvents();
  }

  private setupDiscordEvents(): void {
    this.client.on('ready', () => {
      console.log(`🎮 Discord Bot ${this.client.user?.tag} conectado!`);
      this.isConnected = true;
      this.registerSlashCommands();
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

  async initialize(token?: string): Promise<boolean> {
    if (!token) {
      console.log('⚠️ Token do Discord não fornecido, Discord Bot não será iniciado');
      return false;
    }

    try {
      // Se já está conectado, desconectar antes de trocar o token
      if (this.isConnected || this.client?.user) {
        console.log('🔄 Reinicializando Discord Bot com novo token...');
        await this.client.destroy();
        // Criar nova instância do client
        this.client = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildVoiceStates
          ]
        });
        this.setupDiscordEvents();
        this.isConnected = false;
      }
      this.botToken = token;
      await this.client.login(token);
      console.log('✅ Discord Bot inicializado com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro ao inicializar Discord Bot:', error);
      return false;
    }
  }

  private async handleVoiceStateChange(oldState: any, newState: any): Promise<void> {
    // Usuário entrou no canal
    if (newState.channel && newState.channel.name === this.targetChannelName) {
      console.log(`👤 ${newState.member.user.username} entrou no canal de matchmaking`);
      this.checkUserForQueue(newState.member.user);
      
      // Enviar lista atualizada de usuários no canal
      this.broadcastUsersInChannel();
    }
    
    // Usuário saiu do canal
    if (oldState.channel && oldState.channel.name === this.targetChannelName) {
      console.log(`👋 ${oldState.member.user.username} saiu do canal de matchmaking`);
      this.removeFromQueue(oldState.member.user.id);
      
      // Enviar lista atualizada de usuários no canal
      this.broadcastUsersInChannel();
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

  // Métodos para comunicação com frontend
  addClient(ws: WSClient): void {
    this.connectedClients.add(ws);
    
    ws.on('close', () => {
      this.connectedClients.delete(ws);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (error) {
        console.error('❌ Erro ao processar mensagem do cliente:', error);
      }
    });
  }

  private async handleClientMessage(ws: WSClient, message: any): Promise<void> {
    switch (message.type) {
      case 'join_queue':
        await this.addToQueue(message.userId, message.username, message.role, message.lcuData);
        break;
      case 'leave_queue':
        this.removeFromQueue(message.userId);
        break;
      case 'get_queue_status':
        this.sendQueueStatus(ws);
        break;
      case 'get_discord_status':
        this.sendDiscordStatus(ws);
        break;
      case 'get_discord_users_online':
        this.sendUsersInChannel(ws);
        break;
      case 'get_discord_links':
        await this.sendDiscordLinks(ws);
        break;
    }
  }

  private async addToQueue(userId: string, username: string, role: string, lcuData?: {gameName: string, tagLine: string}): Promise<void> {
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

    console.log(`🎯 ${displayName} entrou na fila como ${role} (${this.queue.size}/10)`);
    
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
    const guild = this.client.guilds.cache.first();
    
    if (!guild) {
      console.error('❌ Guild não encontrada');
      return;
    }

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

      // Dividir times (5v5)
      const blueTeam = players.slice(0, 5);
      const redTeam = players.slice(5, 10);

      // Mover players para canais
      await this.movePlayersToChannels(blueTeam, blueChannel, redTeam, redChannel);

      // Salvar match ativo
      const match: DiscordMatch = {
        id: matchId,
        blueTeam,
        redTeam,
        blueChannelId: blueChannel.id,
        redChannelId: redChannel.id,
        categoryId: category.id,
        startTime: Date.now()
      };

      this.activeMatches.set(matchId, match);

      // Limpar fila dos players que entraram no match
      players.forEach(player => {
        this.queue.delete(player.userId);
      });

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

  private async movePlayersToChannels(blueTeam: DiscordPlayer[], blueChannel: any, redTeam: DiscordPlayer[], redChannel: any): Promise<void> {
    const guild = this.client.guilds.cache.first();
    if (!guild) return;
    
    for (const player of blueTeam) {
      const member = guild.members.cache.get(player.userId);
      if (member && member.voice.channel) {
        try {
          await member.voice.setChannel(blueChannel);
          console.log(`🔵 ${player.username} movido para Blue Team`);
        } catch (error) {
          console.error(`❌ Erro ao mover ${player.username}:`, error);
        }
      }
    }

    for (const player of redTeam) {
      const member = guild.members.cache.get(player.userId);
      if (member && member.voice.channel) {
        try {
          await member.voice.setChannel(redChannel);
          console.log(`🔴 ${player.username} movido para Red Team`);
        } catch (error) {
          console.error(`❌ Erro ao mover ${player.username}:`, error);
        }
      }
    }
  }

  private async cleanupMatch(matchId: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const guild = this.client.guilds.cache.first();
    if (!guild) return;
    
    try {
      const blueChannel = guild.channels.cache.get(match.blueChannelId);
      const redChannel = guild.channels.cache.get(match.redChannelId);
      const category = guild.channels.cache.get(match.categoryId);
      
      if (blueChannel) await blueChannel.delete();
      if (redChannel) await redChannel.delete();
      if (category) await category.delete();

      this.activeMatches.delete(matchId);
      console.log(`🧹 Match ${matchId} limpo automaticamente`);
      
    } catch (error) {
      console.error(`❌ Erro ao limpar match ${matchId}:`, error);
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
    this.connectedClients.forEach(client => {
      if (client.readyState === WSClient.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  private sendQueueStatus(ws: WSClient): void {
    ws.send(JSON.stringify({
      type: 'queue_status',
      queueSize: this.queue.size,
      queue: Array.from(this.queue.values())
    }));
  }

  private sendDiscordStatus(ws: WSClient): void {
    ws.send(JSON.stringify({
      type: 'discord_status',
      isConnected: this.isConnected,
      botUsername: this.getBotUsername(),
      queueSize: this.getQueueSize(),
      activeMatches: this.getActiveMatches(),
      inChannel: this.hasUsersInMatchmakingChannel()
    }));
  }

  private sendUsersInChannel(ws: WSClient): void {
    const usersInChannel = this.getUsersInMatchmakingChannel();
    ws.send(JSON.stringify({
      type: 'discord_users_online',
      users: usersInChannel
    }));
  }

  private async sendDiscordLinks(ws: WSClient): Promise<void> {
    try {
      const links = await this.databaseManager.getAllDiscordLinks();
      ws.send(JSON.stringify({
        type: 'discord_links_update',
        links: links
      }));
    } catch (error) {
      console.error('❌ Erro ao enviar vinculações:', error);
    }
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

  private async getLinkedNicknameForUser(discordId: string): Promise<{gameName: string, tagLine: string} | null> {
    try {
      const link = await this.databaseManager.getDiscordLink(discordId);
      if (link) {
        return {
          gameName: link.game_name,
          tagLine: link.tag_line
        };
      }
    } catch (error) {
      console.error('❌ Erro ao buscar vinculação:', error);
    }
    return null;
  }

  // Métodos públicos para integração
  isDiscordConnected(): boolean {
    return this.isConnected;
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
  hasUsersInMatchmakingChannel(): boolean {
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
  getUsersInMatchmakingChannel(): any[] {
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

    const voiceChannel = matchmakingChannel as any;
    const members = voiceChannel.members;
    
    if (!members) {
      console.log('❌ [DEBUG] Members não disponível no canal');
      return [];
    }

    console.log(`🔍 [DEBUG] Members encontrados: ${members.size}`);

    const usersInChannel = Array.from(members.values()).map((member: any) => {
      const user = member.user;
      return {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        hasAppOpen: true, // Por enquanto, assumir que está online
        discordId: user.id
      };
    });

    console.log(`👥 Usuários no canal ${this.targetChannelName}:`, usersInChannel.map(u => u.username));
    return usersInChannel;
  }

  // Enviar lista de usuários online para todos os clientes
  broadcastUsersInChannel(): void {
    console.log('📡 [DEBUG] Iniciando broadcast de usuários no canal...');
    const usersInChannel = this.getUsersInMatchmakingChannel();
    
    console.log(`📡 [DEBUG] Broadcast enviando ${usersInChannel.length} usuários`);
    
    this.broadcastToClients({
      type: 'discord_users_online',
      users: usersInChannel
    });
  }

  setWebSocketServer(wss: any): void {
    // Adicionar todos os clientes já conectados
    wss.clients.forEach((client: WSClient) => {
      this.addClient(client);
    });

    // Escutar novas conexões
    wss.on('connection', (ws: WSClient) => {
      this.addClient(ws);
    });
  }
}