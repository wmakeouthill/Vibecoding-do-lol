# Correção: Cancelamento de Draft com Limpeza Completa

## 🚨 Problema Identificado

Quando alguém cancela o draft, a partida não estava sendo apagada do banco de dados e o bot do Discord não estava limpando os canais que cria quando a partida é aceita, nem movendo os jogadores de volta para o canal de origem.

## 🔍 Causa Raiz

O método `cancelDraft` no `DraftService` estava apenas atualizando o status da partida para 'cancelled' e notificando o frontend, mas não estava:

1. Limpando os canais do Discord
2. Apagando a partida do banco de dados
3. Movendo jogadores de volta ao canal de origem

### Fluxo Problemático

1. Usuário cancela draft → exitDraft() no frontend
2. WebSocket 'cancel_draft' → server.ts
3. matchmakingService.cancelDraft() → draftService.cancelDraft()
4. ❌ FALHA: Apenas atualiza status para 'cancelled'
5. ❌ FALHA: Não limpa Discord
6. ❌ FALHA: Não apaga do banco
7. Resultado: Canais do Discord ficam órfãos, partida permanece no banco

## ✅ Correção Implementada

### 1. **Método cancelDraft Corrigido**

**Arquivo:** `src/backend/services/DraftService.ts`

```typescript
// ✅ CORRIGIDO: Cancelar draft com limpeza completa
async cancelDraft(matchId: number, reason: string): Promise<void> {
  console.log(`🚫 [DraftPickBan] ========== INÍCIO DO CANCELAMENTO DE DRAFT ==========`);
  console.log(`🚫 [DraftPickBan] Cancelando draft ${matchId}: ${reason}`);

  try {
    // 1. ✅ NOVO: Limpar canais do Discord ANTES de apagar do banco
    if (this.discordService) {
      try {
        console.log(`🤖 [DraftPickBan] ========== INICIANDO LIMPEZA DISCORD ==========`);
        console.log(`🤖 [DraftPickBan] Limpando canais do Discord para draft cancelado ${matchId}...`);
        console.log(`🤖 [DraftPickBan] Chamando discordService.cleanupMatchByCustomId(${matchId})...`);

        await this.discordService.cleanupMatchByCustomId(matchId);

        console.log(`🤖 [DraftPickBan] ========== LIMPEZA DISCORD CONCLUÍDA ==========`);
        console.log(`🤖 [DraftPickBan] Canais do Discord limpos para draft ${matchId}`);
      } catch (discordError) {
        console.error(`❌ [DraftPickBan] Erro ao limpar Discord para draft cancelado ${matchId}:`, discordError);
        console.error(`❌ [DraftPickBan] Stack trace:`, (discordError as Error).stack);
      }
    } else {
      console.warn(`⚠️ [DraftPickBan] DiscordService não disponível para limpar draft cancelado ${matchId}`);
    }

    // 2. ✅ NOVO: Apagar partida do banco de dados
    console.log(`🗄️ [DraftPickBan] ========== INICIANDO LIMPEZA BANCO ==========`);
    try {
      await this.dbManager.deleteCustomMatch(matchId);
      console.log(`✅ [DraftPickBan] Partida ${matchId} apagada do banco de dados`);
    } catch (dbError) {
      console.error(`❌ [DraftPickBan] Erro ao apagar partida ${matchId} do banco:`, dbError);
      // Tentar apenas atualizar status como fallback
      try {
        await this.dbManager.updateCustomMatchStatus(matchId, 'cancelled');
        console.log(`⚠️ [DraftPickBan] Fallback: Status da partida ${matchId} atualizado para 'cancelled'`);
      } catch (statusError) {
        console.error(`❌ [DraftPickBan] Erro no fallback ao atualizar status:`, statusError);
      }
    }

    // 3. Parar timer
    this.stopTimer(matchId);

    // 4. Remover do tracking local
    this.activeDrafts.delete(matchId);

    // 5. Notificar frontend
    if (this.wss) {
      const message = {
        type: 'draft_cancelled',
        data: { matchId, reason },
        timestamp: Date.now()
      };
      this.broadcastMessage(message, matchId);
    }

    console.log(`✅ [DraftPickBan] ========== DRAFT ${matchId} CANCELADO COM SUCESSO ==========`);

  } catch (error) {
    console.error(`❌ [DraftPickBan] Erro ao cancelar draft:`, error);
    throw error;
  }
}
```

## 🔄 Fluxo Corrigido

### Fluxo Após a Correção

1. Usuário cancela draft → exitDraft() no frontend
2. WebSocket 'cancel_draft' → server.ts
3. matchmakingService.cancelDraft() → draftService.cancelDraft()
4. ✅ NOVO: Limpar canais do Discord (mover jogadores de volta)
5. ✅ NOVO: Apagar partida do banco de dados
6. ✅ NOVO: Parar timer e limpar tracking local
7. ✅ NOVO: Notificar frontend sobre cancelamento
8. Resultado: Limpeza completa do sistema

## 📋 Funcionalidades Implementadas

### 1. **Limpeza do Discord**

- Chama `discordService.cleanupMatchByCustomId(matchId)`
- Move jogadores de volta ao canal de origem
- Remove canais temporários criados para a partida
- Logs detalhados para debugging

### 2. **Limpeza do Banco de Dados**

- Chama `dbManager.deleteCustomMatch(matchId)`
- Remove completamente a partida do banco
- Fallback para atualizar status se falhar
- Logs detalhados para debugging

### 3. **Limpeza Local**

- Para timer da partida
- Remove do tracking local (`activeDrafts`)
- Notifica frontend via WebSocket

### 4. **Tratamento de Erros**

- Continua processamento mesmo se Discord falhar
- Fallback para atualizar status se apagar falhar
- Logs detalhados para cada etapa

## 🎯 Resultado Esperado

- ✅ Canais do Discord são limpos corretamente
- ✅ Jogadores são movidos de volta ao canal de origem
- ✅ Partida é apagada do banco de dados
- ✅ Sistema fica limpo para novas partidas
- ✅ Logs detalhados para monitoramento

## 🔧 Teste da Correção

Para testar a correção:

1. **Iniciar uma partida** e aceitar
2. **Iniciar o draft**
3. **Cancelar o draft** pelo frontend
4. **Verificar logs** do DraftService:

   ```mermaid
   🚫 [DraftPickBan] ========== INÍCIO DO CANCELAMENTO DE DRAFT ==========
   🤖 [DraftPickBan] ========== INICIANDO LIMPEZA DISCORD ==========
   🤖 [DraftPickBan] Canais do Discord limpos para draft X
   🗄️ [DraftPickBan] ========== INICIANDO LIMPEZA BANCO ==========
   ✅ [DraftPickBan] Partida X apagada do banco de dados
   ✅ [DraftPickBan] ========== DRAFT X CANCELADO COM SUCESSO ==========
   ```

5. **Verificar no Discord** se jogadores foram movidos de volta
6. **Verificar no banco** se partida foi apagada

## 📝 Observações

- **Ordem de limpeza:** Discord primeiro, depois banco (para garantir que dados estejam disponíveis)
- **Tratamento robusto:** Continua mesmo se algumas etapas falharem
- **Logs detalhados:** Para facilitar debugging e monitoramento
- **Fallback:** Atualiza status se não conseguir apagar do banco
- **Compatibilidade:** Mantém estrutura existente dos serviços
