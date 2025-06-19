# Arquitetura Técnica - LoL Matchmaking System ✅

## 📋 Visão Geral da Arquitetura - IMPLEMENTADO

O sistema foi projetado e **totalmente implementado** com uma arquitetura modular e escalável, separando responsabilidades entre backend, frontend e integração com APIs externas.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │  External APIs  │
│   (Angular 18)  │    │   (Node.js 20)  │    │                 │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ ✅ UI Components│◄──►│ ✅ REST APIs    │◄──►│ 🔨 Riot Games   │
│ ✅ Draft System │    │ ✅ WebSocket    │    │ ✅ LCU (Local)  │
│ ✅ State Mgmt   │    │ ✅ Matchmaking  │    │ ✅ Database     │
│ ✅ WebSocket    │    │ ✅ Data Layer   │    │   (SQLite)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │
        └────────────────────────┘
           ✅ Electron Container
```

## 🏗️ Estrutura de Diretórios - IMPLEMENTADO

```
/src
├── backend/                    # ✅ Servidor Node.js + TypeScript
│   ├── server.ts              # ✅ Ponto de entrada e rotas
│   ├── database/              # ✅ Camada de dados
│   │   └── DatabaseManager.ts # ✅ Gerenciamento SQLite
│   └── services/              # ✅ Lógica de negócio
│       ├── RiotAPIService.ts  # 🔨 Integração Riot API (base)
│       ├── LCUService.ts      # ✅ Integração League Client
│       ├── PlayerService.ts   # ✅ Gerenciamento de jogadores
│       ├── MatchmakingService.ts # ✅ Sistema completo de filas
│       └── MatchHistoryService.ts # 📋 Histórico (planejado)
├── frontend/                   # ✅ Aplicação Angular
│   └── src/app/
│       ├── components/        # ✅ Componentes UI
│       ├── services/          # ✅ Serviços e integrações
│       ├── app.ts            # ✅ Lógica principal + draft
│       ├── app-simple.html   # ✅ Interface completa
│       ├── app.scss          # ✅ Estilos profissionais
│       └── interfaces.ts      # ✅ Definições TypeScript
└── electron/                   # ✅ Configuração desktop
    ├── main.ts                # ✅ Processo principal
    └── preload.ts             # ✅ Scripts de segurança
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

## ⚔️ Sistema de Draft Implementado

### Arquitetura do Draft System

```
┌─────────────────────────────────────────────────────────────┐
│                     Draft Flow (Implementado)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Match Found Modal (30s timer)                          │
│     ├─► Accept/Decline buttons                             │
│     ├─► Auto-accept for bots                              │
│     └─► Timeout handling                                  │
│                                                             │
│  2. Draft Preview                                          │
│     ├─► Blue Team (5 players)                             │
│     ├─► Red Team (5 players)                              │
│     ├─► Leadership assignment (first human on blue)        │
│     └─► Leadership transfer interface                      │
│                                                             │
│  3. Pick & Ban Phase                                       │
│     ├─► Champion grid (mock data)                         │
│     ├─► Turn system (alternating teams)                   │
│     ├─► Timer per turn (30s)                              │
│     ├─► Ban/Pick validation                               │
│     └─► Real-time updates                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Componentes Implementados

#### 1. Match Found Component (✅ Completo)
```typescript
// app.ts - Modal de partida encontrada
showMatchFoundModal(matchData: MatchFoundData): void {
  this.matchFoundData = matchData;
  this.showMatchFound = true;
  
  // Timer automático de 30 segundos
  setTimeout(() => {
    if (this.showMatchFound) {
      this.handleMatchDecline();
    }
  }, 30000);
}

// Auto-accept para bots
handleMatchAccept(): void {
  if (this.currentPlayer?.isBot) {
    this.autoAcceptMatch();
  }
  this.enterDraftPreview();
}
```

#### 2. Leadership System (✅ Completo)
```typescript
// Sistema de liderança inteligente
private determineLeader(blueTeam: any[]): any {
  // Primeiro jogador humano do time azul
  const humanPlayer = blueTeam.find(player => !player.isBot);
  return humanPlayer || blueTeam[0];
}

// Transferência de liderança
transferLeadership(newLeaderId: number): void {
  const newLeader = this.draftData.allPlayers.find(p => p.id === newLeaderId);
  if (newLeader && !newLeader.isBot) {
    this.draftData.matchLeader = newLeader;
    this.isMatchLeader = (this.currentPlayer?.id === newLeaderId);
    this.addNotification('success', 'Liderança Transferida', 
      `${newLeader.summonerName} agora é o líder`);
  }
}

// Validação anti-bot
getEligiblePlayersForTransfer(): any[] {
  return this.draftData.blueTeam.filter(player => 
    !player.isBot && player.id !== this.draftData.matchLeader?.id
  );
}
```

#### 3. Pick & Ban Interface (✅ Completo)
```typescript
// Grid de campeões com filtragem
getAvailableChampions(): any[] {
  return this.champions.filter(champion => 
    !this.draftData.bannedChampions.includes(champion.id) &&
    !this.draftData.pickedChampions.includes(champion.id)
  );
}

// Sistema de turnos
isCurrentPlayerTurn(): boolean {
  if (!this.draftData?.currentTurn) return false;
  return this.draftData.currentTurn.playerId === this.currentPlayer?.id;
}

// Confirmação de seleção
confirmSelection(): void {
  if (!this.selectedChampion || !this.isCurrentPlayerTurn()) return;
  
  if (this.draftData.currentTurn.action === 'ban') {
    this.draftData.bannedChampions.push(this.selectedChampion.id);
    this.addNotification('info', 'Champion Banido', 
      `${this.selectedChampion.name} foi banido`);
  } else {
    this.draftData.pickedChampions.push(this.selectedChampion.id);
    this.addNotification('success', 'Champion Escolhido', 
      `${this.selectedChampion.name} foi escolhido`);
  }
  
  this.advanceTurn();
  this.selectedChampion = null;
}
```

### Interface HTML (✅ Implementado)

#### Draft Preview
```html
<!-- app-simple.html - Preview dos times -->
<div class="draft-preview" *ngIf="inDraftPhase && draftPhase === 'preview'">
  <div class="teams-container">
    <!-- Time Azul -->
    <div class="team blue-team">
      <h3>🔵 Time Azul</h3>
      <div *ngFor="let player of draftData.blueTeam" class="player-card">
        <span [class.leader]="player.id === draftData.matchLeader?.id">
          {{player.summonerName}} 
          <span *ngIf="player.isBot" class="bot-indicator">[BOT]</span>
          <span *ngIf="player.id === draftData.matchLeader?.id">👑</span>
        </span>
        <span class="player-mmr">{{player.currentMMR}} MMR</span>
      </div>
    </div>
    
    <!-- Time Vermelho -->
    <div class="team red-team">
      <h3>🔴 Time Vermelho</h3>
      <div *ngFor="let player of draftData.redTeam" class="player-card">
        <span>{{player.summonerName}}
          <span *ngIf="player.isBot" class="bot-indicator">[BOT]</span>
        </span>
        <span class="player-mmr">{{player.currentMMR}} MMR</span>
      </div>
    </div>
  </div>
  
  <!-- Painel de Liderança -->
  <div *ngIf="isMatchLeader" class="leadership-panel">
    <h4>🎖️ Painel de Liderança</h4>
    <div class="leadership-controls">
      <label>Transferir liderança para:</label>
      <select [(ngModel)]="selectedNewLeader">
        <option value="">Selecione um jogador</option>
        <option *ngFor="let player of getEligiblePlayersForTransfer()" 
                [value]="player.id">
          {{player.summonerName}}
        </option>
      </select>
      <button (click)="transferLeadership(selectedNewLeader)" 
              [disabled]="!selectedNewLeader">
        Transferir
      </button>
    </div>
    <button class="primary-button" (click)="startPickBanPhase()">
      🎯 Ir para os Picks
    </button>
  </div>
</div>
```

#### Pick & Ban Interface
```html
<!-- app-simple.html - Pick & Ban -->
<div class="pickban-interface" *ngIf="inDraftPhase && draftPhase === 'pickban'">
  <!-- Timer e Status -->
  <div class="draft-header">
    <div class="draft-timer">
      <div class="timer-circle">{{draftTimer}}</div>
      <div class="turn-info">
        <span *ngIf="isCurrentPlayerTurn()" class="your-turn">SUA VEZ</span>
        <span *ngIf="!isCurrentPlayerTurn()">{{getCurrentPlayerName()}}</span>
        <span class="action-type">{{getCurrentAction()}}</span>
      </div>
    </div>
  </div>
  
  <!-- Grid de Campeões -->
  <div class="champions-section">
    <h4>Selecione um Campeão:</h4>
    <div class="champions-grid">
      <div *ngFor="let champion of getAvailableChampions()" 
           class="champion-card" 
           [class.selected]="selectedChampion?.id === champion.id"
           (click)="selectChampion(champion)">
        <img [src]="champion.image" [alt]="champion.name">
        <span>{{champion.name}}</span>
      </div>
    </div>
    
    <!-- Controles de Ação -->
    <div class="action-controls" *ngIf="isCurrentPlayerTurn()">
      <button class="confirm-button" 
              [disabled]="!selectedChampion"
              (click)="confirmSelection()">
        {{getCurrentAction()}} {{selectedChampion?.name || 'Campeão'}}
      </button>
    </div>
  </div>
  
  <!-- Times com Seleções -->
  <div class="draft-teams">
    <div class="team-picks blue-picks">
      <h4>🔵 Time Azul</h4>
      <div *ngFor="let pick of draftData.bluePicks" class="champion-pick">
        <img [src]="pick.image" [alt]="pick.name">
        <span>{{pick.name}}</span>
      </div>
    </div>
    
    <div class="team-picks red-picks">
      <h4>🔴 Time Vermelho</h4>
      <div *ngFor="let pick of draftData.redPicks" class="champion-pick">
        <img [src]="pick.image" [alt]="pick.name">
        <span>{{pick.name}}</span>
      </div>
    </div>
  </div>
</div>
```

### CSS Profissional (✅ Implementado)

```scss
// app.scss - Estilos do Draft
.draft-preview {
  padding: 20px;
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  border-radius: 12px;
  color: white;

  .teams-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin-bottom: 30px;

    .team {
      background: rgba(255, 255, 255, 0.1);
      padding: 20px;
      border-radius: 8px;
      
      &.blue-team { border-left: 4px solid #4a90e2; }
      &.red-team { border-left: 4px solid #e24a4a; }

      .player-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        margin: 5px 0;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;

        .leader { font-weight: bold; }
        .bot-indicator { color: #ffa500; font-size: 0.8em; }
      }
    }
  }

  .leadership-panel {
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid gold;
    padding: 20px;
    border-radius: 8px;
    text-align: center;

    .leadership-controls {
      margin: 15px 0;
      
      select, button {
        margin: 0 10px;
        padding: 8px 12px;
        border-radius: 4px;
        border: none;
      }
    }
  }
}

.pickban-interface {
  .draft-timer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    margin-bottom: 20px;

    .timer-circle {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea, #764ba2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 24px;
      font-weight: bold;
    }

    .your-turn {
      color: #4CAF50;
      font-weight: bold;
      font-size: 18px;
    }
  }

  .champions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;

    .champion-card {
      background: var(--surface-color);
      border: 2px solid var(--border-color);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover { 
        transform: scale(1.05);
        border-color: var(--primary-color);
      }
      
      &.selected { 
        border-color: var(--accent-color);
        background: rgba(76, 175, 80, 0.2);
      }

      img {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        object-fit: cover;
      }

      span {
        display: block;
        margin-top: 5px;
        font-size: 12px;
      }
    }
  }

  .confirm-button {
    background: linear-gradient(135deg, #4CAF50, #45a049);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover { transform: translateY(-2px); }
    &:disabled { 
      opacity: 0.5; 
      cursor: not-allowed;
      transform: none;
    }
  }
}
```
