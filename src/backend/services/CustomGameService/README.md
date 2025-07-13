# 🎮 CustomGameService - Sistema de Partidas Customizadas

## Visão Geral

O `CustomGameService` é um sistema automatizado que integra o League of Legends com o sistema de matchmaking para criar partidas customizadas automaticamente após o draft ser completado.

## Funcionalidades

### ✅ Fluxo Completo Automatizado

1. **Match Found** → Partida criada com lanes atribuídas (posições 0-9)
2. **Todos aceitam** → Criação de salas no Discord + movimentação de jogadores
3. **Automação LoL** → Leader (primeiro da fila) cria partida customizada "PERSON DOS CRIA ORDEM INHOUSE"
4. **Controle de ordem** → Sistema configura posições específicas no lobby baseado no draft
5. **Verificação de ordem** → Confirma se a ordem atual coincide com a esperada do draft
6. **Entrada automática** → Jogador entra na sala na ordem correta (0-9)
7. **Início da partida** → Leader inicia a partida customizada
8. **Auto-pick** → Cada backend local picka o campeão escolhido durante o draft

### ⭐ Controle Preciso da Ordem dos Jogadores

O sistema agora garante que a ordem dos jogadores na partida customizada seja **exatamente igual** ao draft do aplicativo:

- **Posições baseadas em lanes**: Top (0), Jungle (1), Mid (2), ADC (3), Support (4)
- **Organização visual**: Jogadores organizados da esquerda para a direita
- **Verificação em tempo real**: Confirma se a ordem atual coincide com a esperada
- **Fallback inteligente**: Se a ordem não coincidir, usa a ordem do draft como referência
- **Configuração via LCU**: Define posições específicas no lobby antes da entrada dos jogadores

## Como Funciona

### 1. Inicialização

```typescript
// O serviço é inicializado automaticamente no servidor
const customGameService = new CustomGameService(dbManager, lcuService, wss, discordService);
```

### 2. Iniciar Criação de Partida Customizada

```typescript
// Via API REST
POST /api/custom-game/start/:matchId

// Via WebSocket
{
  type: 'start_custom_game',
  matchId: 123
}
```

### 3. Fluxo de Execução

#### Fase 1: Preparação

- Busca dados da partida no banco
- Verifica se está em status 'accepted' ou 'draft'
- Prepara dados dos jogadores com ordem correta (0-9)
- Identifica o líder (primeiro jogador da fila)

#### Fase 2: Criação do Lobby

- **Se o jogador atual é o líder:**
  - Cria partida customizada via LCU
  - Nome: "PERSON DOS CRIA ORDEM INHOUSE"
  - Modo: Draft com 5 bans
  - Configura lobby para draft mode
  - **⭐ NOVO**: Configura posições específicas dos jogadores baseado no draft

- **Se o jogador atual NÃO é o líder:**
  - Aguarda o líder criar a partida
  - Monitora mudanças no status da partida

#### Fase 2.5: ⭐ Controle de Ordem dos Jogadores

- **Configuração de posições**: Define cellId específico para cada jogador baseado na lane
- **Team 1 (Blue)**: Posições 0-4 (Top, Jungle, Mid, ADC, Support)
- **Team 2 (Red)**: Posições 5-9 (Top, Jungle, Mid, ADC, Support)
- **Verificação de ordem**: Confirma se a ordem atual coincide com a esperada do draft
- **Notificação**: Informa aos jogadores a ordem esperada de entrada

#### Fase 3: Entrada dos Jogadores

- Notifica todos os jogadores para entrarem no lobby
- Monitora entrada dos jogadores (timeout: 30s)
- Aguarda todos os 10 jogadores entrarem

#### Fase 4: Auto-Pick

- Aguarda entrar na fase de seleção de campeões
- Detecta ordem dos jogadores na partida
- Executa auto-pick para cada jogador baseado no draft
- Delay de 2s entre cada pick

## Estrutura de Dados

### CustomGamePlayer

```typescript
interface CustomGamePlayer {
  summonerName: string;
  tagLine: string;
  riotId: string; // summonerName#tagLine
  teamIndex: number; // 0-9
  assignedLane: string;
  championId?: number; // Campeão escolhido no draft
  isLeader: boolean;
}
```

### CustomGameData

```typescript
interface CustomGameData {
  matchId: number;
  gameName: string;
  players: CustomGamePlayer[];
  status: 'creating' | 'waiting' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  gameId?: string; // ID da partida no LoL
  lobbyId?: string; // ID do lobby no LoL
}
```

## APIs Disponíveis

### REST APIs

```typescript
// Iniciar criação de partida customizada
POST /api/custom-game/start/:matchId

// Buscar status da partida customizada
GET /api/custom-game/status/:matchId

// Listar partidas customizadas ativas
GET /api/custom-game/active
```

### WebSocket Messages

```typescript
// Enviar
{
  type: 'start_custom_game',
  matchId: number
}

{
  type: 'get_custom_game_status',
  matchId: number
}

// Receber
{
  type: 'custom_game_creation_started',
  data: CustomGameData
}

{
  type: 'custom_game_lobby_created',
  data: { lobbyId: string, gameName: string, players: CustomGamePlayer[] }
}

{
  type: 'custom_game_error',
  data: { error: string }
}

{
  type: 'custom_game_player_order',
  data: {
    pickOrder: Array<{ summonerId: string, position: string }>,
    instructions: string,
    expectedOrder: string[]
  }
}
```

## Integração com Frontend

### Serviço Angular

```typescript
// src/frontend/src/app/services/custom-game.service.ts
export class CustomGameService {
  startCustomGameCreation(matchId: number): void
  getCustomGameStatus(matchId: number): void
  getCustomGameEvents(): Observable<any>
}
```

### Componente Angular

```typescript
// src/frontend/src/app/components/custom-game-status/custom-game-status.component.ts
@Component({
  selector: 'app-custom-game-status',
  template: `...`
})
export class CustomGameStatusComponent {
  @Input() matchId!: number;
}
```

### Uso no Template

```html
<app-custom-game-status [matchId]="currentMatchId"></app-custom-game-status>
```

## Configurações

### Timeouts

```typescript
private readonly GAME_CREATION_TIMEOUT = 60000; // 60s para criar partida
private readonly LOBBY_JOIN_TIMEOUT = 30000; // 30s para entrar no lobby
private readonly AUTO_PICK_DELAY = 2000; // 2s entre picks
```

### Status da Partida

- `creating`: Criação sendo iniciada
- `waiting`: Aguardando jogadores entrarem no lobby
- `in_progress`: Partida em andamento
- `completed`: Partida concluída
- `cancelled`: Partida cancelada

## Tratamento de Erros

### Timeoutss

- **Game Creation Timeout**: Se o líder não criar a partida em 60s
- **Lobby Join Timeout**: Se nem todos os jogadores entrarem em 30s

### Erros Comuns

- LCU não conectado
- Jogador atual não é o líder
- Dados da partida não encontrados
- Falha na criação do lobby via LCU

## Logs e Monitoramento

O serviço gera logs detalhados para cada etapa:

🎮 [CustomGame] Iniciando criação de partida customizada para match 123
👑 [CustomGame] Líder identificado: PlayerName#BR1 (teamIndex: 0)
🎮 [CustomGame] Criando partida customizada via LCU...
✅ [CustomGame] Lobby criado: { lobbyId: "abc123", gameName: "PERSON DOS CRIA ORDEM INHOUSE" }
👀 [CustomGame] Monitorando entrada dos jogadores no lobby...
🎯 [CustomGame] Auto-pick para PlayerName#BR1: campeão 64

## Dependências

- `DatabaseManager`: Para buscar dados da partida
- `LCUService`: Para interagir com o League of Legends
- `DiscordService`: Para notificações (opcional)
- `WebSocketServer`: Para comunicação em tempo real

## Exemplo de Uso Completo

```typescript
// 1. Iniciar criação
await customGameService.startCustomGameCreation(matchId);

// 2. Monitorar eventos
customGameService.getCustomGameEvents().subscribe(event => {
  switch (event.type) {
    case 'creation_started':
      console.log('Criação iniciada:', event.data);
      break;
    case 'lobby_created':
      console.log('Lobby criado:', event.data);
      break;
    case 'error':
      console.error('Erro:', event.data.error);
      break;
  }
});

// 3. Verificar status
const gameData = await customGameService.getCustomGameByMatchId(matchId);
console.log('Status atual:', gameData?.status);
```

## Considerações de Segurança

- Apenas o líder pode criar a partida customizada
- Validação de permissões antes de executar ações
- Timeouts para evitar travamentos
- Logs detalhados para auditoria

## Troubleshooting

### Problema: LCU não conectado

**Solução**: Verificar se o League of Legends está aberto e logado

### Problema: Jogador não é o líder

**Solução**: Aguardar o líder criar a partida ou verificar ordem da fila

### Problema: Timeout na criação

**Solução**: Verificar se o líder está online e tem permissões

### Problema: Auto-pick não funciona

**Solução**: Verificar se o campeão foi escolhido no draft e se o LCU está conectado
