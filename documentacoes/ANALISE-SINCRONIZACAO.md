# Análise Diagnóstica: Problemas de Sincronização entre Jogadores

## Resumo Executivo

O sistema apresenta problemas críticos de sincronização entre jogadores em diferentes PCs, especificamente nos fluxos de `match_found` e `draft`. O MySQL está sendo usado como fonte única de verdade, mas há falhas na sincronização via WebSocket que impedem que todos os jogadores recebam as notificações simultaneamente.

## Problemas Identificados

### 1. **Problema Principal: Notificações WebSocket Não Direcionadas**

#### Localização do Problema

- **Arquivo**: `src/backend/services/MatchFoundService.ts`
- **Método**: `broadcastMessage()` (linha 914)
- **Método**: `sendWebSocketNotifications()` (linha 615)

#### Análise Detalhada

**Problema 1: Broadcast Geral em Vez de Notificação Direcionada

```typescript
// ❌ PROBLEMA: broadcastMessage envia para TODOS os clientes
private broadcastMessage(message: any): void {
  this.wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message)); // Envia para TODOS
    }
  });
}
```

**Problema 2: Identificação de Jogadores Inconsistente

```typescript
// ❌ PROBLEMA: Fallback para clientes não identificados
if (isIdentified && clientInfo) {
  const isInMatch = this.isPlayerInMatch(clientInfo, allPlayersInMatch);
  if (isInMatch) {
    // Envia apenas para jogadores da partida
  }
} else {
  // ❌ FALLBACK PERIGOSO: Envia para TODOS os não identificados
  client.send(JSON.stringify(message));
}
```

### 2. **Problema de Timing na Identificação de Jogadores**

#### Localização do Problemas

- **Arquivo**: `src/backend/server.ts`
- **Método**: `handleWebSocketMessage()` (linha 248)

#### Análise

```typescript
case 'identify_player':
  // ✅ CORRETO: Identifica o jogador
  (ws as any).playerInfo = data.playerData;
  (ws as any).isIdentified = true;
```

**Problema**: Se a notificação `match_found` for enviada antes de todos os jogadores se identificarem, eles não receberão a notificação.

### 3. **Problema de Sincronização no DraftService**

#### Localização do Problemass

- **Arquivo**: `src/backend/services/DraftService.ts`
- **Método**: `broadcastMessage()` (linha 1390)

#### Análises

```typescript
// ❌ PROBLEMA: Broadcast geral sem filtro
private broadcastMessage(message: any): void {
  this.wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message)); // Envia para TODOS
    }
  });
}
```

### 4. **Problema de Monitoramento de Status no MySQL**

#### Localização do Problemasss

- **Arquivo**: `src/backend/services/MatchFoundService.ts`
- **Método**: `monitorAcceptanceStatus()` (linha 226)

#### Análisess

```typescript
// ✅ CORRETO: Monitora status no banco
const activeMatches = await this.dbManager.getActiveCustomMatches();
for (const match of activeMatches) {
  await this.processMatchAcceptanceFromDB(match);
}
```

**Problema**: O monitoramento funciona, mas as notificações não chegam a todos os jogadores devido aos problemas de WebSocket.

## Soluções Propostas

### 1. **Solução Imediata: Correção do Sistema de Notificações**

#### 1.1 Corrigir `sendWebSocketNotifications` no MatchFoundService

```typescript
// ✅ SOLUÇÃO: Notificação direcionada apenas para jogadores da partida
private async sendWebSocketNotifications(message: any, allPlayersInMatch: string[]): Promise<{
  notifiedPlayers: string[],
  totalClients: number,
  identifiedClients: number,
  matchedClients: number
}> {
  const notifiedPlayers: string[] = [];
  let totalClients = 0;
  let identifiedClients = 0;
  let matchedClients = 0;

  this.wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      totalClients++;
      const clientInfo = (client as any).playerInfo;
      const isIdentified = (client as any).isIdentified;

      if (isIdentified) {
        identifiedClients++;
      }

      // ✅ CORREÇÃO: Enviar APENAS para jogadores identificados na partida
      if (isIdentified && clientInfo) {
        const isInMatch = this.isPlayerInMatch(clientInfo, allPlayersInMatch);
        if (isInMatch) {
          try {
            client.send(JSON.stringify(message));
            matchedClients++;
            const playerIdentifier = this.getPlayerIdentifier(clientInfo);
            if (playerIdentifier) {
              notifiedPlayers.push(playerIdentifier);
            }
          } catch (error) {
            console.error('❌ Erro ao enviar notificação:', error);
          }
        }
      }
      // ❌ REMOVER: Fallback para clientes não identificados
    }
  });

  return { notifiedPlayers, totalClients, identifiedClients, matchedClients };
}
```

#### 1.2 Corrigir `broadcastMessage` no DraftService

```typescript
// ✅ SOLUÇÃO: Broadcast direcionado para jogadores da partida
private broadcastMessage(message: any, matchId?: number): void {
  if (!this.wss?.clients) return;

  // Se matchId fornecido, enviar apenas para jogadores da partida
  if (matchId) {
    this.sendTargetedMessage(message, matchId);
  } else {
    // Broadcast geral apenas quando necessário
    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('❌ Erro ao enviar mensagem:', error);
        }
      }
    });
  }
}

// ✅ NOVO: Método para envio direcionado
private async sendTargetedMessage(message: any, matchId: number): Promise<void> {
  try {
    const match = await this.dbManager.getCustomMatchById(matchId);
    if (!match) return;

    let allPlayersInMatch: string[] = [];
    try {
      const team1 = typeof match.team1_players === 'string'
        ? JSON.parse(match.team1_players)
        : (match.team1_players || []);
      const team2 = typeof match.team2_players === 'string'
        ? JSON.parse(match.team2_players)
        : (match.team2_players || []);

      allPlayersInMatch = [...team1, ...team2];
    } catch (error) {
      console.error(`❌ Erro ao parsear jogadores da partida ${matchId}:`, error);
      return;
    }

    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        const clientInfo = (client as any).playerInfo;
        const isIdentified = (client as any).isIdentified;

        if (isIdentified && clientInfo) {
          const isInMatch = this.isPlayerInMatch(clientInfo, allPlayersInMatch);
          if (isInMatch) {
            try {
              client.send(JSON.stringify(message));
            } catch (error) {
              console.error('❌ Erro ao enviar mensagem direcionada:', error);
            }
          }
        }
      }
    });
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem direcionada para partida ${matchId}:`, error);
  }
}
```

### 2. **Solução de Robustez: Sistema de Retry e Fallback**

#### 2.1 Implementar Retry para Notificações Falhadas

```typescript
// ✅ NOVO: Sistema de retry para notificações
private async sendNotificationWithRetry(message: any, allPlayersInMatch: string[], maxRetries: number = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const wsResults = await this.sendWebSocketNotifications(message, allPlayersInMatch);
    
    const missingPlayers = allPlayersInMatch.filter(player => 
      !wsResults.notifiedPlayers.includes(player)
    );

    if (missingPlayers.length === 0) {
      console.log(`✅ [MatchFound] Todas as notificações enviadas com sucesso na tentativa ${attempt}`);
      return;
    }

    console.warn(`⚠️ [MatchFound] Tentativa ${attempt}: ${missingPlayers.length} jogadores não notificados:`, missingPlayers);

    if (attempt < maxRetries) {
      // Aguardar antes da próxima tentativa
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  // Última tentativa: fallback via banco de dados
  console.error(`❌ [MatchFound] Falha após ${maxRetries} tentativas, usando fallback`);
  await this.sendFallbackNotifications(message.matchId, allPlayersInMatch);
}
```

#### 2.2 Melhorar Sistema de Fallback

```typescript
// ✅ MELHORADO: Sistema de fallback via banco de dados
private async sendFallbackNotifications(matchId: number, missingPlayers: string[]): Promise<void> {
  console.log(`🔄 [MatchFound] Iniciando fallback para ${missingPlayers.length} jogadores`);

  try {
    // Salvar notificação pendente no banco
    await this.dbManager.savePendingNotification(matchId, {
      type: 'match_found',
      players: missingPlayers,
      timestamp: new Date(),
      retryCount: 0
    });

    console.log(`✅ [MatchFound] Notificação pendente salva no banco para ${missingPlayers.length} jogadores`);
  } catch (error) {
    console.error('❌ [MatchFound] Erro ao salvar notificação pendente:', error);
  }
}
```

### 3. **Solução de Sincronização: Polling Inteligente**

#### 3.1 Implementar Polling no Frontend

```typescript
// ✅ NOVO: Polling inteligente no frontend
private startIntelligentPolling(): void {
  setInterval(async () => {
    if (this.isInQueue && !this.showMatchFound) {
      // Verificar se há partidas pendentes
      try {
        const response = await this.apiService.checkPendingMatches();
        if (response.hasPendingMatch) {
          console.log('🔄 [App] Partida pendente detectada via polling');
          this.handleMatchFound(response.matchData);
        }
      } catch (error) {
        console.error('❌ [App] Erro no polling:', error);
      }
    }
  }, 5000); // Verificar a cada 5 segundos
}
```

#### 3.2 Endpoint de Verificação de Partidas Pendentes

```typescript
// ✅ NOVO: Endpoint para verificar partidas pendentes
app.get('/api/matchmaking/check-pending-matches', (async (req: Request, res: Response) => {
  try {
    const summonerName = req.query.summonerName as string;
    if (!summonerName) {
      return res.status(400).json({ error: 'summonerName é obrigatório' });
    }

    // Buscar partidas pendentes onde o jogador está
    const pendingMatches = await dbManager.getPendingMatchesForPlayer(summonerName);
    
    if (pendingMatches.length > 0) {
      const latestMatch = pendingMatches[0];
      return res.json({
        hasPendingMatch: true,
        matchData: {
          matchId: latestMatch.id,
          // ... outros dados da partida
        }
      });
    }

    res.json({ hasPendingMatch: false });
  } catch (error: any) {
    console.error('❌ Erro ao verificar partidas pendentes:', error);
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);
```

### 4. **Solução de Monitoramento: Melhorar Detecção de Mudanças**

#### 4.1 Implementar Webhooks Virtuais

```typescript
// ✅ NOVO: Sistema de webhooks virtuais via polling otimizado
private startOptimizedMonitoring(): void {
  let lastMatchStatus = new Map<number, string>();
  
  setInterval(async () => {
    try {
      const activeMatches = await this.dbManager.getActiveCustomMatches();
      
      for (const match of activeMatches) {
        const lastStatus = lastMatchStatus.get(match.id);
        const currentStatus = match.status;
        
        if (lastStatus !== currentStatus) {
          console.log(`🔄 [Monitor] Mudança de status detectada: ${match.id} ${lastStatus} → ${currentStatus}`);
          
          // Processar mudança de status
          await this.handleStatusChange(match.id, lastStatus, currentStatus);
          
          // Atualizar status local
          lastMatchStatus.set(match.id, currentStatus);
        }
      }
    } catch (error) {
      console.error('❌ [Monitor] Erro no monitoramento otimizado:', error);
    }
  }, 2000); // Verificar a cada 2 segundos
}
```

## Implementação Recomendada

### Fase 1: Correções Críticas (Imediato)

1. ✅ Corrigir `sendWebSocketNotifications` para envio direcionado
2. ✅ Corrigir `broadcastMessage` no DraftService
3. ✅ Remover fallbacks perigosos para clientes não identificados

### Fase 2: Sistema de Retry (Curto Prazo)

1. ✅ Implementar sistema de retry para notificações
2. ✅ Melhorar sistema de fallback via banco de dados
3. ✅ Adicionar logs detalhados para debugging

### Fase 3: Polling Inteligente (Médio Prazo)

1. ✅ Implementar polling no frontend
2. ✅ Criar endpoint de verificação de partidas pendentes
3. ✅ Otimizar monitoramento de mudanças de status

### Fase 4: Monitoramento Avançado (Longo Prazo)

1. ✅ Implementar webhooks virtuais
2. ✅ Sistema de métricas de sincronização
3. ✅ Dashboard de monitoramento de sincronização

## Métricas de Sucesso

### Antes da Correção

- ❌ Apenas 1 jogador recebe `match_found`
- ❌ Apenas 1 jogador inicia draft
- ❌ Sincronização via MySQL não funciona

### Após a Correção

- ✅ Todos os 10 jogadores recebem `match_found`
- ✅ Todos os 10 jogadores iniciam draft simultaneamente
- ✅ Sincronização via MySQL funciona como backup
- ✅ Sistema de retry garante entrega
- ✅ Polling inteligente como fallback

## Conclusão

O problema principal está no sistema de notificações WebSocket que não está enviando mensagens de forma direcionada para os jogadores corretos. A solução envolve:

1. **Correção imediata** do sistema de notificações
2. **Implementação de retry** para garantir entrega
3. **Sistema de polling** como fallback
4. **Monitoramento otimizado** para detectar mudanças

Com essas correções, todos os jogadores devem receber as notificações simultaneamente e a sincronização via MySQL funcionará corretamente como fonte única de verdade.
