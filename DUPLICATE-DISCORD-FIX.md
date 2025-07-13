# Correção de Duplicidade de Partidas e Bot do Discord

## Problemas Identificados

1. **Duplicidade de partidas**: Ao aceitar uma partida no match_found, o sistema estava criando partidas duplicadas no banco de dados
2. **Bot do Discord não funcionando**: O bot não estava criando os canais e movendo as pessoas para os times corretos

## Causas dos Problemas

### 1. **Duplicidade de Partidas**

- O `DraftService` estava sendo chamado tanto pelo monitoramento automático quanto pelo `MatchFoundService`
- Não havia proteções adequadas contra processamento simultâneo
- O monitoramento automático estava criando drafts duplicados

### 2. **Bot do Discord**

- O `DiscordService` estava sendo chamado no momento errado
- Falta de verificações de status do Discord
- Possível problema de inicialização do serviço

## Correções Implementadas

### 1. **DraftService - Proteções contra Duplicidade**

- ✅ **Set de proteção**: `processingMatches` para controlar partidas sendo processadas
- ✅ **Verificações múltiplas**: Verificar se já existe draft ativo, se está sendo processado, etc.
- ✅ **Monitoramento melhorado**: Reativado com proteções adequadas
- ✅ **Finally block**: Garantir que proteções sejam removidas após processamento

### 2. **MatchFoundService - Ordem Correta**

- ✅ **Discord primeiro**: Criar match no Discord antes de notificar aceitação
- ✅ **Logs detalhados**: Verificar status do DiscordService
- ✅ **Remoção de chamada duplicada**: Não chamar DraftService explicitamente

### 3. **DiscordService - Verificações**

- ✅ **Status checks**: Verificar se o serviço está pronto antes de usar
- ✅ **Logs detalhados**: Para debug e verificação
- ✅ **Proteção contra duplicatas**: Verificar se match já existe

## Como Testar

### 1. **Teste Manual**

```bash
# 1. Iniciar o backend
cd src/backend
npm start

# 2. Iniciar o frontend
cd src/frontend
npm start

# 3. Criar uma partida e verificar:
# - Match Found aparece
# - Aceitar a partida
# - Verificar se vai para draft (sem duplicidade)
# - Verificar se o Discord criou os canais
```

### 2. **Teste Automatizado**

```bash
# Executar script de teste
node test-duplicate-fix.js
```

### 3. **Verificação no Banco**

```sql
-- Verificar se há partidas duplicadas
SELECT id, team1_players, team2_players, status, created_at 
FROM custom_matches 
WHERE status IN ('accepted', 'draft')
ORDER BY created_at DESC 
LIMIT 10;
```

### 4. **Verificação do Discord**

```bash
# Verificar status do Discord
curl http://localhost:3000/api/debug/discord-status
```

## Logs de Verificação

### **Logs do Backend (Sucesso)**

✅ [MatchFound] Partida 123 totalmente aceita - encaminhando para Draft
🤖 [MatchFound] Criando match Discord para partida 123...
🤖 [MatchFound] Match Discord criado com sucesso
🎯 [Draft] Partida 123 aceita detectada, iniciando draft...
✅ [Draft] Draft 123 iniciado com sucesso

### **Logs do Backend (Proteção)**

⏳ [Draft] Partida 123 já está sendo processada, aguardando...
⚠️ [Draft] Draft 123 já está ativo

### **Logs do Discord**

✅ [DiscordService] Match 123 criado com sucesso e jogadores movidos

## Estrutura Corrigida

### **Fluxo Correto**

1. **Match Found**: Partida criada no banco
2. **Aceitação**: Todos os jogadores aceitam
3. **Discord**: Canais criados e jogadores movidos
4. **Draft**: Iniciado automaticamente pelo monitoramento
5. **Resultado**: Apenas 1 partida no banco, 1 match no Discord

### **Proteções Implementadas**

- ✅ Verificação de draft ativo
- ✅ Verificação de processamento em andamento
- ✅ Verificação de status da partida
- ✅ Proteção contra criação duplicada no Discord
- ✅ Logs detalhados para debug

## Troubleshooting

### **Se ainda houver duplicidade:**

1. **Verificar logs do backend**:

   ```bash
   tail -f src/backend/logs/app.log | grep -E "(Draft|MatchFound)"
   ```

2. **Verificar partidas no banco**:

   ```sql
   SELECT COUNT(*) as total, status 
   FROM custom_matches 
   WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
   GROUP BY status;
   ```

3. **Verificar Discord**:

   ```bash
   curl http://localhost:3000/api/debug/discord-status
   ```

4. **Limpar dados de teste**:

   ```bash
   # Executar script de limpeza se disponível
   node scripts/cleanup-test-data.js
   ```

### **Se o Discord não funcionar:**

1. **Verificar configuração**:

   ```bash
   # Verificar se o token está configurado
   curl http://localhost:3000/api/settings
   ```

2. **Verificar logs do Discord**:

   ```bash
   tail -f src/backend/logs/app.log | grep -E "(Discord|DiscordService)"
   ```

3. **Reiniciar o backend**:

   ```bash
   cd src/backend
   npm restart
   ```

## Resultado Esperado

✅ **Match Found**: 1 partida criada  
✅ **Aceitação**: Status atualizado para 'accepted'  
✅ **Discord**: Canais criados e jogadores movidos  
✅ **Draft**: 1 draft iniciado (sem duplicidade)  
✅ **Banco**: Apenas 1 registro por partida  

## Arquivos Modificados

- `src/backend/services/DraftService.ts` - Proteções contra duplicidade
- `src/backend/services/MatchFoundService.ts` - Ordem correta de execução
- `src/backend/services/DiscordService.ts` - Verificações de status
- `test-duplicate-fix.js` - Script de teste
- `DUPLICATE-DISCORD-FIX.md` - Esta documentação
