# Implementação de Dados Preliminares dos Participantes

## Resumo da Funcionalidade

Esta implementação adiciona a capacidade de salvar dados preliminares dos participantes durante a confirmação da partida no modal de draft, antes mesmo da partida terminar. Isso permite que o histórico já mostre informações básicas como nome do jogador, campeão pickado e lane, facilitando a comparação posterior com dados reais do LCU.

## ✅ CORREÇÕES IMPLEMENTADAS

### Problema Identificado

- Os dados preliminares não estavam sendo salvos porque o método `saveCustomMatch` só era chamado quando a partida terminava
- Não havia salvamento imediato durante a confirmação do draft

### Solução Implementada

1. **Salvamento Imediato**: Dados preliminares são salvos imediatamente quando a partida é iniciada
2. **Atualização Posterior**: Quando a partida termina, os dados preliminares são atualizados com dados finais
3. **Rota de Atualização**: Nova rota PUT para atualizar partidas existentes

## Arquivos Modificados

### 1. Frontend - `src/frontend/src/app/app.ts`

#### Método `startGamePhase` (ATUALIZADO)

- **Adicionado**: Chamada para `savePreliminaryMatchData()` imediatamente após criar gameData
- **Novo método**: `savePreliminaryMatchData()` - Salva dados preliminares quando partida é iniciada
- **Novo método**: `updatePreliminaryMatchWithFinalData()` - Atualiza partida preliminar com dados finais

#### Método `onGameComplete` (ATUALIZADO)

- **Modificado**: Verifica se existe `preliminaryMatchId` para atualizar partida existente
- **Fallback**: Se não há ID preliminar, salva como nova partida

#### Estrutura dos Dados Preliminares

```typescript
{
  participantId: 1,
  teamId: 100, // 100 = Time Azul, 200 = Time Vermelho
  championId: 55,
  championName: 'Katarina',
  summonerName: 'PlayerName#TAG',
  riotIdGameName: 'PlayerName',
  riotIdTagline: 'TAG',
  lane: 'MID',
  kills: 0,
  deaths: 0,
  assists: 0,
  // ... outros campos zerados
  win: false // Ainda não há vencedor
}
```

### 2. Frontend - `src/frontend/src/app/services/api.ts`

#### Novo Método

- **`updateCustomMatch(matchId, updateData)`**: Atualiza partida customizada existente

### 3. Backend - `src/backend/server.ts`

#### Rotas Atualizadas

- **POST `/api/matches/custom`**: Adicionado suporte ao campo `participantsData`
- **POST `/api/custom_matches`**: Adicionado suporte ao campo `participantsData` (rota de compatibilidade)
- **PUT `/api/matches/custom/:matchId`**: NOVA ROTA para atualizar partidas existentes

#### Lógica de Salvamento (ATUALIZADA)

- Se a partida está finalizada: salva dados completos incluindo `participantsData`
- Se a partida não está finalizada mas tem dados preliminares: salva apenas os dados preliminares
- Nova rota PUT permite atualização de partidas existentes

### 4. Database - `src/backend/database/DatabaseManager.ts`

#### Métodos Existentes Atualizados

- **`completeCustomMatch`**: Já suportava o campo `participantsData`
- **`updateCustomMatchWithRealData`**: Já suportava o campo `participantsData`
- **`updateCustomMatch`**: Método genérico para atualizar partidas

## Fluxo de Funcionamento (ATUALIZADO)

### 1. Durante o Draft

1. Usuário completa o pick/ban
2. Modal de confirmação é exibido
3. Ao confirmar, `completePickBan()` é chamado

### 2. Início da Partida (NOVO)

1. `onPickBanComplete()` chama `startGamePhase()`
2. `startGamePhase()` cria `gameData` com informações do draft
3. `updatePlayersWithChampions()` mapeia campeões aos jogadores
4. **`savePreliminaryMatchData()` salva dados preliminares IMEDIATAMENTE**
5. Partida é salva com status 'pending' e dados preliminares

### 3. Durante a Partida

1. Partida já existe no histórico com dados preliminares
2. Usuário pode ver a partida no histórico mesmo antes de terminar
3. Dados preliminares mostram jogadores, campeões e lanes

### 4. Finalização da Partida (ATUALIZADO)

1. Quando a partida termina, `onGameComplete()` é chamado
2. Se existe `preliminaryMatchId`, atualiza a partida existente
3. Se não existe, salva como nova partida (fallback)
4. Dados finais substituem os preliminares

## Benefícios da Implementação

### 1. Histórico Mais Rico

- Partidas aparecem no histórico imediatamente após confirmação
- Informações básicas (jogador, campeão, lane) já estão disponíveis
- Facilita identificação de partidas específicas

### 2. Melhor Comparação

- Dados preliminares servem como base para comparação
- Facilita detecção de partidas correspondentes no LCU
- Reduz falsos positivos na identificação automática

### 3. Experiência do Usuário

- Feedback imediato de que a partida foi salva
- Histórico mais completo e informativo
- Transparência sobre o que foi salvo

## Estrutura dos Dados

### Dados Preliminares (Zerados)

```json
{
  "participantId": 1,
  "teamId": 100,
  "championId": 55,
  "championName": "Katarina",
  "summonerName": "PlayerName#TAG",
  "lane": "MID",
  "kills": 0,
  "deaths": 0,
  "assists": 0,
  "champLevel": 0,
  "goldEarned": 0,
  "totalMinionsKilled": 0,
  "neutralMinionsKilled": 0,
  "totalDamageDealt": 0,
  "totalDamageDealtToChampions": 0,
  "totalDamageTaken": 0,
  "wardsPlaced": 0,
  "wardsKilled": 0,
  "visionScore": 0,
  "firstBloodKill": false,
  "doubleKills": 0,
  "tripleKills": 0,
  "quadraKills": 0,
  "pentaKills": 0,
  "item0": 0,
  "item1": 0,
  "item2": 0,
  "item3": 0,
  "item4": 0,
  "item5": 0,
  "item6": 0,
  "summoner1Id": 0,
  "summoner2Id": 0,
  "win": false
}
```

### Dados Reais (Após LCU)

```json
{
  "participantId": 1,
  "teamId": 100,
  "championId": 55,
  "championName": "Katarina",
  "summonerName": "PlayerName#TAG",
  "lane": "MID",
  "kills": 6,
  "deaths": 5,
  "assists": 17,
  "champLevel": 17,
  "goldEarned": 14753,
  "totalMinionsKilled": 190,
  "neutralMinionsKilled": 0,
  "totalDamageDealt": 175561,
  "totalDamageDealtToChampions": 29864,
  "totalDamageTaken": 25812,
  "wardsPlaced": 7,
  "wardsKilled": 5,
  "visionScore": 25,
  "firstBloodKill": true,
  "doubleKills": 0,
  "tripleKills": 0,
  "quadraKills": 0,
  "pentaKills": 0,
  "item0": 1054,
  "item1": 2421,
  "item2": 3135,
  "item3": 3175,
  "item4": 3089,
  "item5": 3100,
  "item6": 3364,
  "summoner1Id": 14,
  "summoner2Id": 4,
  "win": true
}
```

## Teste da Funcionalidade

### Arquivo de Teste: `test-preliminary-data.js`

- Simula criação de partida com dados preliminares (status pending)
- Verifica se dados preliminares foram salvos corretamente
- Testa atualização da partida com dados finais
- Valida estrutura dos participantes

### Como Executar o Teste

```bash
node test-preliminary-data.js
```

## Compatibilidade

### Backward Compatibility

- Rotas existentes continuam funcionando
- Dados antigos não são afetados
- Campo `participantsData` é opcional

### Frontend Compatibility

- Interface existente não é alterada
- Funcionalidade é transparente para o usuário
- Dados preliminares são salvos automaticamente

## Logs e Debug

### Logs Adicionados

- `💾 Salvando dados preliminares da partida...`
- `📝 Salvando dados preliminares:`
- `✅ Dados preliminares salvos com sucesso!`
- `🆔 Match ID preliminar:`
- `🔄 Atualizando partida preliminar com dados finais...`
- `📝 Atualizando partida com dados finais:`
- `✅ Partida atualizada com sucesso!`

### Debug Information

- Estrutura completa dos dados enviados
- Contagem de participantes por time
- Mapeamento de campeões aos jogadores
- Validação de dados salvos
- ID da partida preliminar para rastreamento

## Status da Implementação

### ✅ Implementado

- [x] Salvamento imediato de dados preliminares
- [x] Atualização de partidas existentes
- [x] Rota PUT para atualização
- [x] Método updateCustomMatch no ApiService
- [x] Logs detalhados para debug
- [x] Teste completo da funcionalidade
- [x] Fallback para partidas sem dados preliminares

### 🔄 Fluxo Completo

1. **Draft Completo** → Modal de confirmação
2. **Confirmação** → Dados preliminares salvos IMEDIATAMENTE
3. **Partida Iniciada** → Aparece no histórico com dados básicos
4. **Partida Termina** → Dados preliminares atualizados com dados reais
5. **Comparação** → Sistema compara dados preliminares com reais

## Próximos Passos

### Melhorias Futuras

1. **Interface de Visualização**: Mostrar dados preliminares no histórico
2. **Comparação Visual**: Destacar diferenças entre dados preliminares e reais
3. **Estatísticas**: Calcular estatísticas baseadas em dados preliminares
4. **Notificações**: Alertar quando dados reais são detectados

### Otimizações

1. **Cache**: Cachear dados preliminares para melhor performance
2. **Validação**: Validação mais robusta dos dados
3. **Compressão**: Compressão de dados para economizar espaço
4. **Indexação**: Índices otimizados para consultas frequentes
