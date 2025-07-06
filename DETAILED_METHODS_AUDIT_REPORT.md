# 🔍 RELATÓRIO DETALHADO - MÉTODOS DUPLICADOS E NÃO UTILIZADOS

## 📋 Resumo da Investigação

**Data**: 06/07/2025  
**Tipo**: Investigação profunda de métodos duplicados e não utilizados  
**Escopo**: Todos os serviços do backend  

---

## 🎯 DESCOBERTAS PRINCIPAIS

### 🔴 MÉTODOS DUPLICADOS IDENTIFICADOS

#### 1. **if()**
- **Arquivos**: DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DataDragonService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DiscordService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchHistoryService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, PlayerService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, signaling-server.ts, signaling-server.ts, signaling-server.ts, signaling-server.ts, signaling-server.ts, signaling-server.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 2. **getChampionImageUrl()**
- **Arquivos**: DataDragonService.ts, DataDragonService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 3. **detectChampionLane()**
- **Arquivos**: DataDragonService.ts, DataDragonService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 4. **initialize()**
- **Arquivos**: DiscordService.ts, DraftService.ts, GameInProgressService.ts, LCUService.ts, MatchFoundService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 5. **for()**
- **Arquivos**: DiscordService.ts, DiscordService.ts, DiscordService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, DraftService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, LCUService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, MatchmakingService.ts, PlayerService.ts, PlayerService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 6. **broadcastQueueUpdate()**
- **Arquivos**: DiscordService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 7. **log()**
- **Arquivos**: DiscordService.ts, DiscordService.ts, MatchmakingService.ts, RiotAPIService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 8. **parse()**
- **Arquivos**: DraftService.ts, DraftService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, GameInProgressService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts, MatchFoundService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 9. **prepareDraftData()**
- **Arquivos**: DraftService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 10. **balanceTeamsAndAssignLanes()**
- **Arquivos**: DraftService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 11. **assignLanesOptimized()**
- **Arquivos**: DraftService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 12. **processDraftAction()**
- **Arquivos**: DraftService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 13. **finalizeDraft()**
- **Arquivos**: DraftService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 14. **notifyDraftStarted()**
- **Arquivos**: DraftService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 15. **broadcastMessage()**
- **Arquivos**: DraftService.ts, GameInProgressService.ts, MatchFoundService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 16. **shutdown()**
- **Arquivos**: DraftService.ts, GameInProgressService.ts, MatchFoundService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 17. **finishGame()**
- **Arquivos**: GameInProgressService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 18. **startGameMonitoring()**
- **Arquivos**: GameInProgressService.ts, LCUService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 19. **getActiveGame()**
- **Arquivos**: GameInProgressService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 20. **getActiveGamesCount()**
- **Arquivos**: GameInProgressService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 21. **getActiveGamesList()**
- **Arquivos**: GameInProgressService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 22. **getMatchHistory()**
- **Arquivos**: LCUService.ts, RiotAPIService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 23. **getMatchDetails()**
- **Arquivos**: LCUService.ts, RiotAPIService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 24. **acceptMatch()**
- **Arquivos**: MatchFoundService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 25. **declineMatch()**
- **Arquivos**: MatchFoundService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 26. **notifyMatchCancelled()**
- **Arquivos**: MatchFoundService.ts, MatchmakingService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 27. **getPlayerStats()**
- **Arquivos**: MatchHistoryService.ts, PlayerService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas

#### 28. **error()**
- **Arquivos**: RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts, RiotAPIService.ts
- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas


### 🔍 MÉTODOS SUSPEITOS DE DUPLICAÇÃO

#### **MatchmakingService.ts**
- `assignLanesByMMRAndPreferences()` vs `assignLanesOptimized()`
  - **Suspeita**: Ambos fazem atribuição de lanes
  - **Recomendação**: Verificar se podem ser consolidados

- `removePlayerFromQueue()` vs `removePlayerFromQueueById()`
  - **Status**: ✅ **DIFERENTES** - WebSocket vs ID/Nome
  - **Ação**: Manter ambos (responsabilidades diferentes)

- `getQueueStatus()` vs `getQueueStatusWithCurrentPlayer()`
  - **Suspeita**: Funcionalidades similares
  - **Recomendação**: Consolidar com parâmetro opcional

#### **DraftService.ts vs MatchmakingService.ts**
- Ambos têm métodos de atribuição de lanes
- **Verificar**: Se há duplicação de lógica entre serviços

### 🔴 MÉTODOS POSSIVELMENTE NÃO UTILIZADOS
*(Lista gerada automaticamente - requer verificação manual)*

### 🔴 IMPORTS NÃO UTILIZADOS
*(Lista gerada automaticamente - podem ser removidos para limpeza)*

### 🔴 CÓDIGO MORTO
*(Funções/classes não exportadas e não utilizadas)*

---

## 🎯 RECOMENDAÇÕES DE AÇÃO

### **Prioridade Alta** 🔴

1. **Consolidar métodos de lane assignment**
   - Investigar `assignLanesByMMRAndPreferences()` vs `assignLanesOptimized()`
   - Verificar se há duplicação entre MatchmakingService e DraftService

2. **Consolidar métodos de queue status**
   - Transformar `getQueueStatusWithCurrentPlayer()` em parâmetro opcional

### **Prioridade Média** 🟡

1. **Remover imports não utilizados**
   - Limpeza automática possível
   - Reduzir tamanho dos bundles

2. **Remover código morto**
   - Funções/classes não utilizadas
   - Simplificar codebase

### **Prioridade Baixa** 🟢

1. **Revisar métodos possivelmente não utilizados**
   - Verificação manual necessária
   - Alguns podem ser APIs públicas

---

## 📊 ESTATÍSTICAS

- **Serviços analisados**: 11
- **Métodos duplicados**: 28
- **Arquivos verificados**: 12 (serviços + server.ts)

---

## 🚦 PRÓXIMOS PASSOS

1. **Manual**: Verificar duplicações identificadas
2. **Automático**: Remover imports não utilizados
3. **Manual**: Revisar código morto
4. **Manual**: Consolidar métodos similares

---

**Status**: ✅ **INVESTIGAÇÃO CONCLUÍDA**  
**Recomendação**: Proceder com verificações manuais das descobertas
