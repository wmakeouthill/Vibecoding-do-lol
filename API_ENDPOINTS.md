# 📚 Documentação de Endpoints - LoL Matchmaking

Esta documentação contém todos os endpoints disponíveis na aplicação de
matchmaking do League of Legends.

## 🔗 Base URL

```text
http://localhost:3000
```

---

## 📋 Índice

- [🏥 Health & Status](#-health--status)
- [👤 Player Management](#-player-management)
- [📊 Statistics & Leaderboard](#-statistics--leaderboard)
- [🎯 Queue Management](#-queue-management)
- [🎮 Match Management](#-match-management)
- [🏆 Custom Matches](#-custom-matches)
- [🔧 LCU Integration](#-lcu-integration)
- [🤖 Discord Integration](#-discord-integration)
- [🛠️ Configuration](#️-configuration)
- [🐛 Debug & Admin](#-debug--admin)
- [🎭 Champions](#-champions)
- [🌐 WebSocket Messages](#-websocket-messages)

---

## 🏥 Health & Status

### GET `/`

Página inicial da aplicação

- **Retorna**: HTML da página principal

### GET `/api/health`

Verificar status do servidor

- **Retorna**: Status básico do servidor

```json
{
  "status": "ok",
  "timestamp": "2025-01-XX...",
  "uptime": 123456
}
```

### GET `/api/test`

Endpoint de teste

- **Retorna**: Mensagem de teste simples

---

## 👤 Player Management

### POST `/api/player/register`

Registrar novo jogador

- **Body**:

```json
{
  "displayName": "PlayerName#BR1",
  "region": "br1"
}
```

- **Retorna**: Dados do jogador registrado

### GET `/api/player/current-details`

Obter detalhes do jogador atual (LCU + Riot API)

- **Retorna**: Dados completos do jogador logado

```json
{
  "success": true,
  "data": {
    "lcu": {},
    "riotAccount": {},
    "riotApi": {}
  }
}
```

### GET `/api/player/:playerId`

Obter dados de um jogador específico

- **Params**: `playerId` (number)
- **Retorna**: Dados do jogador

### GET `/api/player/:playerId/stats`

Obter estatísticas de um jogador

- **Params**: `playerId` (number)
- **Retorna**: Estatísticas detalhadas

### GET `/api/player/details/:displayName`

Obter detalhes por Display Name

- **Params**: `displayName` (string) - ex: "PlayerName#BR1"
- **Retorna**: Dados completos do jogador

### GET `/api/player/puuid/:puuid`

Obter jogador por PUUID

- **Params**: `puuid` (string)
- **Retorna**: Dados do jogador

### POST `/api/player/refresh-by-display-name`

Atualizar dados do jogador

- **Body**:

```json
{
  "displayName": "PlayerName#BR1",
  "region": "br1"
}
```

### POST `/api/players/update-nickname`

Atualizar nickname do jogador

- **Body**:

```json
{
  "playerId": 123,
  "newNickname": "NovoNome"
}
```

---

## 📊 Statistics & Leaderboard

### GET `/api/stats/leaderboard`

Obter leaderboard geral

- **Query Params**:
  - `limit` (optional): Número de jogadores (default: 50)
- **Retorna**: Lista dos melhores jogadores

### GET `/api/stats/participants-leaderboard`

Obter leaderboard de participantes

- **Retorna**: Ranking dos jogadores mais ativos

### POST `/api/stats/refresh-rebuild-players`

Reconstruir estatísticas dos jogadores

- **Retorna**: Status da operação

---

## 🎯 Queue Management

### GET `/api/queue/status`

Obter status atual da fila

- **Retorna**:

```json
{
  "playersInQueue": 5,
  "averageWaitTime": 120,
  "estimatedMatchTime": 180,
  "isActive": true,
  "playersInQueueList": []
}
```

### POST `/api/queue/join`

Entrar na fila

- **Body**:

```json
{
  "playerData": {},
  "preferences": {
    "primaryLane": "jungle",
    "secondaryLane": "support"
  }
}
```

### POST `/api/queue/leave`

Sair da fila

- **Body**:

```json
{
  "playerId": 123,
  "summonerName": "PlayerName"
}
```

### POST `/api/queue/join-legacy`

Entrar na fila (modo legado)

- **Body**:

```json
{
  "playerId": 123,
  "mmr": 1500,
  "role": "jungle"
}
```

### POST `/api/queue/leave-legacy`

Sair da fila (modo legado)

- **Body**:

```json
{
  "playerId": 123
}
```

### POST `/api/queue/add-bot`

Adicionar bot à fila

- **Retorna**: Confirmação da adição

### POST `/api/queue/force-sync`

Forçar sincronização da fila com MySQL

- **Retorna**: Status da sincronização

---

## 🎮 Match Management

### POST `/api/match/accept`

Aceitar partida encontrada

- **Body**:

```json
{
  "matchId": 123,
  "playerId": 456,
  "summonerName": "PlayerName"
}
```

### POST `/api/match/decline`

Recusar partida encontrada

- **Body**:

```json
{
  "matchId": 123,
  "playerId": 456,
  "summonerName": "PlayerName"
}
```

### POST `/api/match/draft-action`

Ação durante o draft (pick/ban)

- **Body**:

```json
{
  "matchId": 123,
  "action": "pick",
  "championId": 64,
  "playerId": 456
}
```

### POST `/api/match/create-from-frontend`

Criar partida pelo frontend

- **Body**: Dados da partida personalizada

### GET `/api/matches/recent`

Obter partidas recentes

- **Query Params**:
  - `limit` (optional): Número de partidas
- **Retorna**: Lista de partidas recentes

### POST `/api/matches/:matchId/draft-completed`

Marcar draft como completo

- **Params**: `matchId` (number)
- **Body**:

```json
{
  "draftData": {}
}
```

### POST `/api/matches/:matchId/game-completed`

Marcar jogo como completo

- **Params**: `matchId` (number)
- **Body**:

```json
{
  "winnerTeam": 1,
  "gameData": {}
}
```

### GET `/api/matchmaking/check-acceptance`

Verificar status de aceitação

- **Retorna**: Status atual das aceitações

### POST `/api/matchmaking/process-complete`

Processar conclusão do matchmaking

- **Body**: Dados da conclusão

---

## 🏆 Custom Matches

### POST `/api/matches/custom`

Criar partida customizada

- **Body**: Dados completos da partida customizada

### POST `/api/custom_matches`

Salvar partida customizada

- **Body**: Dados da partida para salvar

### GET `/api/matches/custom/:playerId`

Obter histórico de partidas customizadas

- **Params**: `playerId` (string)
- **Query Params**:
  - `offset` (optional): Offset para paginação
  - `limit` (optional): Limite de resultados
- **Retorna**: Histórico de partidas do jogador

### GET `/api/matches/custom/:playerId/count`

Obter contagem de partidas customizadas

- **Params**: `playerId` (string)
- **Retorna**: Número total de partidas

### PUT `/api/matches/custom/:matchId`

Atualizar partida customizada

- **Params**: `matchId` (number)
- **Body**: Dados para atualizar

### DELETE `/api/matches/cleanup-test-matches`

Limpar partidas de teste

- **Retorna**: Confirmação da limpeza

### DELETE `/api/matches/clear-all-custom-matches`

Limpar todas as partidas customizadas

- **Retorna**: Confirmação da limpeza

---

## 🔧 LCU Integration

### GET `/api/lcu/status`

Verificar status da conexão LCU

- **Retorna**:

```json
{
  "isConnected": true,
  "summoner": {},
  "gameflowPhase": "Lobby"
}
```

### GET `/api/lcu/current-summoner`

Obter dados do summoner atual

- **Retorna**: Dados básicos do LCU

### GET `/api/lcu/match-history-all`

Obter histórico completo de partidas do LCU

- **Query Params**:
  - `startIndex` (optional): Índice inicial
  - `count` (optional): Quantidade de partidas
  - `customOnly` (optional): Apenas partidas customizadas
- **Retorna**: Histórico de partidas

### GET `/api/lcu/current-match-details`

Obter detalhes da partida atual

- **Retorna**: Dados da partida em andamento (se houver)

### POST `/api/lcu/fetch-and-save-match/:gameId`

Buscar e salvar partida por Game ID

- **Params**: `gameId` (number)
- **Body**:

```json
{
  "displayName": "PlayerName#BR1"
}
```

### POST `/api/capture-match/:playerId`

Capturar partida para um jogador

- **Params**: `playerId` (number)

---

## 🤖 Discord Integration

### GET `/api/discord/status`

Verificar status do bot Discord

- **Retorna**:

```json
{
  "isConnected": true,
  "botUsername": "LoL Matchmaking Bot",
  "queueSize": 3,
  "activeMatches": 1,
  "inChannel": true
}
```

---

## 🛠️ Configuration

### POST `/api/config/discord-token`

Configurar token do Discord bot

- **Body**:

```json
{
  "token": "seu_token_discord"
}
```

### POST `/api/config/riot-api-key`

Configurar chave da Riot API

- **Body**:

```json
{
  "apiKey": "sua_chave_riot_api"
}
```

### POST `/api/config/discord-channel`

Configurar canal do Discord

- **Body**:

```json
{
  "channelName": "lol-matchmaking"
}
```

### GET `/api/config/status`

Obter status das configurações

- **Retorna**: Status de todas as configurações

### GET `/api/config/settings`

Obter todas as configurações

- **Retorna**: Objeto com todas as configurações

---

## 🐛 Debug & Admin

### GET `/api/debug/tables`

Visualizar estrutura das tabelas do banco

- **Retorna**: Informações das tabelas

### POST `/api/debug/fix-match-status`

Corrigir status das partidas

- **Retorna**: Resultado da correção

### POST `/api/admin/recalculate-custom-lp`

Recalcular LP customizado dos jogadores

- **Retorna**: Resultado da operação

---

## 🎭 Champions

### GET `/api/champions`

Obter lista de todos os campeões

- **Retorna**: Array com dados dos campeões

### GET `/api/champions/role/:role`

Obter campeões por função

- **Params**: `role` (string) - ex: "jungle", "support"
- **Retorna**: Array com campeões da função especificada

---

## 🌐 WebSocket Messages

**Conectar em**: `ws://localhost:3000/ws`

### Mensagens de Entrada (Cliente → Servidor)

#### Queue Management

```json
// Entrar na fila Discord
{
  "type": "join_discord_queue",
  "data": {
    "discordId": "123456789",
    "displayName": "PlayerName#BR1",
    "preferences": {
      "primaryLane": "jungle",
      "secondaryLane": "support"
    }
  }
}

// Entrar na fila normal
{
  "type": "join_queue",
  "data": {}
}

// Sair da fila
{
  "type": "leave_queue"
}

// Obter status da fila
{
  "type": "get_queue_status"
}
```

#### Discord Integration

```json
// Obter status do Discord
{
  "type": "get_discord_status"
}

// Obter usuários Discord online
{
  "type": "get_discord_users_online"
}

// Obter status do canal Discord
{
  "type": "get_discord_channel_status"
}

// Atualizar dados do LCU
{
  "type": "update_lcu_data",
  "lcuData": {
    "displayName": "PlayerName#BR1"
  }
}

// Obter vinculações Discord
{
  "type": "get_discord_links"
}
```

#### Match Management

```json
// Aceitar partida
{
  "type": "accept_match",
  "data": {
    "matchId": 123,
    "playerId": 456,
    "summonerName": "PlayerName"
  }
}

// Recusar partida
{
  "type": "decline_match",
  "data": {
    "matchId": 123,
    "playerId": 456,
    "summonerName": "PlayerName"
  }
}

// Cancelar jogo em andamento
{
  "type": "cancel_game_in_progress",
  "data": {
    "matchId": 123,
    "reason": "Motivo do cancelamento"
  }
}

// Cancelar draft
{
  "type": "cancel_draft",
  "data": {
    "matchId": 123,
    "reason": "Motivo do cancelamento"
  }
}
```

#### Utility Messages

```json
// Ping
{
  "type": "ping"
}
```

### Mensagens de Saída (Servidor → Cliente)

#### Queue Updates

```json
// Status da fila
{
  "type": "queue_status",
  "data": {
    "playersInQueue": 5,
    "averageWaitTime": 120,
    "playersInQueueList": []
  }
}

// Atualização da fila
{
  "type": "queue_update",
  "data": {}
}

// Entrada na fila confirmada
{
  "type": "queue_joined",
  "data": {}
}
```

#### Discord Updates

```json
// Status do Discord
{
  "type": "discord_status",
  "isConnected": true,
  "botUsername": "LoL Matchmaking Bot",
  "queueSize": 3,
  "activeMatches": 1,
  "inChannel": true,
  "currentUser": {}
}

// Usuários Discord online
{
  "type": "discord_users_online",
  "users": [
    {
      "id": "123456789",
      "username": "PlayerDiscord",
      "displayName": "PlayerDiscord",
      "linkedDisplayName": "PlayerName#BR1"
    }
  ]
}

// Usuário atual Discord
{
  "type": "discord_current_user",
  "currentUser": {}
}

// Status do canal Discord
{
  "type": "discord_channel_status",
  "hasUsers": true,
  "usersCount": 5,
  "inChannel": true
}

// Vinculações Discord atualizadas
{
  "type": "discord_links_update",
  "links": []
}
```

#### Match Events

```json
// Partida encontrada
{
  "type": "match_found",
  "data": {
    "matchId": 123,
    "team1": [],
    "team2": [],
    "yourTeam": 1
  }
}

// Partida aceita
{
  "type": "match_accepted",
  "data": { "matchId": 123 }
}

// Partida recusada
{
  "type": "match_declined",
  "data": { "matchId": 123 }
}

// Draft iniciado
{
  "type": "draft_started",
  "data": {}
}

// Ação de draft
{
  "type": "draft_action",
  "data": {}
}

// Jogo iniciando
{
  "type": "game_starting",
  "data": {}
}

// Partida cancelada
{
  "type": "match_cancelled",
  "data": { "matchId": 123 }
}

// Draft cancelado
{
  "type": "draft_cancelled",
  "data": { "matchId": 123 }
}

// Jogo cancelado
{
  "type": "game_cancelled",
  "data": { "matchId": 123 }
}
```

#### Utility Responses

```json
// Pong (resposta ao ping)
{
  "type": "pong"
}

// Dados do LCU atualizados
{
  "type": "lcu_data_updated",
  "success": true,
  "timestamp": 1234567890
}

// Erro
{
  "type": "error",
  "message": "Descrição do erro"
}
```

---

## 🔒 Riot API Routes (Legacy)

### GET `/api/summoner/:displayName`

Obter dados do summoner por Display Name

- **Params**: `displayName` (string) - ex: "PlayerName#BR1"

### GET `/api/summoner/profile-icon/:displayName`

Obter ícone de perfil por Display Name

- **Params**: `displayName` (string)

### GET `/api/riot/summoner/:region/:summonerName`

Obter summoner por nome (legado)

- **Params**:
  - `region` (string) - ex: "br1"
  - `summonerName` (string)

### GET `/api/riot/summoner-by-display-name/:region/:gameName/:tagLine`

Obter summoner por Display Name separado

- **Params**:
  - `region` (string)
  - `gameName` (string)
  - `tagLine` (string)

### GET `/api/riot/account-by-display-name/:region/:gameName/:tagLine`

Obter conta por Display Name separado

- **Params**:
  - `region` (string)
  - `gameName` (string)
  - `tagLine` (string)

---

## 📝 Notas Importantes

1. **Base URL**: Todos os endpoints assumem `http://localhost:3000` como base
2. **WebSocket**: Para conexões em tempo real, use `ws://localhost:3000/ws`
3. **Autenticação**: A maioria dos endpoints não requer autenticação (ambiente local)
4. **Rate Limiting**: Existe rate limiting configurado para proteger contra spam
5. **CORS**: CORS está configurado para permitir requisições locais
6. **Content-Type**: Use `application/json` para requisições POST/PUT
7. **Error Handling**: Erros retornam status HTTP apropriados com mensagens descritivas

---

## 🚀 Exemplos de Uso

### Testando no Postman

1. **Verificar saúde do servidor**:

   GET <http://localhost:3000/api/health>

2. **Obter dados do jogador atual**:

   GET <http://localhost:3000/api/player/current-details>

3. **Verificar status da fila**:

   GET <http://localhost:3000/api/queue/status>

4. **Obter status do Discord**:

   GET <http://localhost:3000/api/discord/status>

### Testando WebSocket

Use um cliente WebSocket para conectar em `ws://localhost:3000/ws` e envie:

```json
{
  "type": "get_discord_status"
}
```
