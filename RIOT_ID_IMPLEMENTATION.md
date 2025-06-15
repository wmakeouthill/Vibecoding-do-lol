# Implementação de Busca por Riot ID

## Resumo da Implementação

A implementação foi atualizada para suportar corretamente a busca por **Riot ID** (formato `gameName#tagLine`) conforme a documentação oficial da Riot API.

## Estrutura da API da Riot

### Account API
- **Endpoint**: `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`
- **Uso**: Obter dados da conta usando gameName e tagLine
- **Resposta**: `AccountDto` com `puuid`, `gameName`, `tagLine`
- **Importante**: O endpoint não inclui região, apenas gameName e tagLine. A região é usada apenas para determinar a URL base regional.

### Summoner API  
- **Endpoint**: `/lol/summoner/v4/summoners/by-puuid/{puuid}`
- **Uso**: Obter dados do summoner usando o PUUID
- **Resposta**: `SummonerDto` com dados do summoner

## Métodos Implementados

### 1. `getSummonerByRiotId(gameName, tagLine)`
Busca completa por Riot ID seguindo o fluxo correto:
1. **Account API**: Busca dados da conta usando `gameName#tagLine`
2. **Summoner API**: Usa o PUUID para obter dados do summoner  
3. **League API**: Busca dados ranqueados usando summoner ID

### 2. `getAccountByRiotId(gameName, tagLine, region)`
Busca apenas os dados da conta (AccountDto):
- Retorna: `puuid`, `gameName`, `tagLine`

### 3. `getSummoner(nameInput, region)` - Método Unificado
Detecta automaticamente o tipo de entrada:
- **Riot ID** (contém `#`): usa `getSummonerByRiotId()`
- **Summoner Name legado**: usa `getSummonerByName()`

## Endpoints do Backend

### 1. Endpoint Unificado (Recomendado)
```
GET /api/riot/summoner/{region}/{summonerName}
```
- Aceita tanto Riot ID quanto summoner name legado
- Detecção automática do formato

### 2. Endpoint Específico para Riot ID
```
GET /api/riot/summoner-by-riot-id/{region}/{gameName}/{tagLine}
```
- Busca direta por gameName e tagLine separados
- Retorna dados completos do summoner
- **Nota**: A região é usada para roteamento regional da Account API, mas o endpoint da Riot é `/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`

### 3. Endpoint Só para Account API
```
GET /api/riot/account-by-riot-id/{region}/{gameName}/{tagLine}
```
- Retorna apenas os dados da conta (AccountDto)
- Útil para testes específicos da Account API
- **Nota**: Account API não usa região no endpoint, apenas gameName e tagLine

## Exemplos de Uso

### Frontend (Angular)
```typescript
// Busca por Riot ID
this.apiService.getSummonerData('br1', 'PlayerName#BR1')

// Busca por summoner name legado  
this.apiService.getSummonerData('br1', 'PlayerName')
```

### Teste Direto (HTTP)
```bash
# Riot ID via endpoint unificado
GET /api/riot/summoner/br1/popcorn seller/#coup

# Riot ID via endpoint específico
GET /api/riot/summoner-by-riot-id/br1/PlayerName/BR1

# Apenas Account API
GET /api/riot/account-by-riot-id/br1/PlayerName/BR1
```

## Roteamento Regional

A implementação usa corretamente o roteamento regional:
- **Account API**: URLs regionais (`americas.api.riotgames.com`)
- **Summoner/League APIs**: URLs específicas da plataforma (`br1.api.riotgames.com`)

### Mapeamento de Regiões
- `br1`, `na1`, `la1`, `la2` → `americas`
- `euw1`, `eun1`, `tr1`, `ru` → `europe`  
- `kr`, `jp1` → `asia`
- `ph2`, `sg2`, `th2`, `tw2`, `vn2` → `sea`

## Tratamento de Erros

- **404**: Conta/summoner não encontrado
- **403**: Chave da API inválida
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
