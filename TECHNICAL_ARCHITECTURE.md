# Arquitetura Técnica - LoL Matchmaking System

## 📋 Visão Geral da Arquitetura

O sistema foi projetado com uma arquitetura modular e escalável, separando responsabilidades entre backend, frontend e integração com APIs externas.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │  External APIs  │
│   (Angular)     │    │   (Node.js)     │    │                 │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • UI Components │◄──►│ • REST APIs     │◄──►│ • Riot Games    │
│ • State Mgmt    │    │ • WebSocket     │    │ • LCU (Local)   │
│ • Services      │    │ • Business Logic│    │ • Database      │
│ • WebSocket     │    │ • Data Layer    │    │   (SQLite)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │
        └────────────────────────┘
                Electron Container
```

## 🏗️ Estrutura de Diretórios

```
/src
├── backend/                    # Servidor Node.js + TypeScript
│   ├── server.ts              # Ponto de entrada e configuração de rotas
│   ├── database/              # Camada de dados
│   │   └── DatabaseManager.ts # Gerenciamento SQLite
│   └── services/              # Lógica de negócio
│       ├── RiotAPIService.ts  # Integração Riot Games API
│       ├── LCUService.ts      # Integração League Client
│       ├── PlayerService.ts   # Gerenciamento de jogadores
│       ├── MatchmakingService.ts # Sistema de filas e matching
│       └── MatchHistoryService.ts # Histórico e estatísticas
├── frontend/                   # Aplicação Angular
│   └── src/app/
│       ├── components/        # Componentes UI
│       ├── services/          # Serviços e integrações
│       └── interfaces.ts      # Definições de tipos TypeScript
└── electron/                   # Configuração desktop
    ├── main.ts                # Processo principal Electron
    └── preload.ts             # Scripts de segurança
```

## 🔧 Camada Backend

### Servidor Principal (`server.ts`)
- **Framework**: Express.js com TypeScript
- **Middleware**: CORS, Helmet (segurança), Rate Limiting
- **WebSocket**: Comunicação real-time para matchmaking
- **Roteamento**: APIs REST organizadas por funcionalidade

### Serviços Especializados

#### `RiotAPIService.ts`
```typescript
class RiotAPIService {
  // Integração com Account API (Riot ID)
  getSummonerByRiotId(gameName: string, tagLine: string, region: string)
  
  // Integração com Summoner API  
  getSummonerByPuuid(puuid: string, region: string)
  
  // Integração com League API (dados ranqueados)
  getRankedData(summonerId: string, region: string)
  
  // Método unificado com detecção automática
  getSummoner(nameInput: string, region: string)
}
```

#### `LCUService.ts`
```typescript
class LCUService {
  // Conecta automaticamente ao League Client
  connectToLCU(): Promise<boolean>
  
  // Obtém dados do jogador atual
  getCurrentSummoner(): Promise<LCUSummoner>
  
  // Cria lobby customizado
  createCustomLobby(): Promise<LobbyResponse>
  
  // Convida jogadores automaticamente
  inviteToLobby(summonerNames: string[]): Promise<InviteResponse>
}
```

#### `PlayerService.ts`
```typescript
class PlayerService {
  // Registro automático via Riot ID
  registerPlayer(summonerName: string, region: string): Promise<Player>
  
  // Busca completa com dados da Riot API
  getPlayerBySummonerNameWithDetails(riotId: string, region: string): Promise<PlayerData>
  
  // Atualização de MMR baseada em resultados
  updatePlayerFromRiotAPI(playerId: number): Promise<PlayerData>
}
```

#### `MatchmakingService.ts`
```typescript
class MatchmakingService {
  // Adiciona jogador à fila com preferências
  addPlayerToQueue(ws: WebSocket, playerData: QueueData): Promise<void>
  
  // Algoritmo de balanceamento de equipes
  findBalance(): MatchResult | null
  
  // Cria partida e notifica jogadores
  createMatch(players: Player[]): Promise<Match>
}
```

### Algoritmo de Matchmaking

```typescript
// Balanceamento baseado em MMR
calculateTeamBalance(players: Player[]): TeamBalance {
  // 1. Ordenar jogadores por MMR
  // 2. Distribuir em duas equipes alternadamente
  // 3. Calcular diferença de MMR entre equipes
  // 4. Realizar ajustes para minimizar diferença
  // 5. Validar que diferença está dentro do limite aceitável
}

// Cálculo dinâmico de MMR
updatePlayerMMR(player: Player, matchResult: MatchResult): number {
  const kFactor = calculateKFactor(player.games_played);
  const expectedScore = calculateExpectedScore(player.mmr, opponentAvgMMR);
  const actualScore = matchResult.won ? 1 : 0;
  
  return player.mmr + kFactor * (actualScore - expectedScore);
}
```

## 🎨 Camada Frontend

### Arquitetura Angular

```typescript
// Estrutura de componentes principais
@Component AppComponent {
  // Estado global da aplicação
  currentPlayer: Player | null
  queueStatus: QueueStatus
  matchFound: MatchFound | null
  
  // Navegação entre views
  currentView: 'dashboard' | 'queue' | 'history' | 'settings'
}

@Component DashboardComponent {
  // Overview do jogador atual
  // Estatísticas rápidas
  // Ações principais (entrar na fila, etc.)
}

@Component QueueComponent {
  // Interface de fila em tempo real
  // Status de matchmaking
  // Controles de fila
}
```

### Serviços de Integração

#### `ApiService.ts`
```typescript
@Injectable()
export class ApiService {
  // Endpoint principal - busca automática
  getPlayerFromLCU(): Observable<Player>
  
  // Refresh manual via Riot ID
  refreshPlayerByRiotId(riotId: string, region: string): Observable<RefreshPlayerResponse>
  
  // Status do sistema
  getQueueStatus(): Observable<QueueStatus>
  getLCUStatus(): Observable<LCUStatus>
}
```

#### `WebsocketService.ts`
```typescript
@Injectable()
export class WebsocketService {
  // Conexão WebSocket persistente
  connect(): void
  
  // Eventos de matchmaking
  onMessage(): Observable<WebSocketMessage>
  onMatchFound(): Observable<MatchFound>
  onQueueUpdate(): Observable<QueueStatus>
  
  // Ações de fila
  joinQueue(preferences: QueuePreferences): void
  leaveQueue(): void
  acceptMatch(matchId: string): void
}
```

## 🗄️ Camada de Dados

### Banco de Dados SQLite

```sql
-- Tabela principal de jogadores
CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summoner_name TEXT NOT NULL,
    summoner_id TEXT,
    puuid TEXT,
    region TEXT NOT NULL,
    current_mmr INTEGER DEFAULT 1000,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Histórico de partidas
CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT UNIQUE NOT NULL,
    team1_players TEXT NOT NULL, -- JSON array
    team2_players TEXT NOT NULL, -- JSON array
    winner_team INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Configurações do sistema
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `DatabaseManager.ts`
```typescript
class DatabaseManager {
  // Operações CRUD para jogadores
  createPlayer(name: string, region: string): Promise<number>
  getPlayer(id: number): Promise<Player | null>
  updatePlayerMMR(id: number, newMMR: number): Promise<void>
  
  // Histórico de partidas
  saveMatch(matchData: MatchData): Promise<void>
  getPlayerMatches(playerId: number): Promise<Match[]>
  
  // Configurações
  setSetting(key: string, value: string): Promise<void>
  getSetting(key: string): Promise<string | null>
}
```

## 🔄 Fluxo de Dados Principais

### 1. Auto-Load do Jogador
```
Usuario abre app → LCU detectado → getCurrentSummoner() → 
Extrair Riot ID → Buscar na Riot API → Salvar/Atualizar no DB → 
Exibir no Frontend
```

### 2. Matchmaking Flow
```
Jogador entra na fila → WebSocket notification → 
Algoritmo de matching → Equipes balanceadas → 
Match found → Todos aceitam → Criar lobby LCU → 
Convites automáticos → Jogo iniciado
```

### 3. Pós-Partida
```
Partida termina → Detectar resultado → Calcular novo MMR → 
Atualizar banco de dados → Notificar jogadores → 
Atualizar estatísticas
```

## 🛡️ Segurança e Performance

### Medidas de Segurança
- **Helmet.js**: Headers de segurança HTTP
- **CORS**: Controle de origem cruzada
- **Rate Limiting**: 100 requests/15min por IP
- **Input Validation**: Sanitização de dados de entrada
- **API Key Management**: Armazenamento seguro da chave Riot

### Otimizações de Performance
- **WebSocket**: Comunicação real-time eficiente
- **Database Indexing**: Índices em campos críticos
- **Caching**: Cache de dados da Riot API
- **Connection Pooling**: Reutilização de conexões HTTP
- **Lazy Loading**: Componentes carregados sob demanda

### Monitoramento
- **Health Checks**: Endpoint `/api/health`
- **Error Logging**: Console logs estruturados
- **Performance Metrics**: Tempo de resposta das APIs
- **Connection Status**: Monitoramento LCU/Riot API

## 🚀 Deployment e Distribuição

### Build Process
```bash
# 1. Build backend (TypeScript → JavaScript)
npm run build:backend

# 2. Build frontend (Angular → dist/)
npm run build:frontend  

# 3. Build Electron (empacotamento)
npm run build:electron

# 4. Create installer
npm run dist
```

### Arquivos de Saída
- **Windows**: `.exe` installer + portable
- **macOS**: `.dmg` + `.app` bundle  
- **Linux**: `.AppImage` + `.deb` + `.rpm`

### Auto-Update
- **Electron Builder**: Sistema de update automático
- **GitHub Releases**: Distribuição de versões
- **Delta Updates**: Updates incrementais para economia de banda
