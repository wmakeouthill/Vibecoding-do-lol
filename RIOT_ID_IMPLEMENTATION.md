# Implementação de Busca por Riot ID

## ✅ Status da Implementação

A implementação foi **completamente atualizada e corrigida** para suportar corretamente a busca por **Riot ID** (formato `gameName#tagLine`) conforme a documentação oficial da Riot API. Todos os endpoints estão funcionais e testados.

## 🔧 Problema Resolvido

**Issue identificada**: O endpoint `/api/player/current-details` estava sendo capturado pelo endpoint genérico `/api/player/:playerId` devido à ordem de definição no Express.js.

**Solução aplicada**: Reordenação dos endpoints no `server.ts` para que rotas específicas sejam definidas antes das genéricas.

## 🏗️ Estrutura da API da Riot

### Account API
- **Endpoint**: `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
- **Uso**: Obter dados da conta usando gameName e tagLine
- **Resposta**: `AccountDto` com `puuid`, `gameName`, `tagLine`
- **Roteamento**: Regional (americas, europe, asia, sea)

### Summoner API  
- **Endpoint**: `/lol/summoner/v4/summoners/by-puuid/{puuid}`
- **Uso**: Obter dados do summoner usando o PUUID
- **Resposta**: `SummonerDto` com dados completos do summoner
- **Roteamento**: Específico da plataforma (br1, na1, euw1, etc.)

### League API
- **Endpoint**: `/lol/league/v4/entries/by-summoner/{summonerId}`
- **Uso**: Dados ranqueados (solo queue, flex queue)
- **Resposta**: Array com `LeagueEntryDto`

## 🚀 Endpoints Funcionais do Backend

### 1. ⭐ Endpoint Principal (Recomendado)
```http
GET /api/player/current-details
```
**Funcionalidade**: Busca automática do jogador atual conectado no League Client
- ✅ **Auto-detecção**: Extrai Riot ID automaticamente do LCU
- ✅ **Dados completos**: LCU + Account API + Summoner API + League API
- ✅ **Uma única chamada**: Retorna todos os dados necessários

**Resposta**:
```json
{
  "success": true,
  "data": {
    "lcu": {
      "gameName": "popcorn seller",
      "tagLine": "coup",
      "puuid": "9e7d05fe-ef7f-5ecb-b877-de7e68ff06eb",
      "summonerLevel": 331,
      "profileIconId": 6868
    },
    "riotAccount": {
      "gameName": "popcorn seller",
      "tagLine": "coup",
      "puuid": "9e7d05fe-ef7f-5ecb-b877-de7e68ff06eb"
    },
    "riotApi": {
      "id": "23NSqTfu-YEVGw_vC2lfeYGy9ts1O02-OHs-n_CLsKeqVw",
      "puuid": "7KzM07R8iMTdrcDRoF-D5O7IOl_E2AKHRUU5GflDtw2q3fAc4g6PTIQL9pXgg9afNxw-xhEBO_0GoQ",
      "gameName": "popcorn seller",
      "tagLine": "coup",
      "summonerLevel": 331,
      "soloQueue": {
        "tier": "EMERALD",
        "rank": "III",
        "leaguePoints": 49,
        "wins": 113,
        "losses": 105
      },
      "flexQueue": {
        "tier": "EMERALD", 
        "rank": "IV",
        "leaguePoints": 0,
        "wins": 72,
        "losses": 64
      },
      "region": "br1",
      "lastUpdated": "2025-06-16T01:48:53.230Z"
    }
  }
}
```

### 2. 🔄 Endpoint de Refresh Manual
```http
POST /api/player/refresh-by-riot-id
Content-Type: application/json

{
  "riotId": "popcorn seller#coup",
  "region": "br1"
}
```
**Funcionalidade**: Busca e atualiza dados de qualquer jogador via Riot ID
- ✅ **Busca manual**: Permite buscar qualquer jogador
- ✅ **Dados atualizados**: Força refresh dos dados da Riot API
- ✅ **Validação**: Verifica se o jogador existe

### 3. 🎯 Endpoints Específicos por Dados
```http
# Buscar por ID interno
GET /api/player/:playerId

# Buscar por Riot ID (URL encoded)
GET /api/player/details/:riotId

# Buscar por PUUID
GET /api/player/puuid/:puuid
```

## 🔄 Fluxo de Integração

### Frontend → Backend → Riot API
```
1. Frontend chama: getCurrentPlayerDetails()
2. Backend: /api/player/current-details
3. LCU API: getCurrentSummoner() → {gameName, tagLine}
4. Riot Account API: by-riot-id/{gameName}/{tagLine} → {puuid}
5. Riot Summoner API: by-puuid/{puuid} → {summonerId, profileIcon, level}
6. Riot League API: by-summoner/{summonerId} → {ranked data}
7. Backend: Compila todos os dados
8. Frontend: Recebe dados completos
```

## 📊 Métodos do Frontend

### ApiService (Angular)
```typescript
// Método principal - usa endpoint direto
getPlayerFromLCU(): Observable<Player> {
  return this.http.get<any>(`${this.baseUrl}/player/current-details`)
}

// Método de refresh manual
refreshPlayerByRiotId(riotId: string, region: string): Observable<RefreshPlayerResponse> {
  return this.http.post<RefreshPlayerResponse>(`${this.baseUrl}/player/refresh-by-riot-id`, {
    riotId, region
  })
}
```

### App Component
```typescript
// Auto-load do jogador atual
private async tryAutoLoadCurrentPlayer(): Promise<void> {
  this.apiService.getPlayerFromLCU().subscribe({
    next: (player: Player) => {
      this.currentPlayer = player;
      this.addNotification('success', 'Auto Load', 'Dados carregados automaticamente');
    },
    error: (error) => console.error('Erro ao carregar jogador:', error)
  });
}
```

## ✅ Testes de Validação

### Comandos de Teste (PowerShell/Bash)
```bash
# Teste do endpoint principal (auto-detecção)
curl -X GET http://localhost:3000/api/player/current-details

# Teste do refresh manual
curl -X POST "http://localhost:3000/api/player/refresh-by-riot-id" \
  -H "Content-Type: application/json" \
  -d '{"riotId": "popcorn seller#coup", "region": "br1"}'

# Teste do health check
curl -X GET http://localhost:3000/api/health

# Teste do status LCU
curl -X GET http://localhost:3000/api/lcu/status
```

### Resultados Esperados
- ✅ **Status 200** para todos os endpoints
- ✅ **Dados completos** do jogador (LCU + Riot API)
- ✅ **Riot ID correto** extraído do LCU
- ✅ **MMR e dados ranqueados** atualizados

## 🛡️ Tratamento de Erros

### Códigos de Status HTTP
- **200**: Sucesso - dados retornados corretamente
- **404**: Jogador não encontrado na Riot API
- **503**: Cliente do LoL não conectado (LCU offline)
- **403**: Chave da API inválida ou expirada
- **500**: Erro interno do servidor

### Mensagens de Erro
```json
// LCU não conectado
{ "error": "Cliente do LoL não conectado" }

// Jogador não encontrado
{ "error": "Jogador popcorn seller#coup não encontrado: Player not found via Riot API." }

// Dados LCU incompletos
{ "error": "gameName e tagLine não disponíveis no LCU." }

// Erro interno
{ "error": "Erro interno ao processar a solicitação para current-details" }
```

## 🌐 Roteamento Regional

### Mapeamento Account API (Regional)
- **americas**: `br1`, `na1`, `la1`, `la2`, `oc1`
- **europe**: `euw1`, `eun1`, `tr1`, `ru`  
- **asia**: `kr`, `jp1`
- **sea**: `ph2`, `sg2`, `th2`, `tw2`, `vn2`

### URLs das APIs
- **Account API**: `https://americas.api.riotgames.com`
- **Summoner API**: `https://br1.api.riotgames.com`
- **League API**: `https://br1.api.riotgames.com`

## 📝 Logs de Debug

### Backend Logs (Console)
```
[NEW DEBUG] /api/player/current-details endpoint called - v2
[NEW DEBUG] Getting current summoner from LCU...
[NEW DEBUG] LCU Summoner data: {
  gameName: 'popcorn seller',
  tagLine: 'coup', 
  puuid: '9e7d05fe-ef7f-5ecb-b877-de7e68ff06eb'
}
[NEW DEBUG] Using Riot ID from LCU: popcorn seller#coup
[NEW DEBUG] About to call playerService.getPlayerBySummonerNameWithDetails
[NEW DEBUG] playerService returned data successfully
[NEW DEBUG] Successfully compiled comprehensive data
```

### Frontend Logs (Browser Console)
```
🌐 Loading player data via Electron mode...
✅ Dados carregados do League of Legends automaticamente
Auto Load: Dados carregados automaticamente
```

## 🔧 Configuração e Requisitos

### Dependências Backend
- `axios` - Cliente HTTP para APIs da Riot
- `express` - Framework web
- `ws` - WebSocket para LCU
- `sqlite3` - Banco de dados local

### Variáveis de Ambiente (Opcionais)
```env
RIOT_API_KEY=RGAPI-your-key-here
PORT=3000
NODE_ENV=development
```

### Pré-requisitos
- ✅ League of Legends cliente instalado e funcionando
- ✅ Node.js v20+ 
- ✅ Chave da Riot API (configurada automaticamente via LCU)
- ✅ Porta 3000 disponível

## 📈 Próximos Passos

- [x] ✅ Implementação completa de Riot ID
- [x] ✅ Correção de ordem de endpoints  
- [x] ✅ Integração LCU + Riot API
- [x] ✅ Frontend usando endpoint correto
- [x] ✅ Testes de validação completos
- [ ] 🔄 Cache de dados para otimização
- [ ] 🔄 Rate limiting avançado
- [ ] 🔄 Histórico de partidas via Match API
- **429**: Limite de rate limite excedido
- **400**: Formato inválido de entrada

## Validações

- **Riot ID**: Deve conter exatamente um `#`
- **gameName/tagLine**: Não podem estar vazios
- **PUUID**: Validação de formato UUID v4

## Testes

Use o arquivo `test_endpoints.html` para testar:
- Busca por Riot ID (endpoint unificado)
- Busca por Riot ID (endpoint específico)  
- Busca apenas Account API
- Busca por summoner name legado

## Compatibilidade

✅ **Riot ID** (gameName#tagLine) - Novo formato padrão  
✅ **Summoner Name legado** - Ainda funciona onde disponível  
✅ **PUUID** - Suporte completo  
✅ **Detecção automática** - Não quebra código existente
