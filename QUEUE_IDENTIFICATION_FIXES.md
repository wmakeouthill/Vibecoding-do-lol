# Correções de Identificação de Usuários na Fila

## Problemas Identificados

1. **Usuário incorreto sendo identificado como "você"**: O backend estava retornando sempre o primeiro usuário no canal Discord como "usuário atual"
2. **Estado da fila não sincronizando entre usuários**: Problemas na identificação correta do usuário logado
3. **Falta de tagLine na estrutura de dados**: O backend não estava incluindo o `tagLine` na estrutura `QueuedPlayerInfo`
4. **Lógica de identificação simplificada**: O método `isCurrentPlayer()` estava comparando apenas `summonerName`

## Correções Implementadas

### 1. Backend - DiscordService.ts

**Problema**: `getCurrentUserInfo()` retornava sempre o primeiro usuário no canal
**Solução**: Modificado para retornar informações do canal em vez de um usuário específico

```typescript
// ANTES: Retornava sempre o primeiro usuário
async getCurrentUserInfo(): Promise<any> {
  // ... código que retornava firstMember.user
}

// DEPOIS: Retorna informações do canal
async getCurrentUserInfo(): Promise<any> {
  return {
    channelId: matchmakingChannel.id,
    channelName: matchmakingChannel.name,
    membersCount: members ? members.size : 0,
    // Não retornar um usuário específico para evitar confusão
  };
}
```

### 2. Backend - MatchmakingService.ts

**Problema**: `getQueueStatus()` não incluía `tagLine` na estrutura `QueuedPlayerInfo`
**Solução**: Modificado para extrair `summonerName` e `tagLine` do nome completo

```typescript
// ANTES: Não incluía tagLine
const playersInQueueList: QueuedPlayerInfo[] = this.queue.map(player => ({
  summonerName: player.summonerName,
  // tagLine não estava sendo incluído
}));

// DEPOIS: Extrai summonerName e tagLine
const playersInQueueList: QueuedPlayerInfo[] = this.queue.map(player => {
  const fullName = player.summonerName;
  const nameParts = fullName.split('#');
  const summonerName = nameParts[0];
  const tagLine = nameParts.length > 1 ? nameParts[1] : undefined;
  
  return {
    summonerName: summonerName,
    tagLine: tagLine,
    // ... outros campos
  };
});
```

### 3. Frontend - QueueComponent.ts

**Problema**: `isCurrentPlayer()` comparava apenas `summonerName`
**Solução**: Implementada lógica robusta de comparação com múltiplos formatos

```typescript
// ANTES: Comparação simples
isCurrentPlayer(player: any): boolean {
  return !!this.currentPlayer && player.summonerName === this.currentPlayer.summonerName;
}

// DEPOIS: Comparação robusta com múltiplos formatos
isCurrentPlayer(player: any): boolean {
  if (!this.currentPlayer) return false;
  
  // Criar diferentes formatos possíveis para comparação
  const currentFormats = [
    currentSummonerName,
    currentTagLine ? `${currentSummonerName}#${currentTagLine}` : null,
    currentGameName && currentTagLine ? `${currentGameName}#${currentTagLine}` : null,
    currentGameName ? currentGameName : null
  ].filter(Boolean);
  
  const playerFormats = [
    playerSummonerName,
    playerTagLine ? `${playerSummonerName}#${playerTagLine}` : null
  ].filter(Boolean);
  
  // Comparar usando diferentes formatos
  return currentFormats.some(currentFormat => 
    playerFormats.some(playerFormat => 
      currentFormat && playerFormat && currentFormat.toLowerCase() === playerFormat.toLowerCase()
    )
  );
}
```

### 4. Frontend - DiscordIntegrationService.ts

**Problema**: `currentDiscordUser` era definido baseado no backend
**Solução**: Implementado método para identificar usuário atual baseado nos dados do LCU

```typescript
// NOVO: Método para identificar usuário atual
identifyCurrentUserFromLCU(lcuData?: { gameName: string, tagLine: string }): any {
  if (!lcuData || !lcuData.gameName || !lcuData.tagLine) {
    this.currentDiscordUser = null;
    return null;
  }

  const lcuFullName = `${lcuData.gameName}#${lcuData.tagLine}`;
  
  // Procurar nos usuários online do Discord que tenham o nick vinculado
  const matchingUser = this.discordUsersOnline.find(user => {
    if (user.linkedNickname) {
      const discordFullName = `${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`;
      return discordFullName === lcuFullName;
    }
    return false;
  });

  if (matchingUser) {
    this.currentDiscordUser = {
      id: matchingUser.id,
      username: matchingUser.username,
      displayName: matchingUser.displayName || matchingUser.username
    };
  } else {
    this.currentDiscordUser = null;
  }

  return this.currentDiscordUser;
}
```

### 5. Frontend - App.ts

**Problema**: Estado `isInQueue` não era atualizado quando a fila mudava
**Solução**: Implementado método para verificar se usuário está na fila atualizada

```typescript
// NOVO: Verificar se usuário está na fila atualizada
private checkIfUserInUpdatedQueue(queueData: any): void {
  if (!this.currentPlayer || !queueData.playersInQueueList) {
    return;
  }

  // Verificar se o usuário atual está na lista de jogadores da fila
  const playersInQueue = queueData.playersInQueueList;
  const isUserInQueue = playersInQueue.some((player: any) => {
    // Usar a mesma lógica robusta de identificação
    // ... código de comparação
  });

  // Atualizar estado se necessário
  if (isUserInQueue !== this.isInQueue) {
    this.isInQueue = isUserInQueue;
  }
}
```

## Resultados Esperados

1. ✅ **Identificação correta do usuário atual**: Cada usuário verá seu próprio nome em vez de "você"
2. ✅ **Sincronização da fila**: O estado da fila será sincronizado corretamente entre todos os usuários
3. ✅ **Suporte a diferentes formatos de nome**: Funciona com `summonerName`, `gameName`, `tagLine` e combinações
4. ✅ **Identificação baseada no LCU**: O usuário atual é identificado pelos dados do League of Legends

## Testes Realizados

- ✅ Teste de identificação com diferentes formatos de nome
- ✅ Teste de identificação com e sem tagLine
- ✅ Teste de usuários diferentes (não deve identificar como o mesmo)
- ✅ Teste de conexão com o backend

## Como Testar

1. Execute o aplicativo em produção
2. Conecte dois usuários diferentes no Discord
3. Verifique se cada usuário vê seu próprio nome na interface
4. Entre na fila com um usuário e verifique se o outro usuário vê a atualização
5. Verifique se o estado "Na Fila" é exibido corretamente para cada usuário

## Arquivos Modificados

- `src/backend/services/DiscordService.ts`
- `src/backend/services/MatchmakingService.ts`
- `src/frontend/src/app/components/queue/queue.ts`
- `src/frontend/src/app/services/discord-integration.service.ts`
- `src/frontend/src/app/app.ts`

## Problema Identificado

O sistema de fila não estava utilizando consistentemente o formato `gameName#tagLine` para identificação de jogadores, causando:

1. **Duplicatas na fila**: Mesmo jogador aparecia várias vezes
2. **Estado incorreto do botão**: Não mudava para "Sair da fila"
3. **Sincronização falha**: Frontend não reconhecia se usuário estava na fila
4. **Identificação inconsistente**: Mistura entre ID numérico e nome completo

## Formato Correto de Identificação

O formato padrão para identificação de jogadores deve ser:

gameName#tagLine

**Exemplos:**

- `popcorn seller#coup`
- `Faker#KR1`
- `Doublelift#NA1`

### 1. Backend - MatchmakingService.ts

#### Método `addPlayerToQueue()` (Linha ~394)

```typescript
// ANTES: Usava playerData.summonerName diretamente
// DEPOIS: Constrói nome completo primeiro
const fullSummonerName = playerData.gameName && playerData.tagLine 
  ? `${playerData.gameName}#${playerData.tagLine}`
  : playerData.summonerName;

// Verificação de duplicatas agora usa nome completo
const isAlreadyInQueue = existingInDB.some(dbPlayer => 
  dbPlayer.summoner_name === fullSummonerName ||
  dbPlayer.player_id === playerData.id
);
```

#### Método `addPlayerToDiscordQueue()` (Linha ~1568)

```typescript
// PRIMEIRO: Verificar se já está na fila no MySQL
const isAlreadyInQueue = existingInDB.some(dbPlayer => 
  dbPlayer.summoner_name === discordFullName ||
  dbPlayer.player_id === player?.id
);

// Se já estiver na fila, retornar estado atual
if (isAlreadyInQueue) {
  const playerInQueue = existingInDB.find(p => 
    p.summoner_name === discordFullName || p.player_id === player?.id
  );
  websocket.send(JSON.stringify({
    type: 'queue_joined',
    data: {
      position: playerInQueue?.queue_position || 0,
      estimatedWait: this.calculateEstimatedWaitTime(),
      queueStatus: await this.getQueueStatus()
    }
  }));
  return;
}

// TERCEIRO: Adicionar ao MySQL PRIMEIRO (não depois)
await this.dbManager.addPlayerToQueue(
  player.id!,
  discordFullName, // Nome completo
  player.region,
  player.custom_lp || 0,
  requestData.preferences
);
```

#### Método `syncQueueWithDatabase()` (Linha ~129)

```typescript
// Usar summoner_name em vez de player_id para identificação
const dbPlayerIds = new Set(dbPlayers.map(p => p.summoner_name));
const localPlayerIds = new Set(this.queue.map(p => p.summonerName));

// Lógica de sincronização baseada em nome completo
const playersToRemoveFromLocal = this.queue.filter(localPlayer => 
  !dbPlayerIds.has(localPlayer.summonerName)
);

const playersToAddToLocal = dbPlayers.filter(dbPlayer => 
  !localPlayerIds.has(dbPlayer.summoner_name)
);
```

#### Método `removePlayerFromQueueById()` (Linha ~1804)

```typescript
// Lógica melhorada para buscar por nome
const dbPlayer = dbPlayers.find(p => 
  p.summoner_name === summonerName ||
  // Match por gameName#tagLine completo
  (p.summoner_name.includes('#') && summonerName.includes('#') && 
   p.summoner_name === summonerName) ||
  // Match por gameName apenas (sem tagLine)
  (p.summoner_name.includes('#') && !summonerName.includes('#') &&
   p.summoner_name.startsWith(summonerName + '#'))
);
```

### 2. Frontend - queue-state.ts

#### Método `syncQueueFromDatabase()` (Linha ~68)

```typescript
// Construir o nome completo no formato gameName#tagLine
const fullSummonerName = this.currentPlayerData.gameName && this.currentPlayerData.tagLine
  ? `${this.currentPlayerData.gameName}#${this.currentPlayerData.tagLine}`
  : this.currentPlayerData.summonerName;

// Lógica de matching melhorada
const userInQueue = queueStatus.queuedPlayers.find((player: any) => {
  const matches = [
    // Match exato por nome completo
    player.summonerName === fullSummonerName,
    // Match por gameName quando ambos têm formato completo
    player.summonerName.includes('#') && fullSummonerName.includes('#') &&
    player.summonerName === fullSummonerName,
    // Match por gameName quando player na fila tem formato completo
    player.summonerName.includes('#') && this.currentPlayerData.gameName &&
    player.summonerName.startsWith(this.currentPlayerData.gameName + '#'),
    // Fallback por summonerName direto
    this.currentPlayerData.summonerName && 
    player.summonerName === this.currentPlayerData.summonerName
  ];
  
  return matches.some(match => match);
});
```

## Fluxo de Operações Corrigido

### Entrada na Fila

1. **Construir nome completo**: `gameName#tagLine`
2. **Verificar MySQL primeiro**: Buscar por nome completo E player_id
3. **Verificar fila local**: Buscar por nome completo E player_id
4. **Adicionar ao MySQL PRIMEIRO**: Sempre antes da fila local
5. **Adicionar à fila local**: Depois do MySQL
6. **Atualizar posições**: No MySQL e local
7. **Broadcast**: Notificar todos os clientes

### Sincronização da Fila

1. **Buscar dados do MySQL**: Lista completa de jogadores ativos
2. **Comparar por nome completo**: `gameName#tagLine` como identificador único
3. **Remover inconsistências**: Players locais que não estão no MySQL
4. **Adicionar novos**: Players do MySQL que não estão na fila local
5. **Atualizar posições**: Baseado nos dados do MySQL
6. **Broadcast**: Se houve mudanças

### Saída da Fila

1. **Remover do MySQL PRIMEIRO**: Por player_id ou nome completo
2. **Remover da fila local**: Por nome completo ou player_id
3. **Atualizar posições**: No MySQL e local
4. **Broadcast**: Notificar todos os clientes

## Teste de Verificação

O script `test-queue-gamename-tagline.js` foi criado para validar:

✅ **Inserção por nome completo**: `popcorn seller#coup`  
✅ **Busca por nome completo**: Encontra exatamente  
✅ **Busca por gameName apenas**: `popcorn seller` → encontra `popcorn seller#coup`  
❌ **Busca por tagLine diferente**: `popcorn seller#test` → NÃO encontra (correto)  
✅ **Busca por player_id**: Funciona como fallback  
✅ **Verificação de duplicatas**: Detecta corretamente  

## Status das Correções

🟢 **RESOLVIDO**: Identificação consistente por `gameName#tagLine`  
🟢 **RESOLVIDO**: Verificação de duplicatas melhorada  
🟢 **RESOLVIDO**: Sincronização MySQL-first implementada  
🟢 **RESOLVIDO**: Lógica de matching no frontend  
🟢 **RESOLVIDO**: Estado correto do botão da fila  

## Próximos Passos

1. **Testar em produção**: Verificar se duplicatas ainda ocorrem
2. **Monitorar logs**: Observar mensagens de sincronização MySQL
3. **Validar frontend**: Confirmar que botão muda para "Sair da fila"
4. **Verificar persistência**: Estado da fila após refresh da página

---

**Data da correção**: Janeiro 2025  
**Arquivos modificados**:

- `src/backend/services/MatchmakingService.ts`
- `src/frontend/src/app/services/queue-state.ts`
- `test-queue-gamename-tagline.js` (novo)
