import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import { WebSocket as WSClient } from 'ws';

export interface DiscordPlayer {
  userId: string;
  username: string;
  role: string;
  timestamp: number;
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

  // WebSocket para comunicação com frontend
  private connectedClients: Set<WSClient> = new Set();

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent
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

    // Detectar Rich Presence (app aberto)
    this.client.on('presenceUpdate', (oldPresence, newPresence) => {
      this.handlePresenceUpdate(oldPresence, newPresence);
    });

    // Comandos slash
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      await this.handleSlashCommand(interaction);
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
    }
    
    // Usuário saiu do canal
    if (oldState.channel && oldState.channel.name === this.targetChannelName) {
      console.log(`👋 ${oldState.member.user.username} saiu do canal de matchmaking`);
      this.removeFromQueue(oldState.member.user.id);
    }
  }

  private async handlePresenceUpdate(oldPresence: any, newPresence: any): Promise<void> {
    if (!newPresence || !newPresence.activities) return;

    const user = newPresence.user;
    const hasLoLApp = newPresence.activities.some((activity: any) => 
      activity.name === 'LoL Matchmaking' || 
      activity.details?.includes('LoL Matchmaking')
    );

    if (hasLoLApp) {
      console.log(`🎮 ${user.username} abriu o app LoL Matchmaking`);
      this.checkUserForQueue(user);
    } else {
      this.removeFromQueue(user.id);
    }
  }

  private async checkUserForQueue(user: any): Promise<void> {
    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const member = guild.members.cache.get(user.id);
    if (!member) return;

    const inMatchmakingChannel = member.voice.channel && 
                               member.voice.channel.name === this.targetChannelName;
    
    const hasAppOpen = member.presence?.activities?.some((activity: any) => 
      activity.name === 'LoL Matchmaking'
    );

    if (inMatchmakingChannel && hasAppOpen) {
      console.log(`✅ ${user.username} qualificado para fila`);
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

  private handleClientMessage(ws: WSClient, message: any): void {
    switch (message.type) {
      case 'join_queue':
        this.addToQueue(message.userId, message.username, message.role);
        break;
      case 'leave_queue':
        this.removeFromQueue(message.userId);
        break;
      case 'get_queue_status':
        this.sendQueueStatus(ws);
        break;
    }
  }

  private addToQueue(userId: string, username: string, role: string): void {
    this.queue.set(userId, {
      userId,
      username,
      role,
      timestamp: Date.now()
    });

    console.log(`🎯 ${username} entrou na fila como ${role} (${this.queue.size}/10)`);
    
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
      queue: Array.from(this.queue.values()),
      size: this.queue.size,
      isConnected: this.isConnected
    }));
  }

  private async registerSlashCommands(): Promise<void> {
    const commands = [
      {
        name: 'queue',
        description: 'Ver status da fila atual'
      },
      {
        name: 'clear_queue',
        description: 'Limpar fila (apenas moderadores)'
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

  private async handleSlashCommand(interaction: any): Promise<void> {
    switch (interaction.commandName) {
      case 'queue':
        const queueList = Array.from(this.queue.values())
          .map(player => `${player.username} (${player.role})`)
          .join('\n') || 'Fila vazia';
        
        await interaction.reply({
          content: `**🎯 Fila Atual (${this.queue.size}/10):**\n\`\`\`${queueList}\`\`\``,
          ephemeral: true
        });
        break;
        
      case 'clear_queue':
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await interaction.reply({ content: '❌ Sem permissão', ephemeral: true });
          return;
        }
        
        this.queue.clear();
        this.broadcastQueueUpdate();
        await interaction.reply('✅ Fila limpa!');
        break;
    }
  }  // Métodos públicos para integração
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
