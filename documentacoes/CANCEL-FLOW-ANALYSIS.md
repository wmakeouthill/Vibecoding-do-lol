# Análise dos Fluxos de Cancelamento - Draft vs Game-in-Progress

## Resumo Executivo

Após uma análise profunda do código, **ambos os fluxos de cancelamento (draft e game-in-progress) estão implementados corretamente** e seguem a mesma lógica:

1. **Discord cleanup acontece ANTES da deleção do banco de dados**
2. **Jogadores são movidos de volta aos canais originais**
3. **Canais do Discord são deletados**
4. **Partida é removida do banco de dados**
5. **Frontend é notificado**

## Fluxo de Cancelamento do Draft

### Frontend

```mermaid
1. Usuário clica "Cancelar" no modal de confirmação
2. draft-confirmation-modal.ts: cancelFinalDraft() → onCancel.emit()
3. custom-pick-ban.ts: cancelFinalDraft() → onPickBanCancel.emit()
4. app.ts: exitDraft() → WebSocket 'cancel_draft'
```

### Backend

```mermaid
1. server.ts: handleWebSocketMessage('cancel_draft')
2. matchmakingService.cancelDraft(matchId, reason)
3. draftService.cancelDraft(matchId, reason)
4. discordService.cleanupMatchByCustomId(matchId) ← DISCORD CLEANUP
5. dbManager.deleteCustomMatch(matchId) ← DATABASE DELETION
6. notifyDraftCancelled(matchId, reason)
```

## Fluxo de Cancelamento do Game-in-Progress

### Frontend2

```mermaid
1. Usuário clica "Cancelar Partida" no game-in-progress
2. game-in-progress.ts: cancelGame() → onGameCancel.emit()
3. app.ts: onGameCancel() → WebSocket 'cancel_game_in_progress'
```

### Backend2

```mermaid
1. server.ts: handleWebSocketMessage('cancel_game_in_progress')
2. matchmakingService.cancelGameInProgress(matchId, reason)
3. gameInProgressService.cancelGame(matchId, reason)
4. discordService.cleanupMatchByCustomId(matchId) ← DISCORD CLEANUP
5. dbManager.deleteCustomMatch(matchId) ← DATABASE DELETION
6. notifyGameCancelled(matchId, reason)
```

## Detalhes da Implementação

### DiscordService.cleanupMatchByCustomId()

```typescript
async cleanupMatchByCustomId(matchId: number): Promise<void> {
  // 1. Buscar match no tracking local
  const match = this.activeMatches.get(matchId.toString());
  
  // 2. Realizar limpeza
  await this.performCleanup(matchIdString, match);
}
```

### DiscordService.performCleanup()

```typescript
private async performCleanup(matchIdString: string, match: DiscordMatch): Promise<void> {
  // 1. Mover jogadores de volta aos canais de origem
  await this.movePlayersBackToOrigin(matchIdString);
  
  // 2. Deletar canais do Discord
  for (const channelId of channelsToDelete) {
    await channel.delete(`Cleanup for match ${matchIdString}`);
  }
  
  // 3. Remover do tracking local
  this.activeMatches.delete(matchIdString);
}
```

### DiscordService.movePlayersBackToOrigin()

```typescript
private async movePlayersBackToOrigin(matchId: string): Promise<void> {
  // Para cada jogador no match:
  // 1. Buscar canal original
  const originalChannelId = match.originalChannels.get(discordId);
  
  // 2. Mover jogador de volta
  await member.voice.setChannel(originalChannel);
  
  // 3. Fallback para canal de matchmaking se original não existir
}
```

## Verificações de Segurança

### Frontend (app.ts)

```typescript
onGameCancel(): void {
  // Busca robusta por matchId em múltiplas localizações:
  // 1. originalMatchId (mais confiável)
  // 2. matchId direto
  // 3. matchId aninhado em gameData
  // 4. matchId do gameData do backend
  // 5. Busca profunda em todos os objetos aninhados
  // 6. Fallback para lastMatchId
  
  // Enviar mensagem WebSocket
  this.apiService.sendWebSocketMessage({
    type: 'cancel_game_in_progress',
    data: { matchId: matchIdToUse, reason: 'Cancelado pelo usuário' }
  });
}
```

### Backend (GameInProgressService)

```typescript
async cancelGame(matchId: number, reason: string): Promise<void> {
  try {
    // 1. DISCORD CLEANUP PRIMEIRO
    if (this.discordService) {
      await this.discordService.cleanupMatchByCustomId(matchId);
    }
    
    // 2. DEPOIS LIMPEZA DO BANCO
    await this.dbManager.updateCustomMatchStatus(matchId, 'cancelled');
    await this.dbManager.deleteCustomMatch(matchId);
    
    // 3. Limpeza local
    this.activeGames.delete(matchId);
    
    // 4. Notificar frontend
    this.notifyGameCancelled(matchId, reason);
  } catch (error) {
    console.error('Erro no cancelamento:', error);
    throw error;
  }
}
```

## Logs Detalhados

### Frontend3

```mermaid
🚪 [App] ========== INÍCIO DO onGameCancel ==========
🔍 [App] DEBUG - gameData: {...}
📤 [App] Usando originalMatchId: 123
📤 [App] Enviando cancelamento de jogo para backend: 123
✅ [App] Mensagem de cancelamento enviada para backend
```

### Backend3

```mermaid
❌ [WebSocket] Recebida mensagem cancel_game_in_progress: {matchId: 123, reason: "Cancelado pelo usuário"}
🔄 [WebSocket] Chamando matchmakingService.cancelGameInProgress...
🚫 [GameInProgress] ========== INÍCIO DO CANCELAMENTO ==========
🤖 [GameInProgress] ========== INICIANDO LIMPEZA DISCORD ==========
🔍 [cleanupMatchByCustomId] ========== INÍCIO DA LIMPEZA ==========
✅ [cleanupMatchByCustomId] Match 123 encontrado, iniciando limpeza...
🔄 [performCleanup] ========== INICIANDO PERFORM CLEANUP ==========
🏠 [movePlayersBackToOrigin] ========== INICIANDO MOVIMENTAÇÃO ==========
✅ [movePlayersBackToOrigin] Resumo: 10 jogadores movidos, 0 erros
🗑️ [performCleanup] ========== DELETANDO CANAIS ==========
✅ [performCleanup] Canal Time Azul (123456) deletado com sucesso
✅ [performCleanup] Canal Time Vermelho (123457) deletado com sucesso
✅ [performCleanup] Categoria Match 123 (123458) deletada com sucesso
✅ [performCleanup] ========== PERFORM CLEANUP CONCLUÍDO COM SUCESSO ==========
🗄️ [GameInProgress] ========== INICIANDO LIMPEZA BANCO ==========
🗄️ [GameInProgress] Deletando partida do banco
✅ [GameInProgress] ========== CANCELAMENTO CONCLUÍDO COM SUCESSO ==========
```

## Conclusão

**O fluxo de cancelamento do game-in-progress está implementado corretamente e segue exatamente a mesma lógica do draft:**

1. ✅ **Discord cleanup acontece ANTES da deleção do banco**
2. ✅ **Jogadores são movidos de volta aos canais originais**
3. ✅ **Canais do Discord são deletados**
4. ✅ **Partida é removida do banco de dados**
5. ✅ **Frontend é notificado**

### Possíveis Causas de Problemas

Se o cancelamento não estiver funcionando, verifique:

1. **DiscordService inicializado**: Verifique se o bot do Discord está conectado
2. **MatchId correto**: Verifique se o frontend está enviando o matchId correto
3. **Permissões do bot**: Verifique se o bot tem permissões para mover usuários e deletar canais
4. **Logs do servidor**: Monitore os logs para identificar onde o processo falha

### Teste de Verificação

Execute o script de teste para verificar se o fluxo está funcionando:

```bash
node test-discord-cleanup.js
```

Este script simula um cancelamento de jogo e verifica se o servidor responde corretamente.
