# BotService - Arquitetura Separada

## Visão Geral

O `BotService` foi criado para separar toda a lógica relacionada aos bots do componente principal `draft-pick-ban.ts`. Esta refatoração segue os princípios de **Separation of Concerns** e **Single Responsibility Principle**, tornando o código mais organizado, testável e reutilizável.

## Estrutura do BotService

### Localização

src/frontend/src/app/services/bot.service.ts

### Interfaces Exportadas

```typescript
export interface PickBanPhase {
    team: 'blue' | 'red';
    action: 'ban' | 'pick';
    champion?: Champion;
    playerId?: string;
    playerName?: string;
    locked: boolean;
    timeRemaining: number;
}

export interface CustomPickBanSession {
    id: string;
    phase: 'bans' | 'picks' | 'completed';
    currentAction: number;
    extendedTime: number;
    phases: PickBanPhase[];
    blueTeam: any[];
    redTeam: any[];
    currentPlayerIndex: number;
}
```

## Funcionalidades do BotService

### 1. Detecção de Bots

```typescript
isBot(player: any): boolean
```

- Verifica se um jogador é bot baseado em:
  - IDs negativos
  - Padrões de nome (bot, ai, computer, etc.)
  - Strings que contêm "bot" ou "ai"

### 2. Comparação de Jogadores

```typescript
comparePlayers(player1: any, player2: any): boolean
comparePlayerWithId(player: any, targetId: string): boolean
```

- Compara jogadores de forma consistente
- Suporta diferentes formatos de ID e nome
- Lida com Riot IDs (gameName#tagLine)

### 3. Ações Automáticas

```typescript
shouldPerformBotAction(phase: PickBanPhase, session: CustomPickBanSession): boolean
performBotAction(phase: PickBanPhase, session: CustomPickBanSession, champions: Champion[]): void
```

- Verifica se uma fase deve ter ação automática
- Executa picks/bans automáticos para bots
- Seleciona campeões aleatórios disponíveis

### 4. Agendamento de Ações

```typescript
scheduleBotAction(phase: PickBanPhase, session: CustomPickBanSession, champions: Champion[], callback: () => void): number
cancelScheduledAction(timerId: number): void
```

- Agenda ações automáticas com delay (2-5 segundos)
- Permite cancelamento de ações agendadas
- Executa callback após ação concluída

### 5. Estatísticas e Informações

```typescript
getBotInfo(team: any[]): { botCount: number, botPlayers: any[] }
hasBots(team: any[]): boolean
getSessionBotStats(session: CustomPickBanSession): { blueTeamBots: number, redTeamBots: number, totalBots: number, botPercentage: number }
```

- Fornece informações sobre bots nos times
- Calcula estatísticas da sessão

## Benefícios da Refatoração

### 1. **Separação de Responsabilidades**

- Componente `draft-pick-ban.ts` foca apenas na UI e lógica de draft
- `BotService` gerencia toda a lógica de bots
- Código mais limpo e organizado

### 2. **Reutilização**

- `BotService` pode ser usado em outros componentes
- Lógica de bot centralizada e consistente
- Fácil manutenção e atualizações

### 3. **Testabilidade**

- BotService pode ser testado independentemente
- Mocks mais fáceis de criar
- Testes unitários mais focados

### 4. **Manutenibilidade**

- Mudanças na lógica de bot não afetam o componente principal
- Debugging mais fácil
- Código mais legível

## Como Usar o BotService

### 1. Injeção de Dependência

```typescript
constructor(
    private championService: ChampionService,
    private botService: BotService
) { }
```

### 2. Verificar se Jogador é Bot

```typescript
if (this.botService.isBot(player)) {
    // Lógica para bot
}
```

### 3. Agendar Ação Automática

```typescript
this.botPickTimer = this.botService.scheduleBotAction(
    phase, 
    session, 
    champions, 
    () => {
        // Callback após ação do bot
        this.updateCurrentTurn();
        this.invalidateCache();
    }
);
```

### 4. Cancelar Ação Agendada

```typescript
if (this.botPickTimer) {
    this.botService.cancelScheduledAction(this.botPickTimer);
    this.botPickTimer = null;
}
```

## Migração do Código

### Antes (Código Embutido)

```typescript
// Lógica de bot espalhada pelo componente
private isBot(player: any): boolean { /* ... */ }
private performBotAction(phase: PickBanPhase) { /* ... */ }
private comparePlayers(player1: any, player2: any): boolean { /* ... */ }
```

### Depois (Usando BotService)

```typescript
// Lógica centralizada no serviço
this.botService.isBot(player)
this.botService.performBotAction(phase, session, champions)
this.botService.comparePlayers(player1, player2)
```

## Padrões de Nomenclatura

### Logs do BotService

- Todos os logs começam com `🤖 [BotService]`
- Facilita debugging e identificação de origem
- Consistente com outros serviços

### Métodos Públicos vs Privados

- Métodos públicos: `isBot`, `comparePlayers`, `performBotAction`
- Métodos privados: `isChampionBanned`, `isChampionPicked`
- Interface clara para uso externo

## Considerações Futuras

### 1. **Configuração de Bots**

- Possibilidade de adicionar configurações de dificuldade
- Diferentes estratégias de seleção de campeões
- Personalização de delays

### 2. **Testes**

- Criar testes unitários para BotService
- Testes de integração com componente
- Mocks para diferentes cenários

### 3. **Extensibilidade**

- Suporte a diferentes tipos de bots
- Integração com IA mais avançada
- Configurações via arquivo de configuração

## Conclusão

A refatoração do `BotService` representa uma melhoria significativa na arquitetura do sistema de draft. O código está agora mais organizado, testável e manutenível, seguindo as melhores práticas de desenvolvimento Angular e princípios SOLID.
