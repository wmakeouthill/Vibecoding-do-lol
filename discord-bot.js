const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const WebSocket = require('ws');
const fs = require('fs');

class LoLMatchmakingBot {
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

        this.queue = new Map(); // discordId -> { username, role, timestamp, lcuData }
        this.activeMatches = new Map(); // matchId -> { blueChannel, redChannel, players }
        this.wss = new WebSocket.Server({ port: 8081 }); // Comunicação com apps
        this.DB_PATH = './discord-links.json';
        this.discordUsersOnline = new Map(); // userId -> { username, status, linkedNickname, lcuData }
        this.targetChannelName = 'lol-matchmaking';
        
        this.setupBot();
        this.setupWebSocket();
    }

    setupBot() {
        this.client.on('ready', () => {
            console.log(`🤖 Bot ${this.client.user.tag} está online!`);
            this.updateDiscordUsersOnline();
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
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('📱 App conectado ao Discord Bot');
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleAppMessage(ws, message);
                } catch (error) {
                    console.error('❌ Erro ao processar mensagem do app:', error);
                }
            });

            ws.on('close', () => {
                console.log('📱 App desconectado do Discord Bot');
            });
        });
    }

    async handleVoiceStateChange(oldState, newState) {
        // Usuário entrou no canal
        if (newState.channel && newState.channel.name === this.targetChannelName) {
            console.log(`👤 ${newState.member.user.username} entrou no canal de matchmaking`);
            this.addUserToOnlineList(newState.member.user);
            this.broadcastUserJoined(newState.member.user);
            this.updateDiscordUsersOnline();
        }
        
        // Usuário saiu do canal
        if (oldState.channel && oldState.channel.name === this.targetChannelName) {
            console.log(`👋 ${oldState.member.user.username} saiu do canal de matchmaking`);
            this.removeUserFromOnlineList(oldState.member.user.id);
            this.removeFromQueue(oldState.member.user.id);
            this.broadcastUserLeft(oldState.member.user);
            this.updateDiscordUsersOnline();
        }
    }

    async handlePresenceUpdate(oldPresence, newPresence) {
        if (!newPresence || !newPresence.activities) return;

        const user = newPresence.user;
        const hasLoLApp = newPresence.activities.some(activity => 
            activity.name === 'LoL Matchmaking' || 
            activity.details?.includes('LoL Matchmaking')
        );

        // Atualizar status do usuário
        if (this.discordUsersOnline.has(user.id)) {
            const userData = this.discordUsersOnline.get(user.id);
            userData.hasAppOpen = hasLoLApp;
            this.discordUsersOnline.set(user.id, userData);
        }

        this.updateDiscordUsersOnline();
    }

    addUserToOnlineList(user) {
        const linkedNickname = this.getLinkedNickname(user.id);
        const userData = {
            id: user.id,
            username: user.username,
            hasAppOpen: false,
            linkedNickname: linkedNickname,
            lcuData: null,
            isOnline: true
        };
        
        this.discordUsersOnline.set(user.id, userData);
    }

    removeUserFromOnlineList(userId) {
        this.discordUsersOnline.delete(userId);
    }

    updateDiscordUsersOnline() {
        const users = Array.from(this.discordUsersOnline.values());
        
        // Broadcast para todos os apps conectados
        this.broadcastToApps({
            type: 'discord_users_online',
            users: users
        });
    }

    // Vincular automaticamente com dados do LCU
    async autoLinkWithLCU(gameName, tagLine) {
        // Procurar por usuário Discord que corresponde aos dados do LCU
        for (const [discordId, userData] of this.discordUsersOnline) {
            if (userData.linkedNickname) {
                if (userData.linkedNickname.gameName === gameName && 
                    userData.linkedNickname.tagLine === tagLine) {
                    return userData;
                }
            }
        }

        // Se não encontrou, salvar vinculação para usuário atual no canal
        const guild = this.client.guilds.cache.first();
        if (!guild) return null;

        const channel = guild.channels.cache.find(ch => ch.name === this.targetChannelName);
        if (!channel) return null;

        // Encontrar usuário no canal (assumindo que é o usuário atual)
        const member = channel.members.first();
        if (!member) return null;

        const discordId = member.user.id;
        this.saveLinkedNickname(discordId, gameName, tagLine);

        // Atualizar dados do usuário
        if (this.discordUsersOnline.has(discordId)) {
            const userData = this.discordUsersOnline.get(discordId);
            userData.linkedNickname = { gameName, tagLine };
            userData.lcuData = { gameName, tagLine };
            this.discordUsersOnline.set(discordId, userData);
        }

        // Broadcast auto-vinculação
        this.broadcastToApps({
            type: 'auto_link_success',
            discordId: discordId,
            username: member.user.username,
            gameName: gameName,
            tagLine: tagLine
        });

        return { discordId, username: member.user.username, gameName, tagLine };
    }

    getLinkedNickname(discordId) {
        if (!fs.existsSync(this.DB_PATH)) return null;
        
        try {
            const db = JSON.parse(fs.readFileSync(this.DB_PATH, 'utf-8'));
            return db[discordId] || null;
        } catch (error) {
            console.error('❌ Erro ao ler DB de nicknames:', error);
            return null;
        }
    }

    saveLinkedNickname(discordId, gameName, tagLine) {
        let db = {};
        if (fs.existsSync(this.DB_PATH)) {
            db = JSON.parse(fs.readFileSync(this.DB_PATH, 'utf-8'));
        }
        
        db[discordId] = { gameName, tagLine };
        fs.writeFileSync(this.DB_PATH, JSON.stringify(db, null, 2));
        
        console.log(`💾 Nickname salvo: ${discordId} -> ${gameName}#${tagLine}`);
    }

    addToQueue(discordId, username, role, lcuData = null) {
        this.queue.set(discordId, {
            username,
            role,
            timestamp: Date.now(),
            lcuData: lcuData
        });

        console.log(`🎯 ${username} entrou na fila como ${role} (${this.queue.size}/10)`);
        
        this.broadcastQueueUpdate();
        
        // Verificar se pode formar match
        if (this.queue.size >= 10) {
            this.tryCreateMatch();
        }
    }

    removeFromQueue(discordId) {
        if (this.queue.has(discordId)) {
            const player = this.queue.get(discordId);
            this.queue.delete(discordId);
            console.log(`👋 ${player.username} saiu da fila (${this.queue.size}/10)`);
            this.broadcastQueueUpdate();
        }
    }

    tryCreateMatch() {
        if (this.queue.size < 10) return;

        const players = Array.from(this.queue.values());
        
        // Validar composição de roles
        const roleCount = {};
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

    async createMatch(players) {
        const matchId = Date.now().toString();
        const guild = this.client.guilds.cache.first();
        
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

            // Salvar match
            this.activeMatches.set(matchId, {
                blueChannel: blueChannel.id,
                redChannel: redChannel.id,
                players: players,
                createdAt: Date.now()
            });

            // Mover jogadores para canais
            await this.movePlayersToChannels(blueTeam, blueChannel, redTeam, redChannel);

            // Notificar apps sobre match criado
            this.broadcastToApps({
                type: 'match_created',
                matchId: matchId,
                blueTeam: blueTeam,
                redTeam: redTeam
            });

            // Limpar fila
            this.queue.clear();
            this.broadcastQueueUpdate();

            // Limpar canais após 2 horas
            setTimeout(() => {
                this.cleanupMatch(matchId);
            }, 2 * 60 * 60 * 1000);

        } catch (error) {
            console.error('❌ Erro ao criar match:', error);
        }
    }

    async movePlayersToChannels(blueTeam, blueChannel, redTeam, redChannel) {
        const guild = this.client.guilds.cache.first();
        
        for (const player of blueTeam) {
            const member = guild.members.cache.find(m => m.user.username === player.username);
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
            const member = guild.members.cache.find(m => m.user.username === player.username);
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

    async cleanupMatch(matchId) {
        const match = this.activeMatches.get(matchId);
        if (!match) return;

        const guild = this.client.guilds.cache.first();
        
        try {
            const blueChannel = guild.channels.cache.get(match.blueChannel);
            const redChannel = guild.channels.cache.get(match.redChannel);
            
            if (blueChannel) await blueChannel.delete();
            if (redChannel) await redChannel.delete();
            
            // Deletar categoria se vazia
            const category = blueChannel?.parent;
            if (category && category.children.cache.size === 0) {
                await category.delete();
            }

            this.activeMatches.delete(matchId);
            console.log(`🧹 Match ${matchId} limpo automaticamente`);
            
        } catch (error) {
            console.error(`❌ Erro ao limpar match ${matchId}:`, error);
        }
    }

    handleAppMessage(ws, message) {
        switch (message.type) {
            case 'get_discord_status':
                this.sendDiscordStatus(ws);
                break;
                
            case 'auto_link_lcu':
                this.autoLinkWithLCU(message.gameName, message.tagLine);
                break;
                
            case 'join_discord_queue':
                this.addToQueue(message.discordId, message.username, message.role);
                break;
                
            case 'leave_discord_queue':
                this.removeFromQueue(message.discordId);
                break;
        }
    }

    sendDiscordStatus(ws) {
        const guild = this.client.guilds.cache.first();
        if (!guild) return;

        const channel = guild.channels.cache.find(ch => ch.name === this.targetChannelName);
        const inChannel = channel && channel.members.has(ws.discordUserId);

        ws.send(JSON.stringify({
            type: 'discord_status',
            user: ws.discordUser,
            inChannel: inChannel
        }));
    }

    broadcastUserJoined(user) {
        this.broadcastToApps({
            type: 'user_joined_channel',
            userId: user.id,
            username: user.username
        });
    }

    broadcastUserLeft(user) {
        this.broadcastToApps({
            type: 'user_left_channel',
            userId: user.id,
            username: user.username
        });
    }

    broadcastQueueUpdate() {
        const queueData = {
            type: 'queue_update',
            queue: Array.from(this.queue.values()),
            size: this.queue.size
        };
        
        this.broadcastToApps(queueData);
    }

    broadcastToApps(data) {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }

    async registerSlashCommands() {
        const commands = [
            {
                name: 'queue',
                description: 'Ver status da fila atual'
            },
            {
                name: 'clear_queue',
                description: 'Limpar fila (apenas moderadores)'
            },
            {
                name: 'vincular',
                description: 'Vincule seu Discord ao seu nick do LoL',
                options: [
                    {
                        name: 'gamename',
                        type: 3, // STRING
                        description: 'Seu nick do LoL',
                        required: true
                    },
                    {
                        name: 'tagline',
                        type: 3, // STRING
                        description: 'Sua tagLine do LoL (ex: 1234)',
                        required: true
                    }
                ]
            },
            {
                name: 'online',
                description: 'Ver quem está online no canal de matchmaking'
            }
        ];

        const guild = this.client.guilds.cache.get('645775301149851658');
        if (!guild) {
            console.error('❌ Guild não encontrada! Verifique o ID.');
            return;
        }
        await guild.commands.set(commands);
        console.log('✅ Comandos slash registrados para a guild 645775301149851658');
    }

    async handleSlashCommand(interaction) {
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
                
            case 'vincular':
                const gameName = interaction.options.getString('gamename');
                const tagLine = interaction.options.getString('tagline');
                const discordId = interaction.user.id;
                
                this.saveLinkedNickname(discordId, gameName, tagLine);
                
                await interaction.reply({
                    content: `✅ Vinculado com sucesso: ${gameName}#${tagLine}`,
                    ephemeral: true
                });
                break;
                
            case 'online':
                this.updateDiscordUsersOnline();
                const onlineList = Array.from(this.discordUsersOnline.values())
                    .map(user => {
                        const status = user.hasAppOpen ? '📱' : '💻';
                        const nickname = user.linkedNickname ? 
                            ` (${user.linkedNickname.gameName}#${user.linkedNickname.tagLine})` : '';
                        return `${status} ${user.username}${nickname}`;
                    })
                    .join('\n') || 'Ninguém online';
                
                await interaction.reply({
                    content: `**👥 Usuários Online:**\n\`\`\`${onlineList}\`\`\``,
                    ephemeral: true
                });
                break;
        }
    }

    async start(token) {
        await this.client.login(token);
        
        // Aguardar bot ficar online
        await new Promise(resolve => {
            this.client.once('ready', resolve);
        });
        
        await this.registerSlashCommands();
        console.log('🤖 LoL Matchmaking Bot totalmente inicializado!');
    }
}

// Inicializar bot
const bot = new LoLMatchmakingBot();
bot.start(process.env.DISCORD_BOT_TOKEN || 'YOUR_TOKEN_HERE');

module.exports = LoLMatchmakingBot;
