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
  private targetChannelName = '🦆┊Fazenda';
  private databaseManager: DatabaseManager;

  // WebSocket principal do servidor
  private wss: any = null;

  // Throttling para broadcast de usuários - REDUZIDO PARA TEMPO REAL
  private lastBroadcastTime = 0;
  private readonly BROADCAST_COOLDOWN = 1000; // Reduzido para 1 segundo entre broadcasts (era 10 segundos)
  private readonly IMMEDIATE_BROADCAST_COOLDOWN = 100; // 100ms para broadcasts imediatos (entrada/saída)

  // Cache de usuários para evitar broadcasts desnecessários
  private lastBroadcastedUsers: any[] = [];
  private lastBroadcastHash = '';

  constructor(databaseManager: DatabaseManager) {
    this.databaseManager = databaseManager;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
      ]
    });

    this.setupDiscordEvents();
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
      await this.broadcastUsersInChannel();
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
      
      // Broadcast IMEDIATO para entrada/saída (sem throttling)
      await this.broadcastUsersInChannelImmediate();
      
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

  // Métodos para comunicação com frontend
  addClient(ws: WSClient): void {
    // Método removido - não é mais necessário
    // O DiscordService agora usa o WebSocket principal do servidor
  }

  private async handleClientMessage(ws: WSClient, message: any): Promise<void> {
    console.log(`📥 [DiscordService] Mensagem recebida:`, message.type);
    
    try {
      switch (message.type) {
        case 'get_discord_status':
          // Responder imediatamente com status atual
          const status = {
            type: 'discord_status',
            isConnected: this.isConnected,
            inChannel: await this.hasUsersInMatchmakingChannel(),
            currentUser: await this.getCurrentUserInfo(),
            timestamp: Date.now()
          };
          ws.send(JSON.stringify(status));
          break;
          
        case 'get_discord_users_online':
          // Responder imediatamente com usuários atuais
          const users = await this.getUsersInMatchmakingChannel();
          ws.send(JSON.stringify({
            type: 'discord_users_online',
            users: users,
            timestamp: Date.now()
          }));
          break;
          
        case 'get_discord_links':
          // Responder imediatamente com links
          await this.broadcastDiscordLinks();
          break;
          
        case 'get_discord_channel_status':
          // Responder imediatamente com status do canal
          const channelStatus = {
            type: 'discord_channel_status',
            inChannel: await this.hasUsersInMatchmakingChannel(),
            usersCount: (await this.getUsersInMatchmakingChannel()).length,
            timestamp: Date.now()
          };
          ws.send(JSON.stringify(channelStatus));
          break;
          
        case 'join_discord_queue':
          // Processar entrada na fila Discord
          if (message.data) {
            await this.addToQueue(
              message.data.discordId,
              message.data.username || 'Unknown',
              message.data.role || 'fill',
              message.data.lcuData
            );
          }
          break;
          
        case 'leave_discord_queue':
          // Processar saída da fila Discord
          if (message.data && message.data.discordId) {
            this.removeFromQueue(message.data.discordId);
          }
          break;
          
        default:
          console.log(`⚠️ [DiscordService] Tipo de mensagem não reconhecido:`, message.type);
      }
    } catch (error) {
      console.error(`❌ [DiscordService] Erro ao processar mensagem:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Erro interno do servidor Discord',
        timestamp: Date.now()
      }));
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
        
        for (const member of allMembers.values()) {
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

    await this.performBroadcast();
  }

  // Enviar lista de usuários online IMEDIATAMENTE (sem throttling para eventos críticos)
  async broadcastUsersInChannelImmediate(): Promise<void> {
    // Verificar throttling mínimo para evitar spam extremo
    const now = Date.now();
    if (now - this.lastBroadcastTime < this.IMMEDIATE_BROADCAST_COOLDOWN) {
      console.log(`⏱️ [DiscordService] Broadcast imediato ignorado (throttling mínimo): ${now - this.lastBroadcastTime}ms desde último broadcast`);
      return;
    }

    console.log(`🚀 [DiscordService] Broadcast IMEDIATO de usuários no canal...`);
    await this.performBroadcast();
  }

  // Método privado para executar o broadcast real
  private async performBroadcast(): Promise<void> {
    const now = Date.now();
    this.lastBroadcastTime = now;
    
    console.log('📡 [DiscordService] Iniciando broadcast de usuários no canal...');
    const usersInChannel = await this.getUsersInMatchmakingChannel();
    
    // Verificar se houve mudança real nos usuários
    if (!this.hasUsersChanged(usersInChannel)) {
      console.log(`📡 [DiscordService] Nenhuma mudança nos usuários, broadcast ignorado`);
      return;
    }
    
    console.log(`📡 [DiscordService] Broadcast enviando ${usersInChannel.length} usuários`);
    
    this.broadcastToClients({
      type: 'discord_users_online',
      users: usersInChannel,
      timestamp: now
    });
    
    // Atualizar cache
    this.lastBroadcastedUsers = [...usersInChannel];
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

    // Buscar o usuário atual baseado no bot (ou implementar lógica para identificar o usuário)
    // Por enquanto, vamos retornar informações do primeiro usuário no canal
    const voiceChannel = matchmakingChannel as any;
    const members = voiceChannel.members;
    
    if (members && members.size > 0) {
      const firstMember = members.first();
      const user = firstMember.user;
      
      return {
        id: user.id,
        username: user.username,
        displayName: firstMember.displayName || user.username,
        discriminator: user.discriminator,
        avatar: user.avatar
      };
    }
    
    return null;
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
}