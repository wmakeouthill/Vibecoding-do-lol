# Correção do Cancelamento do Discord na Fase Game-in-Progress

## Problema Identificado

O bot do Discord estava funcionando corretamente ao cancelar partidas na fase de draft, mas não estava sendo chamado para limpar os canais quando a partida era cancelada na fase "game-in-progress".

## Correções Implementadas

### 1. Melhorias no GameInProgressService

- Adicionados logs detalhados para depuração do DiscordService
- Verificação se o match existe no DiscordService antes de tentar limpar
- Implementação de limpeza forçada mesmo se o match não estiver no tracking
- Método alternativo de cancelamento usando `onGameCancel`

### 2. Melhorias no DiscordService

- Melhorado o método `cleanupMatchByCustomId` com logs detalhados
- Busca por variações do matchId se não encontrar a chave exata
- Método auxiliar `performCleanup` para organizar a lógica
- Novos métodos `ensureMatchExists` e `listActiveMatches` para debug

### 3. Melhorias no DraftService

- Verificação se o match continua no DiscordService após finalização do draft
- Recriação automática do match no Discord se necessário

### 4. Endpoints de Debug

- `/api/debug/discord-status` - Verificar status do DiscordService
- `/api/debug/force-cleanup-match` - Forçar limpeza de um match específico

## Como Testar

### 1. Verificar Status do Discord

```bash
curl http://localhost:3000/api/debug/discord-status
```

### 2. Executar Script de Teste

```bash
node test-discord-cleanup.js
```

### 3. Teste Manual

1. Iniciar uma partida e ir até a fase game-in-progress
2. Cancelar a partida
3. Verificar nos logs se aparecem as mensagens de limpeza do Discord
4. Verificar se os canais do Discord foram deletados

## Logs Esperados

### Ao Cancelar na Fase Game-in-Progress

🚫 [GameInProgress] Cancelando jogo 123: Partida cancelada pelo usuário
🤖 [GameInProgress] ========== VERIFICANDO DISCORD SERVICE ==========
🤖 [GameInProgress] DiscordService existe: true
🤖 [GameInProgress] DiscordService referência: VÁLIDA
🤖 [GameInProgress] DiscordService tipo: object
🤖 [GameInProgress] DiscordService constructor: DiscordService
🤖 [GameInProgress] DiscordService isReady: true
🤖 [GameInProgress] DiscordService activeMatches count: 1
🤖 [GameInProgress] Match 123 existe no DiscordService: true
🤖 [GameInProgress] Limpando canais do Discord para partida cancelada 123...
🔍 [cleanupMatchByCustomId] Iniciando limpeza para match 123 (string: 123)
🔍 [cleanupMatchByCustomId] Total de matches ativos: 1
🔍 [cleanupMatchByCustomId] Chaves dos matches ativos: ['123']
✅ [cleanupMatchByCustomId] Match 123 encontrado, iniciando limpeza...
🔄 [performCleanup] Movendo jogadores de volta para match 123...
🗑️ [performCleanup] Deletando canais para match 123...
🗑️ [performCleanup] Canais a deletar: ['channel1', 'channel2', 'category1']
🗑️ [performCleanup] Canal 🔵-blue-team-123 (channel1) deletado
🗑️ [performCleanup] Canal 🔴-red-team-123 (channel2) deletado
🗑️ [performCleanup] Canal Match 123 (category1) deletado
✅ [performCleanup] Match 123 completamente limpo e removido do tracking
🤖 [GameInProgress] Canais do Discord limpos para partida cancelada 123
✅ [GameInProgress] Jogo 123 cancelado

## Possíveis Problemas e Soluções

### 1. Match não encontrado no DiscordService

**Sintoma:** Log `❌ [cleanupMatchByCustomId] Match ${matchId} não encontrado no activeMatches`

**Solução:** O sistema tentará limpeza forçada e método alternativo automaticamente.

### 2. DiscordService não disponível

**Sintoma:** Log `⚠️ [GameInProgress] DiscordService não disponível`

**Solução:** Verificar se o bot do Discord está configurado e conectado.

### 3. Erro ao deletar canais

**Sintoma:** Log `❌ [performCleanup] Erro ao deletar canal ${channelId}`

**Solução:** Verificar permissões do bot no Discord e se os canais ainda existem.

## Monitoramento

Para monitorar o funcionamento em tempo real, observe os logs do servidor. As mensagens principais são:

- `🤖 [GameInProgress]` - Logs do GameInProgressService
- `🔍 [cleanupMatchByCustomId]` - Logs do DiscordService
- `🔄 [performCleanup]` - Logs da limpeza em si
- `🗑️ [performCleanup]` - Logs de deleção de canais

## Endpoints Úteis

- `GET /api/debug/discord-status` - Status completo do DiscordService
- `POST /api/debug/force-cleanup-match` - Forçar limpeza de um match
- `POST /api/match/cancel` - Cancelar partida (endpoint normal)

## Próximos Passos

1. Testar o cancelamento na fase game-in-progress
2. Verificar se os canais do Discord são deletados corretamente
3. Monitorar os logs para identificar qualquer problema restante
4. Se necessário, ajustar a lógica baseado nos resultados dos testes
