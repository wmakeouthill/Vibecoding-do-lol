# League of Legends Matchmaking System

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-20+-green.svg)
![Angular](https://img.shields.io/badge/angular-18+-red.svg)
![Electron](https://img.shields.io/badge/electron-latest-blue.svg)
![TypeScript](https://img.shields.io/badge/typescript-5+-blue.svg)

## 📋 Visão Geral

Sistema de matchmaking avançado para League of Legends que oferece uma plataforma completa de partidas customizadas com MMR balanceado, integração profunda com a Riot API e criação automática de lobbies. Desenvolvido como aplicação desktop com tecnologias web modernas para proporcionar uma experiência de jogo otimizada e competitiva.

## 🎯 Objetivo do Projeto

O projeto tem como objetivo principal **criar um sistema de matchmaking personalizado e balanceado** para League of Legends, oferecendo uma alternativa ao sistema de filas ranqueadas oficial. Principais metas:

- **🎮 Matchmaking MMR-based**: Sistema próprio de MMR com algoritmo ELO avançado para partidas mais equilibradas
- **⚡ Experiência Seamless**: Integração automática com o cliente do LoL sem interromper o fluxo de jogo
- **📊 Analytics Avançados**: Estatísticas detalhadas e histórico de partidas para acompanhar o progresso
- **🏆 Sistema Competitivo**: Ranking e leaderboard próprios para criar uma comunidade competitiva
- **🔄 Automação Completa**: Desde detecção do jogador até criação automática de lobbies

## 🚀 Principais Funcionalidades

### 🎮 Sistema de Matchmaking 5v5
- **MMR dinâmico** com algoritmo ELO personalizado
- **Balanceamento automático de equipes** baseado em estatísticas detalhadas
- **Fila em tempo real** com comunicação WebSocket
- **Tempo estimado de espera** baseado em dados históricos da fila
- **Sistema de aceitação** com timeout e penalty para rejeições

### 🏆 Sistema de Ranking e Estatísticas
- **MMR inicial baseado no rank oficial** da Riot API
- **Cálculo dinâmico de MMR** baseado em resultados de partidas
- **Histórico completo de partidas** com analytics detalhados
- **Estatísticas do jogador**: winrate, MMR médio, tendências de performance
- **Sistema de leaderboard** para ranking competitivo da comunidade

### 🔗 Integração Profunda com League of Legends
- **Riot Games API**: Dados oficiais de jogadores e histórico de partidas
- **League Client API (LCU)**: Integração direta com o cliente do LoL
- **Auto-detecção de jogador**: Identifica automaticamente o jogador logado
- **Criação automática de lobbies**: Cria e convida jogadores automaticamente
- **Monitoramento de status**: Verifica disponibilidade dos jogadores
- **Detecção de partida ativa**: Monitora jogos em andamento
- **Sistema de auto-registro**: Registra jogadores automaticamente via LCU

### 💻 Aplicação Desktop Moderna
- **Electron cross-platform**: Disponível para Windows, macOS e Linux
- **Frontend Angular responsivo** com design moderno
- **Notificações em tempo real**: Alertas para partidas encontradas, lobbies criados, etc.
- **Integração com system tray**: Operação em segundo plano
- **Auto-updater**: Atualizações automáticas e seamless

## 🏗️ Arquitetura Técnica

### Stack Tecnológico
- **Backend**: Node.js + TypeScript + Express.js
- **Frontend**: Angular 18+ + TypeScript + SCSS
- **Desktop**: Electron (empacotamento multiplataforma)
- **Database**: SQLite (local) com DatabaseManager customizado
- **APIs**: Riot Games API + League Client API (LCU)
- **Comunicação**: WebSocket (real-time) + REST API

### Estrutura do Projeto
```
├── package.json                     # Root build configuration
├── README.md                        # This file
├── src/
│   ├── backend/                     # Node.js Express Server
│   │   ├── database/
│   │   │   └── DatabaseManager.ts   # SQLite database management
│   │   ├── services/
│   │   │   ├── MatchmakingService.ts # ELO-based matchmaking logic
│   │   │   ├── RiotAPIService.ts     # Riot Games API integration
│   │   │   ├── LCUService.ts         # League Client integration
│   │   │   └── PlayerService.ts      # Player data management
│   │   ├── server.ts                # Express server with WebSocket
│   │   └── tsconfig.json            # TypeScript configuration
│   ├── electron/                    # Electron Main Process
│   │   ├── main.ts                  # Main process and window management
│   │   ├── preload.ts               # Secure IPC bridge
│   │   └── tsconfig.json            # TypeScript configuration
│   └── frontend/                    # Angular Application
│       ├── angular.json             # Angular configuration
│       ├── src/app/
│       │   ├── app.ts               # Main application component
│       │   ├── app.html             # Main template
│       │   ├── app.scss             # Global styles
│       │   ├── interfaces.ts        # Shared TypeScript interfaces
│       │   ├── services/
│       │   │   ├── websocket.ts     # WebSocket service
│       │   │   └── api.ts           # HTTP API service
│       │   └── components/
│       │       ├── dashboard/       # Main dashboard
│       │       ├── queue/           # Queue management
│       │       └── match-history/   # Match history viewer
│       └── tsconfig.json            # TypeScript configuration
```

### System Workflow

1. **User Experience Flow:**
   ```
   Download .exe → Install app → Auto-detect your account → Auto-join queue → 
   Match found → Accept match → Auto-invite to lobby → Play game → 
   MMR updated → View match history
   ```

2. **Technical Flow:**
   ```
   Electron App → League Client detection → Auto-registration →
   WebSocket Connection → Backend Server → Matchmaking Service → 
   Riot API validation → LCU integration → Database updates → 
   Real-time notifications
   ```

3. **Matchmaking Algorithm:**
   ```
   Player joins queue → MMR calculation → Team balancing → 
   Match validation → Lobby creation → Player notifications → 
   Game session tracking → Post-game MMR adjustment
   ```

## 🛠️ Technology Stack

### Backend Technologies
- **Node.js** (v20+) - Runtime environment
- **Express.js** - Web framework with middleware support
- **TypeScript** - Type-safe development
- **WebSocket** - Real-time bidirectional communication
- **SQLite3** - Lightweight, serverless database
- **Axios** - HTTP client for external API calls
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing

### Frontend Technologies
- **Angular 18+** - Modern web framework
- **TypeScript** - Type-safe component development
- **SCSS** - Advanced CSS preprocessing
- **RxJS** - Reactive programming for async operations
- **Angular Router** - Single-page application navigation
- **FormsModule** - Reactive forms handling

### Desktop & Build Tools
- **Electron** - Cross-platform desktop application framework
- **Electron Builder** - Application packaging and distribution
- **ts-node** - TypeScript execution environment
- **Nodemon** - Development server with hot reload
- **Concurrently** - Run multiple npm scripts simultaneously

### External Integrations
- **Riot Games API** - Official League of Legends data
- **League Client (LCU) API** - Local client integration
- **WebSocket.io** - Enhanced WebSocket communication

## 🚀 Quick Start

### Prerequisites
- **Node.js** v20 or higher
- **npm** v8 or higher
- **League of Legends** client installed
- **Git** for version control

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/lol-matchmaking-system.git
   cd lol-matchmaking-system
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Configuration (Optional):**
   Create a `.env` file in the root directory:
   ```env
   RIOT_API_KEY=RGAPI-your-riot-api-key-here
   PORT=3000
   NODE_ENV=development
   ```

### Development

1. **Start development servers:**
   ```bash
   npm run dev
   ```
   This command starts:
   - Backend server on `http://localhost:3000`
   - Angular dev server on `http://localhost:4200`
   - Electron application

2. **Individual service startup:**
   ```bash
   # Backend only
   npm run dev:backend
   
   # Frontend only
   npm run dev:frontend
   
   # Electron only
   npm run electron:dev
   ```

### Building for Production

1. **Complete build:**
   ```bash
   npm run build
   ```

2. **Platform-specific distributions:**
   ```bash
   # Windows executable
   npm run dist:win
   
   # macOS application
   npm run dist:mac
   
   # Linux AppImage
   npm run dist:linux
   ```

## 📖 API Documentation

### WebSocket Events

#### Client → Server
- `join_queue` - Join matchmaking queue
- `leave_queue` - Leave current queue
- `accept_match` - Accept found match
- `decline_match` - Decline found match

#### Server → Client
- `queue_status` - Queue position and estimated time
- `match_found` - Match found notification
- `match_ready` - All players accepted
- `match_cancelled` - Match cancelled due to timeout/decline
- `lobby_created` - LCU lobby creation notification

### REST API Endpoints

#### 🎮 Player Management
```http
# Buscar jogador atual (LCU + Riot API integrado)
GET    /api/player/current-details           # Dados completos do jogador logado no LoL
Response: { success: true, data: { lcu: {...}, riotAccount: {...}, riotApi: {...} } }

# Atualizar dados do jogador por Riot ID
POST   /api/player/refresh-by-riot-id        # Atualiza dados via Riot ID
Body:  { "riotId": "gameName#tagLine", "region": "br1" }
Response: { success: true, data: {...}, message: "Dados atualizados" }

# Buscar jogador por ID
GET    /api/player/:playerId                 # Dados do jogador por ID interno
GET    /api/player/:playerId/stats           # Estatísticas detalhadas do jogador

# Buscar jogador por Riot ID (detalhado)
GET    /api/player/details/:riotId           # Dados via Riot ID (formato: gameName%23tagLine)
GET    /api/player/puuid/:puuid              # Dados via PUUID
```

#### 🏆 Matchmaking & Queue
```http
# Status da fila
GET    /api/queue/status                     # Status atual da fila de matchmaking
Response: { playersInQueue: 0, averageWaitTime: 0, estimatedMatchTime: 0 }

# Sistema de registro/busca
POST   /api/player/register                  # Registrar jogador
Body:  { "riotId": "gameName#tagLine", "region": "br1" }
POST   /api/player/search                    # Buscar jogadores
```

#### 📊 League Client Integration (LCU)
```http
# Status do cliente LoL
GET    /api/lcu/status                       # Status da conexão com o League Client
Response: { isConnected: true, summoner: {...}, gameflowPhase: "..." }

# Dados do summoner atual
GET    /api/lcu/current-summoner             # Dados do jogador logado no cliente
Response: { gameName: "...", tagLine: "...", puuid: "...", summonerLevel: 331 }

# Gestão de lobbies
POST   /api/lcu/create-lobby                 # Criar lobby customizado
POST   /api/lcu/invite-player               # Convidar jogador para lobby
Body:  { "summonerName": "playerName" }
```

#### 🔧 System & Configuration
```http
# Health check
GET    /api/health                           # Status do servidor
Response: { status: "ok", timestamp: "..." }

# Configuração da API Key
POST   /api/config/riot-api-key              # Configurar chave da Riot API
Body:  { "apiKey": "RGAPI-..." }
GET    /api/config/riot-api-key/validate     # Validar chave da API
```

#### 📈 Match History & Statistics
```http
# Histórico de partidas
GET    /api/matches/:playerId                # Histórico do jogador
GET    /api/matches/recent                   # Partidas recentes do sistema
POST   /api/matches                          # Registrar nova partida

# Estatísticas e rankings
GET    /api/stats/leaderboard                # Ranking dos melhores jogadores
GET    /api/stats/player/:id                 # Estatísticas detalhadas
```

### 🔄 WebSocket Events

#### Client → Server
```javascript
// Entrar na fila
{ type: 'join_queue', data: { playerId: 123, preferences: {...} } }

// Sair da fila
{ type: 'leave_queue' }

// Status da fila
{ type: 'get_queue_status' }

// Aceitar partida
{ type: 'accept_match', data: { matchId: "uuid" } }

// Rejeitar partida
{ type: 'decline_match', data: { matchId: "uuid" } }
```

#### Server → Client
```javascript
// Partida encontrada
{ type: 'match_found', data: { matchId: "uuid", players: [...], timeoutMs: 30000 } }

// Partida confirmada
{ type: 'match_ready', data: { matchId: "uuid", lobbyCode: "...", team1: [...], team2: [...] } }

// Partida cancelada
{ type: 'match_cancelled', data: { reason: "timeout", matchId: "uuid" } }

// Status da fila atualizado
{ type: 'queue_status', data: { playersInQueue: 5, averageWaitTime: 120 } }

// Lobby criado automaticamente
{ type: 'lobby_created', data: { success: true, invitesSent: 9 } }
```

### 🌐 Riot API Integration

O sistema utiliza a **nova implementação de Riot ID** conforme a documentação oficial:

#### Account API (Riot ID)
- **Endpoint**: `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
- **Uso**: Buscar dados da conta via `gameName#tagLine`
- **Roteamento**: Regional (americas, europe, asia, sea)

#### Summoner API (PUUID)
- **Endpoint**: `/lol/summoner/v4/summoners/by-puuid/{puuid}`
- **Uso**: Dados do summoner via PUUID obtido da Account API
- **Roteamento**: Específico da plataforma (br1, na1, euw1, etc.)

#### League API (Ranked Data)
- **Endpoint**: `/lol/league/v4/entries/by-summoner/{summonerId}`
- **Uso**: Dados ranqueados (solo queue, flex queue)
- **Retorna**: Tier, rank, LP, wins, losses

## 🔧 Configuration

### Backend Configuration
Edit `src/backend/server.ts` for:
- **Port settings** - Default: 3000
- **Database path** - Default: `./database.sqlite`
- **API rate limiting** - Adjustable per endpoint
- **WebSocket settings** - Connection limits and timeouts

### Frontend Configuration
Edit `src/frontend/src/environments/`:
- **API endpoints** - Backend server URL
- **WebSocket URL** - Real-time connection
- **Riot API settings** - Region and version
- **UI themes** - Color schemes and layouts

### Electron Configuration
Edit `src/electron/main.ts` for:
- **Window dimensions** - Size and position
- **System tray** - Enable/disable background operation
- **Auto-updater** - Update check intervals
- **Security settings** - CSP and node integration

## 🏗️ Deployment

### Backend Deployment (Cloud)

#### Option 1: Render.com (Recommended)
1. Connect GitHub repository
2. Set environment variables
3. Auto-deploy on push to main branch

#### Option 2: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway deploy
```

#### Option 3: Heroku
```bash
# Install Heroku CLI
heroku create your-app-name
heroku config:set NODE_ENV=production
git push heroku main
```

### Desktop Application Distribution

#### GitHub Releases
```bash
# Build and upload to releases
npm run build
npm run dist:all
# Upload generated files to GitHub releases
```

#### Auto-updater Setup
Configure in `package.json`:
```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "lol-matchmaking-system"
    }
  }
}
```

## 🧪 Testing

### Testes Automatizados
```bash
# Executar todos os testes
npm test

# Testes do backend
npm run test:backend

# Testes do frontend
npm run test:frontend

# Testes end-to-end
npm run test:e2e
```

### Testes de API (Manual)
```bash
# Teste do endpoint principal
curl -X GET http://localhost:3000/api/player/current-details

# Teste de refresh por Riot ID  
curl -X POST "http://localhost:3000/api/player/refresh-by-riot-id" \
  -H "Content-Type: application/json" \
  -d '{"riotId": "gameName#tagLine", "region": "br1"}'

# Status do sistema
curl -X GET http://localhost:3000/api/health
curl -X GET http://localhost:3000/api/lcu/status
```

### Checklist de Testes Manuais
- [ ] ✅ Registro automático de jogador via LCU
- [ ] ✅ Busca de dados via Riot ID funcional
- [ ] ✅ Entrada e saída da fila de matchmaking
- [ ] ✅ Algoritmo de matchmaking com diferentes MMRs
- [ ] ✅ Comunicação WebSocket em tempo real
- [ ] ✅ Integração LCU e criação automática de lobbies
- [ ] ✅ Cálculo correto de MMR pós-partida
- [ ] ✅ Precisão do histórico de partidas
- [ ] ✅ Empacotamento da aplicação Electron

## 🐛 Troubleshooting

### Problemas Comuns

#### 1. 🔴 LCU Connection Failed
**Problema**: `Cliente do LoL não conectado`
```bash
# Soluções:
1. Verificar se o League of Legends está rodando
2. Confirmar porta LCU (geralmente 2999)
3. Verificar certificado LCU no processo LeagueClientUx.exe
4. Reiniciar o cliente do LoL
```

#### 2. 🔴 WebSocket Connection Issues  
**Problema**: Desconexões frequentes ou falha na conexão
```bash
# Soluções:
1. Verificar configurações de firewall
2. Confirmar que o servidor backend está rodando na porta 3000
3. Testar conectividade de rede
4. Verificar se não há conflitos de porta
```

#### 3. 🔴 Riot API Errors
**Problema**: `403 Forbidden` ou `404 Not Found`
```bash
# Soluções:
1. Verificar se a chave da API está válida
2. Confirmar que o Riot ID está no formato correto (gameName#tagLine)
3. Verificar se a região está correta (br1, na1, euw1, etc.)
4. Aguardar rate limits se necessário
```

#### 4. 🔴 Player Not Found
**Problema**: `Jogador não encontrado`
```bash
# Soluções:
1. Verificar se o jogador existe na região especificada
2. Confirmar que o Riot ID está escrito corretamente
3. Verificar se o jogador tem partidas ranqueadas
4. Testar com outros Riot IDs conhecidos
```

## 📚 Documentação Adicional

- **[Implementação Riot ID](./RIOT_ID_IMPLEMENTATION.md)** - Detalhes técnicos da integração com Riot API
- **[Arquitetura Técnica](./TECHNICAL_ARCHITECTURE.md)** - Visão completa da arquitetura do sistema
- **[Endpoints API](./RIOT_ID_IMPLEMENTATION.md#endpoints-funcionais-do-backend)** - Documentação completa das APIs

## 🤝 Contribuição

### Como Contribuir
1. **Fork** o repositório
2. **Crie** uma branch para sua feature (`git checkout -b feature/amazing-feature`)
3. **Commit** suas mudanças (`git commit -m 'Add amazing feature'`)
4. **Push** para a branch (`git push origin feature/amazing-feature`)
5. **Abra** um Pull Request

### Diretrizes de Desenvolvimento
- ✅ **TypeScript**: Use tipagem estrita
- ✅ **ESLint**: Siga as regras de linting
- ✅ **Commits**: Use mensagens descritivas
- ✅ **Testes**: Adicione testes para novas funcionalidades
- ✅ **Documentação**: Atualize documentação relevante

## 📄 Licença

Este projeto está licenciado sob a **MIT License** - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 👥 Autores

- **Wesley Augusto** - *Desenvolvimento inicial* - [@wcaco](https://github.com/wcaco)

## 🙏 Agradecimentos

- **Riot Games** - Pela API oficial do League of Legends
- **Comunidade Open Source** - Pelas bibliotecas e ferramentas utilizadas
- **Electron Team** - Pela plataforma de desenvolvimento desktop
- **Angular Team** - Pelo framework frontend moderno

## 📊 Status do Projeto

- ✅ **Backend**: Funcional e testado
- ✅ **Frontend**: Interface completa
- ✅ **Integração Riot API**: Implementada com Riot ID
- ✅ **Integração LCU**: Conexão automática
- ✅ **Sistema de Matchmaking**: Algoritmo balanceado
- ✅ **Aplicação Desktop**: Build para múltiplas plataformas
- 🔄 **Match History API**: Em desenvolvimento
- 🔄 **Advanced Statistics**: Planejado
- 🔄 **Tournament System**: Futuro

---

**Desenvolvido com ❤️ para a comunidade League of Legends**

#### 3. Riot API Rate Limiting
```bash
# Implement request queuing
# Add retry logic with exponential backoff
# Monitor API usage in logs
```

#### 4. Electron Build Failures
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Check platform-specific dependencies
npm run rebuild
```

## 🔒 Security Considerations

### Data Protection
- **No password storage** - Uses Riot Games authentication
- **Encrypted communications** - HTTPS and WSS in production
- **Input validation** - All user inputs sanitized
- **Rate limiting** - API endpoints protected against abuse

### Privacy
- **Minimal data collection** - Only game-related statistics
- **Local database** - Sensitive data stored locally when possible
- **GDPR compliance** - User data deletion capabilities
- **Anonymization** - Personal identifiers removed from logs

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the coding standards
4. Write tests for new functionality
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Coding Standards
- **TypeScript strict mode** enabled
- **ESLint** for code linting
- **Prettier** for code formatting
- **Conventional commits** for commit messages
- **Comprehensive documentation** for new features

### Pull Request Process
1. Ensure all tests pass
2. Update documentation as needed
3. Add yourself to contributors list
4. Request review from maintainers
5. Address feedback promptly

## 📋 Roadmap

### Phase 1: Core Features ✅
- [x] Basic matchmaking system
- [x] Riot API integration
- [x] LCU integration
- [x] Desktop application
- [x] Real-time communication

### Phase 2: Enhanced Features 🚧
- [ ] Advanced statistics and analytics
- [ ] Tournament system
- [ ] Custom game modes
- [ ] Social features (friends, chat)
- [ ] Mobile companion app

### Phase 3: Advanced Features 📋
- [ ] Machine learning matchmaking
- [ ] Esports integration
- [ ] Streaming overlay
- [ ] Discord bot integration
- [ ] API for third-party developers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

### Getting Help
- **GitHub Issues** - Bug reports and feature requests
- **Discord Server** - Community support and discussions
- **Documentation** - Comprehensive guides and API reference
- **Email Support** - Direct contact for urgent issues

### Community
- **Discord**: [Join our community](https://discord.gg/your-invite)
- **Reddit**: [r/CustomLoLMatchmaking](https://reddit.com/r/your-subreddit)
- **Twitter**: [@LoLMatchmaking](https://twitter.com/your-handle)

---

## 🎉 Acknowledgments

- **Riot Games** for providing the League of Legends API
- **Angular Team** for the excellent frontend framework
- **Electron Team** for making desktop development accessible
- **Open Source Community** for the amazing tools and libraries

**Built with ❤️ for the League of Legends community**
