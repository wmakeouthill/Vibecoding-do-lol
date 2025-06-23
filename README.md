# League of Legends Matchmaking System

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

### 🎮 Sistema de Matchmaking 5v5 Avançado - IMPLEMENTADO ✅
- **Sistema de Fila em Tempo Real**: Comunicação WebSocket bidirecional para atualizações instantâneas
- **Seleção de Lanes**: Escolha de lane primária e secundária (Topo, Selva, Meio, Atirador, Suporte)
- **MMR dinâmico** com algoritmo ELO personalizado baseado no rank oficial da Riot
- **Balanceamento automático de equipes** por MMR e preferências de lane
- **Atividades da Fila em Tempo Real**: Histórico detalhado das últimas 20 atividades com timestamps
- **Lista de Jogadores na Fila**: Visualização em tempo real dos jogadores (posição, MMR, lanes preferidas)
- **Contador de Jogadores**: Sistema "X/10 jogadores" com atualização instantânea
- **Tempo estimado de espera** baseado em dados históricos e número de jogadores na fila
- **Sistema de aceitação** com timeout e penalty para rejeições

## 📊 Status de Implementação

### ✅ Funcionalidades Totalmente Implementadas
- ✅ **Sistema de Fila Completo**: WebSocket, MMR, balanceamento, atividades em tempo real
- ✅ **Interface de Matchmaking**: Dashboard, seleção de lanes, lista de jogadores
- ✅ **Sistema de Draft**: Modal match found, preview de times, sistema de liderança
- ✅ **Pick & Ban Profissional**: Interface completa estilo LoL com timer e grid de campeões
- ✅ **Sistema de Liderança**: Validação anti-bot, transferência, interface de controle
- ✅ **Notificações em Tempo Real**: Sistema completo de feedback visual
- ✅ **Auto-accept para Bots**: Facilita testes e desenvolvimento
- ✅ **Integração LCU Básica**: Detecção de jogador, dados básicos
- ✅ **Base de Dados**: SQLite com DatabaseManager e sistema de players
- ✅ **APIs REST**: Endpoints para player management e queue status

### 🔨 Funcionalidades Parcialmente Implementadas
- 🔨 **Integração Riot API**: Base implementada, precisa de expansão para match history
- 🔨 **Sistema de MMR**: Cálculo básico implementado, precisa de refinamento
- 🔨 **WebSocket Sync**: Local implementado, precisa de sincronização multi-cliente real

### 📋 Funcionalidades Planejadas (Próximas Fases)
- 📋 **Criação Automática de Lobbies**: Após draft completado
- 📋 **Histórico de Partidas**: Tracking completo e analytics
- 📋 **Sistema de Ranking**: Leaderboard e progressão
- 📋 **Integração Riot API Completa**: Match history e dados oficiais
- 📋 **Timer de Draft Sincronizado**: Sincronização entre todos os clientes
- 📋 **Sistema P2P**: Para salas privadas e torneios
- 📋 **Interface Móvel**: Responsividade completa

### ⚔️ Sistema de Draft Completo (Pick & Ban) - IMPLEMENTADO ✅
- **Modal de Partida Encontrada**: Interface moderna para aceitar/recusar partidas com timer de 30 segundos
- **Preview dos Times**: Visualização detalhada dos jogadores de ambos os times antes do draft
- **Sistema de Liderança Inteligente**:
  - Bots NUNCA podem ser líderes (validação automática)
  - Primeiro jogador humano do time azul é automaticamente líder
  - Interface exclusiva para transferir liderança entre jogadores humanos
  - Validação robusta contra transferência para bots
  - Painel de controle de liderança com lista de jogadores elegíveis
- **Pick & Ban Estilo LoL Completo**:
  - Interface profissional com timer de draft (30 segundos por turno)
  - Grid completo de campeões selecionáveis com imagens
  - Sistema de turnos automático seguindo regras oficiais do LoL
  - Diferenciação visual clara entre fases de ban e pick
  - Feedback visual dinâmico para jogador atual
  - Campeões banidos/escolhidos são removidos automaticamente da seleção
  - Indicação clara de qual equipe está atuando
  - Interface responsiva e intuitiva
- **Auto-accept para Bots**: Bots aceitam partidas automaticamente para facilitar testes
- **Notificações em Tempo Real**: Sistema completo de feedback para todas as ações
- **Estado Persistente**: Draft mantém estado durante reconexões

### 🔄 Sistema de Fila Inteligente
- **Auto-detecção de desconexão**: Reconexão automática via WebSocket
- **Persistência de estado**: Mantém posição na fila durante reconexões
- **Broadcast inteligente**: Atualizações enviadas para todos os clientes conectados
- **Sistema de heartbeat**: Monitoramento de conexão em tempo real
- **Queue timeout**: Remoção automática de jogadores inativos

### 🏆 Sistema de Ranking e Estatísticas
- **MMR inicial baseado no rank oficial** da Riot API (Solo Queue e Flex Queue)
- **Cálculo dinâmico de MMR** baseado em resultados de partidas customizadas
- **Histórico completo de partidas** com analytics detalhados
- **Estatísticas do jogador**: winrate, MMR médio, tendências de performance
- **Sistema de leaderboard** para ranking competitivo da comunidade
- **Tracking de preferências**: Análise de performance por lane

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

### 📊 Interface e Experiência do Usuário - IMPLEMENTADO ✅
- **Dashboard em Tempo Real**: Status do sistema, estatísticas do jogador e fila atual
- **Sistema de Notificações Avançado**: Alertas visuais com tipos (success, info, warning, error) para partidas encontradas, lobbies criados, etc.
- **Seletor de Lanes Visual**: Interface intuitiva para escolha de posições primárias e secundárias
- **Atividades Recentes**: Feed em tempo real com histórico das últimas 20 ações da fila
- **Lista de Jogadores**: Visualização de todos os jogadores na fila com suas informações detalhadas
- **Indicadores de Status**: Conexão LCU, status da fila, tempo de espera em tempo real
- **Modal de Match Found Avançado**: Interface moderna para aceitar/declinar partidas com timer visual
- **Tela de Draft Preview Completa**: Visualização dos times com sistema de liderança integrado
- **Interface de Pick & Ban Profissional**: Sistema completo de seleção de campeões estilo LoL
- **Grid de Campeões Interativo**: Seleção visual com imagens, filtragem automática e estado dinâmico
- **Controles de Liderança Avançados**: Painel exclusivo para líderes transferirem responsabilidade com validação
- **Design Responsivo Moderno**: Interface adaptável com tema dark otimizado
- **Animações Suaves e Feedback**: Feedback visual para todas as interações com transições profissionais
- **Sistema de Estados Visuais**: Indicação clara de estado atual (fila, match found, draft preview, pick & ban)
- **Gerenciamento de Erro Integrado**: Tratamento visual de erros com notificações contextuais

## 🏗️ Arquitetura Técnica Detalhada

### Stack Tecnológico Completo
- **Backend**: Node.js 20+ + TypeScript 5+ + Express.js + WebSocket
- **Frontend**: Angular 18+ + TypeScript + SCSS + RxJS
- **Desktop**: Electron (multi-plataforma) com preload scripts seguros
- **Database**: SQLite3 com DatabaseManager customizado e migrations
- **APIs Externas**: Riot Games API v4/v5 + League Client API (LCU)
- **Comunicação**: WebSocket (tempo real) + REST API + Server-Sent Events
- **Build Tools**: Angular CLI + TypeScript Compiler + Electron Builder
- **Dev Tools**: Nodemon + Concurrently + Hot Reload

### Arquitetura de Serviços

#### Backend Services (Modular)
```typescript
├── MatchmakingService.ts        # Core do sistema de fila e matchmaking
│   ├── Queue Management         # Gerenciamento da fila em tempo real
│   ├── Activity Tracking        # Sistema de atividades recentes (max 20)
│   ├── Player Balancing         # Algoritmo de balanceamento por MMR
│   ├── WebSocket Broadcasting   # Broadcast para todos os clientes
│   └── Match Creation           # Criação e validação de partidas
│
├── RiotAPIService.ts           # Integração com Riot Games API
│   ├── Account API (Riot ID)    # Busca por gameName#tagLine
│   ├── Summoner API (PUUID)     # Dados do summoner via PUUID
│   ├── League API (Ranked)      # Dados ranqueados (SoloQ/Flex)
│   ├── Match API (History)      # Histórico de partidas oficiais
│   └── Rate Limiting            # Controle de taxa de requisições
│
├── LCUService.ts               # League Client Integration
│   ├── Auto-Detection           # Detecção automática do cliente LoL
│   ├── Current Summoner         # Dados do jogador logado
│   ├── Lobby Management         # Criação e convites automáticos
│   ├── Game State Monitoring    # Status do jogo (lobby, partida, etc.)
│   └── SSL Certificate Handling # Conexão segura com LCU
│
├── PlayerService.ts            # Gerenciamento de dados dos jogadores
│   ├── Player Registration      # Registro automático via LCU
│   ├── Data Synchronization     # Sync entre LCU e Riot API
│   ├── MMR Calculation         # Cálculo de MMR customizado
│   ├── Statistics Tracking      # Estatísticas e histórico
│   └── Profile Management      # Gestão de perfis de jogador
│
└── DatabaseManager.ts          # Gestão de dados SQLite
    ├── Schema Management        # Criação e migração de tabelas
    ├── Query Builder           # Queries otimizadas e type-safe
    ├── Connection Pooling      # Pool de conexões para performance
    ├── Data Validation         # Validação de integridade
    └── Backup & Recovery       # Sistema de backup automático
```

#### Frontend Architecture (Component-Based)
```typescript
├── Core App Component          # Container principal da aplicação
│   ├── WebSocket Management    # Conexão persistente com backend
│   ├── State Management       # Estado global da aplicação
│   ├── Notification System    # Sistema de notificações em tempo real
│   └── Route Management       # Navegação entre telas
│
├── Dashboard Component         # Tela principal
│   ├── Player Info Card       # Dados do jogador atual
│   ├── System Status          # Status LCU e servidor
│   ├── Quick Actions          # Ações rápidas (entrar/sair fila)
│   └── Recent Matches         # Histórico de partidas recentes
│
├── Queue Component            # Sistema de fila avançado
│   ├── Queue Status Display   # "X/10 jogadores" em tempo real
│   ├── Players List          # Lista de jogadores na fila
│   │   ├── Player Position    # Posição numerada na fila
│   │   ├── Player Info        # Nome, tag, MMR
│   │   └── Lane Preferences   # Lanes primária e secundária
│   ├── Recent Activities     # Feed de atividades (scrollable)
│   │   ├── Activity Feed      # Últimas 20 atividades
│   │   ├── Timestamp Display  # "há X min", "agora"
│   │   └── Activity Types     # Join, leave, match created, etc.
│   ├── Queue Timer           # Tempo na fila
│   └── Lane Selector Modal   # Seleção de posições
│
├── Lane Selector Component    # Seletor de lanes visual
│   ├── Lane Grid Display     # Grid com 5 posições
│   ├── Lane Icons & Names    # Ícones e nomes das lanes
│   ├── Primary/Secondary     # Seleção de lane primária/secundária
│   ├── Validation Logic      # Validação de seleções
│   └── Auto-Accept Option    # Opção de aceitar partidas automaticamente
│
└── Match History Component    # Histórico de partidas
    ├── Match List Display     # Lista de partidas com paginação
    ├── Match Details Modal    # Detalhes expandidos da partida
    ├── Statistics Overview    # Estatísticas resumidas
    └── Performance Charts     # Gráficos de performance
```

### Fluxo de Dados em Tempo Real

#### WebSocket Events (Bidirectional)
```typescript
// Cliente → Servidor
interface ClientToServerEvents {
  'join_queue': {
    player: PlayerData;
    preferences: {
      primaryLane: 'top' | 'jungle' | 'mid' | 'bot' | 'support';
      secondaryLane: 'top' | 'jungle' | 'mid' | 'bot' | 'support';
      autoAccept?: boolean;
    };
  };
  'leave_queue': {};
  'get_queue_status': {};
  'accept_match': { matchId: string };
  'decline_match': { matchId: string };
}

// Servidor → Cliente
interface ServerToClientEvents {
  'queue_update': {
    playersInQueue: number;
    averageWaitTime: number;
    estimatedMatchTime: number;
    isActive: boolean;
    playersInQueueList: QueuedPlayerInfo[];
    recentActivities: QueueActivity[];
  };
  'queue_joined': { position: number; estimatedWait: number };
  'match_found': { matchId: string; players: Player[]; timeoutMs: number };
  'match_ready': { matchId: string; team1: Player[]; team2: Player[] };
  'lobby_created': { success: boolean; invitesSent: number };
}
```

#### Sistema de Atividades da Fila
```typescript
interface QueueActivity {
  id: string;                    // UUID único
  timestamp: Date;               // Timestamp da atividade
  type: 'player_joined' |        // Jogador entrou na fila
        'player_left' |          // Jogador saiu da fila
        'match_created' |        // Partida foi criada
        'system_update' |        // Atualização do sistema
        'queue_cleared';         // Fila foi limpa
  message: string;               // Mensagem formatada para exibição
  playerName?: string;           // Nome do jogador (se aplicável)
  playerTag?: string;            // Tag do jogador (se aplicável)
  lane?: string;                 // Lane selecionada (se aplicável)
}

// Exemplo de atividades geradas:
// "popcorn seller#coup entrou na fila como Atirador"
// "SummonerName saiu da fila" 
// "Partida criada com 10 jogadores"
// "Sistema de matchmaking otimizado"
```

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

#### � Queue Management & Real-time Features
```http
# Status da fila em tempo real
GET    /api/queue/status                     # Status completo da fila
Response: {
  playersInQueue: 3,
  averageWaitTime: 120,
  estimatedMatchTime: 180,
  isActive: true,
  playersInQueueList: [
    {
      summonerName: "PlayerName",
      tagLine: "TAG",
      primaryLane: "bot",
      secondaryLane: "mid", 
      mmr: 1250,
      queuePosition: 1,
      joinTime: "2025-06-17T..."
    }
  ],
  recentActivities: [
    {
      id: "uuid",
      timestamp: "2025-06-17T...",
      type: "player_joined",
      message: "PlayerName#TAG entrou na fila como Atirador",
      playerName: "PlayerName",
      playerTag: "TAG",
      lane: "bot"
    }
  ]
}

# Entrar na fila (via WebSocket)
WS     join_queue
Data:  {
  player: { summonerName: "...", mmr: 1200, ... },
  preferences: { primaryLane: "bot", secondaryLane: "mid", autoAccept: false }
}

# Sair da fila (via WebSocket) 
WS     leave_queue
Data:  {}

# Updates em tempo real (Server → Client)
WS     queue_update                          # Broadcast para todos os clientes
Data:  { playersInQueue: 2, playersInQueueList: [...], recentActivities: [...] }
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

### 🔄 WebSocket Events (Real-time Communication)

#### Client → Server Events
```javascript
// Entrar na fila com seleção de lanes
{
  type: 'join_queue',
  data: {
    player: {
      summonerName: "PlayerName",
      tagLine: "TAG", 
      mmr: 1250,
      region: "br1"
    },
    preferences: {
      primaryLane: "bot",      // Atirador (ADC)
      secondaryLane: "mid",    // Meio
      autoAccept: false        // Aceitar partidas automaticamente
    }
  }
}

// Sair da fila
{ type: 'leave_queue' }

// Solicitar status atual da fila
{ type: 'get_queue_status' }

// Aceitar partida encontrada
{ 
  type: 'accept_match', 
  data: { matchId: "uuid-da-partida" } 
}

// Rejeitar partida encontrada
{ 
  type: 'decline_match', 
  data: { matchId: "uuid-da-partida", reason: "not_ready" } 
}
```

#### Server → Client Events
```javascript
// Atualização da fila em tempo real (broadcast para todos)
{
  type: 'queue_update',
  data: {
    playersInQueue: 3,
    averageWaitTime: 120,
    estimatedMatchTime: 180,
    isActive: true,
    playersInQueueList: [
      {
        summonerName: "Player1",
        tagLine: "TAG1",
        primaryLane: "bot",
        secondaryLane: "mid",
        mmr: 1250,
        queuePosition: 1,
        joinTime: "2025-06-17T10:30:00Z"
      }
    ],
    recentActivities: [
      {
        id: "activity-uuid-1",
        timestamp: "2025-06-17T10:30:15Z",
        type: "player_joined",
        message: "Player1#TAG1 entrou na fila como Atirador",
        playerName: "Player1",
        playerTag: "TAG1", 
        lane: "bot"
      },
      {
        id: "activity-uuid-2", 
        timestamp: "2025-06-17T10:29:45Z",
        type: "player_left",
        message: "Player2 saiu da fila"
      }
    ]
  }
}

// Confirmação de entrada na fila
{
  type: 'queue_joined',
  data: {
    position: 3,
    estimatedWait: 180,
    queueStatus: { playersInQueue: 3, ... }
  }
}

// Partida encontrada (aguardando aceitação)
{
  type: 'match_found',
  data: {
    matchId: "match-uuid",
    players: [/* 10 jogadores */],
    team1: [/* 5 jogadores time 1 */],
    team2: [/* 5 jogadores time 2 */],
    acceptTimeoutMs: 30000,
    acceptedPlayers: [],
    missingAccepts: 10
  }
}

// Partida confirmada (todos aceitaram)
{
  type: 'match_ready',
  data: {
    matchId: "match-uuid", 
    lobbyCode: "LOBBY123",
    team1: [/* balanceado por MMR */],
    team2: [/* balanceado por MMR */],
    averageMMR1: 1245,
    averageMMR2: 1238
  }
}

// Partida cancelada
{
  type: 'match_cancelled',
  data: {
    reason: "timeout" | "player_declined" | "insufficient_players",
    matchId: "match-uuid",
    declinedBy: "PlayerName" // se aplicável
  }
}

// Lobby criado automaticamente no LoL
{
  type: 'lobby_created',
  data: {
    success: true,
    lobbyCode: "LOBBY123",
    invitesSent: 9,
    failedInvites: [],
    message: "Lobby criado! Convites enviados para 9 jogadores."
  }
}
```

#### Activity Types & Messages
```typescript
// Tipos de atividades automaticamente geradas
enum ActivityType {
  PLAYER_JOINED = 'player_joined',    // "PlayerName#TAG entrou na fila como Atirador"
  PLAYER_LEFT = 'player_left',        // "PlayerName saiu da fila"  
  MATCH_CREATED = 'match_created',    // "Partida criada com 10 jogadores"
  MATCH_CANCELLED = 'match_cancelled', // "Partida cancelada (timeout)"
  SYSTEM_UPDATE = 'system_update',    // "Sistema de matchmaking otimizado"
  QUEUE_CLEARED = 'queue_cleared'     // "Fila limpa pelo administrador"
}

// Sistema mantém até 20 atividades recentes
// Interface scrollable no frontend
// Timestamps formatados automaticamente ("há 2 min", "agora")
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

### Checklist de Testes Manuais Detalhado
- [ ] ✅ **Detecção Automática LCU**: Conecta automaticamente ao League of Legends
- [ ] ✅ **Registro via LCU**: Registra jogador automaticamente via dados do cliente
- [ ] ✅ **Busca Riot ID**: Funcionalidade de refresh por gameName#tagLine
- [ ] ✅ **Seleção de Lanes**: Interface de seleção primária/secundária funcional
- [ ] ✅ **Entrada na Fila**: Sistema de join com broadcast em tempo real
- [ ] ✅ **Contador em Tempo Real**: "X/10 jogadores" atualiza instantaneamente
- [ ] ✅ **Lista de Jogadores**: Mostra jogadores, MMR e lanes em tempo real
- [ ] ✅ **Atividades da Fila**: Feed com últimas 20 atividades e timestamps
- [ ] ✅ **Saída da Fila**: Leave com atualização imediata do contador
- [ ] ✅ **WebSocket Reconnection**: Reconexão automática em caso de desconexão
- [ ] ✅ **Matchmaking Algorithm**: Balanceamento por MMR e preferências
- [ ] ✅ **Integração LCU**: Criação automática de lobbies e convites
- [ ] ✅ **Cálculo de MMR**: Atualização correta após partidas
- [ ] ✅ **Histórico de Partidas**: Armazenamento e visualização de dados
- [ ] ✅ **Build Electron**: Empacotamento para Windows/Mac/Linux
- [ ] ✅ **Performance**: Sistema suporta múltiplos jogadores simultâneos
- [ ] ✅ **Error Handling**: Tratamento de erros de API e conexão
- [ ] ✅ **Security**: Validação de inputs e proteção contra exploits

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
- **[Endpoints LCU](./RIOT_ID_IMPLEMENTATION.md#endpoints-funcionais-do-backend)** - Documentação completa do LCU
- **[Endpoints Backend](./RIOT_ID_IMPLEMENTATION.md#endpoints-funcionais-do-backend)** - Documentação completa do Backend
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

### Performance e Otimizações

#### Backend Optimizations
- **Connection Pooling**: Pool de conexões WebSocket para alta concorrência
- **Rate Limiting**: Proteção contra abuse com limits específicos por endpoint
- **Caching Strategy**: Cache de dados da Riot API para reduzir latência
- **Database Indexing**: Índices otimizados para queries frequentes
- **Memory Management**: Gestão eficiente de memória para longa execução
- **Error Recovery**: Sistema robusto de recuperação de erros

#### Frontend Optimizations  
- **Lazy Loading**: Carregamento sob demanda de componentes
- **Change Detection**: OnPush strategy para performance otimizada
- **Bundle Optimization**: Tree shaking e code splitting
- **Memory Leaks Prevention**: Unsubscribe automático de observables
- **Virtual Scrolling**: Para listas grandes (match history)
- **Service Workers**: Cache de assets estáticos

#### Real-time Optimizations
- **WebSocket Reconnection**: Reconexão automática com backoff exponencial
- **State Synchronization**: Sincronização de estado entre cliente e servidor
- **Broadcast Optimization**: Envio inteligente apenas para clientes interessados
- **Queue State Management**: Estado da fila otimizado para updates frequentes
- **Activity Batching**: Agrupamento de atividades para reduzir traffic

### Segurança e Confiabilidade

#### Data Security
- **Input Validation**: Validação rigorosa de todos os inputs
- **SQL Injection Prevention**: Queries parametrizadas e ORM
- **XSS Protection**: Sanitização de dados no frontend
- **CORS Configuration**: Configuração segura de cross-origin
- **Rate Limiting**: Proteção contra ataques DDoS
- **SSL/TLS**: Comunicação criptografada em produção

#### Error Handling
- **Graceful Degradation**: Funcionamento parcial em caso de falhas
- **Circuit Breaker**: Proteção contra cascading failures
- **Retry Logic**: Tentativas automáticas com backoff
- **Logging Strategy**: Logs estruturados para debugging
- **Health Checks**: Monitoramento contínuo de saúde do sistema
- **Failover Mechanisms**: Sistemas de backup automático

## 🔗 Sistema Peer-to-Peer (P2P)

### Nova Funcionalidade: Matchmaking Descentralizado

O projeto agora inclui um **sistema revolucionário de conexão P2P** que permite aos jogadores se conectarem diretamente uns aos outros, criando uma rede descentralizada para matchmaking sem depender de servidor central.

#### 🌟 Principais Características P2P:

- **🔗 Conexões Diretas**: Jogadores se conectam diretamente via WebRTC
- **📡 Descoberta Automática**: Encontra outros jogadores na rede local e internet
- **⚖️ Fila Distribuída**: Sistema de fila sincronizado entre todos os peers
- **🤝 Algoritmo de Consenso**: Decisões de matchmaking tomadas coletivamente
- **🏆 Resistência a Falhas**: Sistema continua funcionando mesmo com peers desconectados
- **🚀 Escalabilidade**: Performance melhora com mais usuários conectados

#### 🛠️ Implementação Técnica:

```typescript
// P2P Manager - Gerenciamento de conexões WebRTC
P2PManager {
  - WebRTC Peer Connections
  - Data Channels para comunicação
  - Descoberta de peers (local + internet)
  - Sistema de heartbeat
  - Reconexão automática
}

// Distributed Queue - Fila sincronizada
DistributedQueueService {
  - Sincronização de estado entre peers
  - Algoritmo de consenso para matches
  - Eleição de líder para coordenação
  - Balanceamento distribuído de equipes
}
```

#### 📊 Interface P2P:

- **Status da Rede**: Peers conectados e status de conexão
- **Fila Distribuída**: Posição, tempo de espera, estatísticas
- **Métricas da Rede**: MMR médio, distribuição por lane
- **Controles**: Entrar/sair da fila P2P, conectar à rede

#### 🎯 Benefícios:

✅ **Zero Custos de Servidor**: Não precisa manter infraestrutura central  
✅ **Latência Reduzida**: Conexões diretas entre jogadores  
✅ **Alta Disponibilidade**: Sistema distribuído resistente a falhas  
✅ **Transparência**: Algoritmos abertos e verificáveis  
✅ **Escalabilidade**: Capacidade cresce com número de usuários  
✅ **Personalização**: Comunidade pode ajustar algoritmos  

#### 📁 Arquivos P2P:

```
src/frontend/src/app/
├── services/
│   ├── p2p-manager.ts           # Gerenciador de conexões P2P
│   └── distributed-queue.ts     # Serviço de fila distribuída
└── components/
    └── p2p-status/
        └── p2p-status.ts        # Interface de status P2P
```

#### 📚 Documentação P2P:

- [`P2P_IMPLEMENTATION_PLAN.md`](./P2P_IMPLEMENTATION_PLAN.md) - Plano técnico de implementação
- [`P2P_USER_GUIDE.md`](./P2P_USER_GUIDE.md) - Guia do usuário para sistema P2P

---
