# Análise dos Problemas no Sistema de Draft

## 🔍 Problemas Identificados

### 1. **Sobrescrita de Ações por Bots**

**Problema**: Bots estão sobrescrevendo ações anteriores ao realizar suas ações.

**Causa Raiz**:

- O método `applySyncedActions` aplica ações sequencialmente baseado no índice do array
- Não há validação de ordem ou controle de concorrência
- Bots podem executar ações fora de ordem

**Localização**: `src/frontend/src/app/components/draft/draft-pick-ban.ts:1647-1694`

### 2. **Falta de Controle de Ordem Sequencial**

**Problema**: Ações podem ser executadas na posição errada do fluxo do draft.

**Causa Raiz**:

- O `currentAction` é incrementado localmente antes da confirmação do backend
- Sincronização não valida se a ação está na ordem correta
- Não há verificação de turno específico no backend

**Localização**:

- Frontend: `src/frontend/src/app/components/draft/draft-pick-ban.ts:1162-1290`
- Backend: `src/backend/services/PlayerIdentifierService.ts:140-200`

### 3. **Sincronização Inconsistente**

**Problema**: Dados não sincronizam corretamente entre frontend e MySQL.

**Causa Raiz**:

- Polling a cada 500ms pode causar race conditions
- Não há controle de versão ou timestamp das ações
- Aplicação de ações não considera a ordem sequencial

**Localização**: `src/frontend/src/app/components/draft/draft-pick-ban.ts:1592-1646`

### 4. **Identificação de Jogadores Inconsistente**

**Problema**: Diferentes formatos de identificação causam problemas de comparação.

**Causa Raiz**:

- Múltiplos formatos: `gameName#tagLine`, `summonerName`, `name`, `id`
- Normalização inconsistente entre frontend e backend
- Comparações podem falhar dependendo do formato

**Localização**:

- Frontend: `src/frontend/src/app/services/bot.service.ts:174-200`
- Backend: `src/backend/services/PlayerIdentifierService.ts:23-80`

## 🛠️ Soluções Propostas

### 1. **Implementar Controle de Ordem Sequencial**

```typescript
// Backend: DraftService.ts
interface DraftAction {
  matchId: number;
  playerId: string;
  championId: number;
  action: 'pick' | 'ban';
  actionIndex: number; // ✅ NOVO: Índice sequencial da ação
  timestamp: string;
}

// Validar se a ação está na ordem correta
private validateActionOrder(match: any, actionIndex: number): boolean {
  const currentActions = match.pick_ban_data?.actions?.length || 0;
  return actionIndex === currentActions;
}
```

### 2. **Implementar Controle de Concorrência**

```typescript
// Backend: DraftService.ts
private processingActions = new Map<string, Promise<void>>();

async processDraftAction(matchId: number, playerId: string, championId: number, action: 'pick' | 'ban'): Promise<void> {
  const actionKey = `${matchId}-${action}`;
  
  // ✅ NOVO: Aguardar ação anterior terminar
  if (this.processingActions.has(actionKey)) {
    await this.processingActions.get(actionKey);
  }
  
  const actionPromise = this.processAction(matchId, playerId, championId, action);
  this.processingActions.set(actionKey, actionPromise);
  
  try {
    await actionPromise;
  } finally {
    this.processingActions.delete(actionKey);
  }
}
```

### 3. **Melhorar Sincronização com Versionamento**

```typescript
// Frontend: draft-pick-ban.ts
interface SyncData {
  version: number; // ✅ NOVO: Controle de versão
  actions: DraftAction[];
  lastActionIndex: number;
  timestamp: string;
}

private applySyncedActions(actions: DraftAction[]): void {
  // ✅ NOVO: Aplicar apenas ações na ordem correta
  const currentActionIndex = this.session?.currentAction || 0;
  
  for (const action of actions) {
    if (action.actionIndex === currentActionIndex) {
      this.applyAction(action);
      this.session.currentAction++;
    } else if (action.actionIndex < currentActionIndex) {
      // Ação já foi aplicada, ignorar
      continue;
    } else {
      // Ação fora de ordem, aguardar
      break;
    }
  }
}
```

### 4. **Padronizar Identificação de Jogadores**

```typescript
// PlayerIdentifierService.ts
static normalizePlayerIdentifier(playerInfo: any): PlayerIdentifier {
  // ✅ PRIORIDADE CLARA:
  // 1. gameName#tagLine (padrão Riot)
  // 2. summonerName (fallback)
  // 3. name (fallback)
  // 4. id (último fallback)
  
  let identifier = '';
  let source = '';
  
  if (playerInfo.gameName && playerInfo.tagLine) {
    identifier = `${playerInfo.gameName}#${playerInfo.tagLine}`;
    source = 'gameName#tagLine';
  } else if (playerInfo.summonerName) {
    identifier = playerInfo.summonerName;
    source = 'summonerName';
  } else if (playerInfo.name) {
    identifier = playerInfo.name;
    source = 'name';
  } else if (playerInfo.id) {
    identifier = playerInfo.id.toString();
    source = 'id';
  }
  
  console.log(`🔍 [PlayerIdentifier] Normalizado: "${identifier}" (fonte: ${source})`);
  
  return {
    id: identifier,
    name: identifier.toLowerCase().trim(),
    isBot: this.isBotPlayer(identifier),
    teamIndex: playerInfo.teamIndex || 0,
    lane: playerInfo.lane || playerInfo.assignedLane || 'unknown',
    gameName: playerInfo.gameName,
    tagLine: playerInfo.tagLine,
    summonerName: playerInfo.summonerName
  };
}
```

### 5. **Implementar Validação de Turno Específico**

```typescript
// PlayerIdentifierService.ts
static validateDraftAction(
  match: any,
  playerId: string,
  action: 'pick' | 'ban',
  currentActionIndex: number
): { valid: boolean; reason?: string } {
  
  // ✅ NOVO: Verificar se é o turno correto do jogador
  const expectedPlayer = this.getExpectedPlayerForAction(match, currentActionIndex);
  
  if (!expectedPlayer) {
    return {
      valid: false,
      reason: `Ação ${currentActionIndex} não encontrada no fluxo do draft`
    };
  }
  
  const isCorrectPlayer = this.comparePlayerWithId(
    { summonerName: expectedPlayer },
    playerId
  );
  
  if (!isCorrectPlayer) {
    return {
      valid: false,
      reason: `Não é o turno de ${playerId}. Esperado: ${expectedPlayer}`
    };
  }
  
  return { valid: true };
}

private static getExpectedPlayerForAction(match: any, actionIndex: number): string | null {
  // ✅ NOVO: Mapear ação para jogador esperado baseado no fluxo do draft
  const draftFlow = this.generateDraftFlow(match);
  return draftFlow[actionIndex] || null;
}
```

### 6. **Melhorar Controle de Bots**

```typescript
// BotService.ts
shouldPerformBotAction(phase: PickBanPhase, session: CustomPickBanSession, currentPlayer?: any): boolean {
  // ✅ NOVO: Verificar se é realmente o turno do bot
  const currentActionIndex = session.currentAction;
  const expectedPlayer = this.getExpectedPlayerForAction(session, currentActionIndex);
  
  if (!expectedPlayer) {
    console.log('⚠️ [BotService] Jogador esperado não encontrado');
    return false;
  }
  
  const isBotTurn = this.comparePlayerWithId(
    { summonerName: expectedPlayer },
    phase.playerId || ''
  );
  
  const isBot = this.isBot({ summonerName: expectedPlayer });
  const isSpecialUser = this.isSpecialUser(currentPlayer);
  
  return isBotTurn && isBot && isSpecialUser;
}
```

## 🎯 Implementação Recomendada

### Fase 1: Correções Críticas

1. **Implementar controle de ordem sequencial** no backend
2. **Adicionar validação de turno específico**
3. **Corrigir identificação de jogadores**

### Fase 2: Melhorias de Sincronização

1. **Implementar versionamento de ações**
2. **Melhorar controle de concorrência**
3. **Otimizar polling de sincronização**

### Fase 3: Refinamentos

1. **Adicionar logs detalhados para debug**
2. **Implementar rollback de ações inválidas**
3. **Melhorar tratamento de erros**

## 🔧 Comandos para Implementação

```bash
# 1. Fazer backup do código atual
git checkout -b fix-draft-synchronization

# 2. Implementar correções no backend
# - DraftService.ts: Adicionar controle de ordem
# - PlayerIdentifierService.ts: Melhorar validação

# 3. Implementar correções no frontend
# - draft-pick-ban.ts: Melhorar sincronização
# - bot.service.ts: Corrigir lógica de bots

# 4. Testar com partidas de debug
# - Usar logs [DraftPickBan] para monitorar
# - Verificar fluxo sequencial
# - Validar identificação de jogadores
```

## 📊 Métricas de Sucesso

- ✅ Ações executadas na ordem correta
- ✅ Sem sobrescrita de ações por bots
- ✅ Sincronização consistente entre frontend e MySQL
- ✅ Identificação correta de jogadores (summonerName+tagLine)
- ✅ Bots executam ações apenas em seus turnos
- ✅ Logs claros para debug com tag [DraftPickBan]

## 🚨 Pontos de Atenção

1. **Não quebrar funcionalidade existente**
2. **Manter compatibilidade com dados existentes**
3. **Testar com diferentes formatos de identificação**
4. **Validar performance com múltiplos jogadores**
5. **Garantir que bots não interfiram com jogadores reais**

---

**Status**: Análise completa - Pronto para implementação
**Prioridade**: Alta - Problemas críticos de sincronização
**Complexidade**: Média - Requer mudanças em frontend e backend
