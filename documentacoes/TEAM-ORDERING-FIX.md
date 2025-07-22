# Correção da Ordenação dos Times entre Match Found e Draft

## Problema Identificado

Ao encontrar partida, é exibido os times na tela de aceitação (match_found), e depois de aceitar vai para o draft. Porém, o time azul vira time vermelho no draft, não mantendo exatamente como mostra no match_found. A ordem de time do match_found reflete o verdadeiro estado do MySQL, onde a coluna `team1` é time azul e `team2` é time vermelho.

## Causa do Problema

O problema estava no `DraftService` onde os dados não estavam sendo processados corretamente:

1. **Dados do banco**: `team1_players` = time azul, `team2_players` = time vermelho ✅
2. **Processamento no DraftService**: Os dados estavam sendo reordenados incorretamente ❌
3. **Resultado**: Time azul e vermelho trocados no draft ❌

## Correções Implementadas

### 1. **DraftService - Método `startDraft`**

- ✅ **Priorização de dados**: Usar dados do match-found (teammates/enemies) se disponíveis
- ✅ **Preservação de índices**: Manter teamIndex exato do match-found (0-4 para azul, 5-9 para vermelho)
- ✅ **Fallback melhorado**: Se não há dados do match-found, usar dados do banco mantendo ordem
- ✅ **Normalização de lanes**: Converter 'bot' para 'adc' para consistência

### 2. **DraftService - Novo método `prepareDraftDataFromDatabase`**

- ✅ **Ordem preservada**: Usar índices do array para determinar lanes (0=top, 1=jungle, etc.)
- ✅ **TeamIndex correto**: Team1 sempre 0-4, Team2 sempre 5-9
- ✅ **Dados completos**: Incluir MMR, lanes, e outras informações

### 3. **DraftService - Método `notifyDraftStarted`**

- ✅ **Estrutura consistente**: Dados enviados igual ao match-found
- ✅ **Múltiplos formatos**: Compatibilidade com diferentes componentes
- ✅ **Logs detalhados**: Para verificação e debug

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
# - Match Found: Time azul = team1, Time vermelho = team2
# - Draft: Mesma ordenação mantida
```

### 2. **Teste Automatizado**

```bash
# Executar script de teste
node test-team-ordering.js
```

### 3. **Verificação no Banco**

```sql
-- Verificar dados de uma partida recente
SELECT id, team1_players, team2_players, pick_ban_data, status 
FROM custom_matches 
ORDER BY created_at DESC 
LIMIT 1;
```

## Estrutura de Dados Corrigida

### **Match Found (MySQL)**

```json
{
  "team1_players": ["Player1", "Player2", "Player3", "Player4", "Player5"], // Time Azul
  "team2_players": ["Player6", "Player7", "Player8", "Player9", "Player10"] // Time Vermelho
}
```

### **Draft (Processado)**

```json
{
  "team1": [
    {"summonerName": "Player1", "teamIndex": 0, "assignedLane": "top"},
    {"summonerName": "Player2", "teamIndex": 1, "assignedLane": "jungle"},
    // ... Time Azul (0-4)
  ],
  "team2": [
    {"summonerName": "Player6", "teamIndex": 5, "assignedLane": "top"},
    {"summonerName": "Player7", "teamIndex": 6, "assignedLane": "jungle"},
    // ... Time Vermelho (5-9)
  ]
}
```

## Logs de Verificação

### **Logs do Backend**

✅ [Draft] Dados do match-found processados: {
  team1Size: 5,
  team2Size: 5,
  team1Indices: [0, 1, 2, 3, 4],
  team2Indices: [5, 6, 7, 8, 9],
  team1Lanes: ["top", "jungle", "mid", "adc", "support"],
  team2Lanes: ["top", "jungle", "mid", "adc", "support"]
}

### **Logs do Frontend**

🔵 [DraftPickBan] Blue team data: [Player1, Player2, Player3, Player4, Player5]
🔴 [DraftPickBan] Red team data: [Player6, Player7, Player8, Player9, Player10]

## Resultado Esperado

✅ **Match Found**: Time azul = team1, Time vermelho = team2  
✅ **Draft**: Mesma ordenação mantida  
✅ **Game In Progress**: Ordenação preservada  
✅ **Banco de dados**: Dados consistentes  

## Troubleshooting

### **Se ainda houver problemas:**

1. **Verificar logs do backend**:

   ```bash
   tail -f src/backend/logs/app.log
   ```

2. **Verificar dados no banco**:

   ```sql
   SELECT * FROM custom_matches WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1;
   ```

3. **Executar teste automatizado**:

   ```bash
   node test-team-ordering.js
   ```

4. **Limpar cache do frontend**:

   ```bash
   cd src/frontend
   npm run clean
   npm start
   ```

## Arquivos Modificados

- `src/backend/services/DraftService.ts` - Correção principal
- `test-team-ordering.js` - Script de teste
- `TEAM-ORDERING-FIX.md` - Esta documentação
