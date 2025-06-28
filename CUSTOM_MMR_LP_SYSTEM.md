# Sistema de MMR e LP para Partidas Customizadas

## Resumo
Este documento descreve a implementação do sistema de MMR (MatchMaking Rating) e LP (League Points) para partidas customizadas no aplicativo League of Legends Matchmaking.

## Características do Sistema

### 1. MMR Personalizado
- **MMR Inicial**: 0 pontos para novos jogadores (diferente do sistema Riot que começa em 1200)
- **Sistema Elo**: Baseado no sistema de ranking Elo tradicional
- **Fator K**: 16 (mais conservador que o padrão de 32 para progressão mais lenta)

### 2. Cálculo de LP (League Points)

#### Fórmula Base
- **Vitória**: +18 LP (base)
- **Derrota**: -15 LP (base)

#### Ajustes por Diferença de MMR
- Para cada 100 pontos de diferença de MMR, o LP é ajustado em ±8
- **Exemplo**: Se seu MMR é 200 e o adversário é 400 (diferença de +200):
  - Vitória: +18 + (200/100 × 8) = +34 LP
  - Derrota: -15 + (200/100 × 8) = +1 LP (perdas menores contra adversários mais fortes)

#### Ajustes por MMR Atual do Jogador

##### Jogadores com MMR Baixo (< 1200)
- **Vitórias**: +1 LP adicional para cada 50 MMR abaixo de 1200
- **Derrotas**: Perdas reduzidas: +1 LP para cada 100 MMR abaixo de 1200

##### Jogadores com MMR Alto (> 1800)
- **Vitórias**: -1 LP para cada 100 MMR acima de 1800
- **Derrotas**: Perdas aumentadas: -1 LP adicional para cada 80 MMR acima de 1800

#### Limites de LP
- **Vitória**: Mínimo +8 LP, Máximo +35 LP
- **Derrota**: Mínimo -25 LP, Máximo -8 LP

### 3. Exemplos Práticos

#### Jogador Iniciante (MMR 0)
- Contra adversário MMR 0: +19 LP (vitória) / -14 LP (derrota)
- Contra adversário MMR 200: +27 LP (vitória) / -6 LP (derrota)

#### Jogador Intermediário (MMR 500)
- Contra adversário MMR 500: +18 LP (vitória) / -15 LP (derrota)
- Contra adversário MMR 300: +10 LP (vitória) / -23 LP (derrota)

#### Jogador Avançado (MMR 900)
- Contra adversário MMR 900: +17 LP (vitória) / -16 LP (derrota)
- Contra adversário MMR 700: +9 LP (vitória) / -24 LP (derrota)

## Implementação Técnica

### Banco de Dados

#### Tabela `players` - Colunas Utilizadas
```sql
custom_lp INTEGER DEFAULT 0,           -- MMR atual do jogador (começa em 0)
custom_peak_mmr INTEGER DEFAULT 0,     -- MMR mais alto alcançado
custom_games_played INTEGER DEFAULT 0, -- Total de partidas jogadas
custom_wins INTEGER DEFAULT 0,         -- Total de vitórias
custom_losses INTEGER DEFAULT 0        -- Total de derrotas
```

#### Tabela `custom_matches` - Colunas Utilizadas
```sql
lp_changes TEXT,               -- JSON com mudanças de LP por jogador
custom_lp INTEGER,             -- LP total da partida
winner_team INTEGER,           -- Time vencedor (1 ou 2)
status VARCHAR(20)             -- Status da partida
```

### Funções Implementadas

#### `calculateLPChange(playerMMR, opponentMMR, isWin)`
Calcula a mudança de LP baseada nos MMRs e resultado, seguindo exatamente as fórmulas especificadas.

#### `calculateMMRChange(playerMMR, opponentMMR, isWin)`
Calcula a mudança de MMR usando o sistema Elo com fator K = 16 (mais conservador).

#### `getPlayerCurrentMMR(playerString)`
Busca o MMR atual de um jogador na tabela `players`.

#### `calculateTeamAverageMMRWithRealData(teamPlayers)`
Calcula o MMR médio de um time usando dados reais do banco.

### Interface do Usuário

#### Exibição de LP
- **Partidas Riot API**: Não mostram LP (continuam mostrando "0 LP")
- **Partidas Customizadas**: Mostram LP real ganho/perdido

#### Cores
- **LP Positivo**: Verde (#10b981)
- **LP Negativo**: Vermelho (#ef4444)

## Endpoints da API

### `POST /api/admin/recalculate-custom-lp`
Recalcula LP para todas as partidas customizadas existentes usando o novo sistema.

**Resposta:**
```json
{
  "success": true,
  "message": "LP recalculado para X partidas e Y jogadores",
  "affectedMatches": 10,
  "affectedPlayers": 50,
  "details": [...]
}
```

### `GET /api/stats/participants-leaderboard`
Retorna o leaderboard com MMR baseado em partidas customizadas.

## Migração de Dados

O sistema inclui migração automática que:
1. Mantém compatibilidade com dados antigos
2. Permite recálculo manual de partidas via endpoint administrativo
3. Começa novos jogadores com MMR 0

## Benefícios do Sistema

1. **Progressão Clara**: Jogadores veem progresso real em LP começando do zero
2. **Matchmaking Balanceado**: MMR considera histórico de partidas customizadas
3. **Incentivo à Participação**: Sistema de recompensas mais dinâmico
4. **Separação de Contextos**: LP só em partidas customizadas, mantendo clareza
5. **Progressão Conservadora**: Fator K reduzido para progressão mais lenta e realista

## Diferenças do Sistema Riot

| Aspecto | Sistema Riot | Sistema Custom |
|---------|-------------|----------------|
| MMR Inicial | 1200 | 0 |
| Fator K | 32 | 16 |
| Progressão | Rápida | Conservadora |
| Contexto | Ranked Solo/Flex | Partidas Customizadas |

## Como Usar

### 1. Recálculo de Partidas Existentes
```bash
curl -X POST http://localhost:3000/api/admin/recalculate-custom-lp
```

### 2. Teste do Sistema
```bash
node test-mmr-calculation.js
```

### 3. Verificação no Frontend
- As partidas customizadas mostram LP variável baseado no MMR
- O leaderboard reflete o novo sistema de pontuação
- As estatísticas dos jogadores são atualizadas automaticamente

## Futuras Melhorias

1. **Ranks Visuais**: Converter MMR em ranks (Bronze, Prata, Ouro, etc.)
2. **Decaimento de MMR**: Redução gradual por inatividade
3. **Bônus de Temporada**: Resets periódicos com recompensas
4. **Sistema de Promoções**: Séries promocionais entre ranks

## Arquivos de Implementação

- `src/backend/database/DatabaseManager.ts` - Funções de cálculo e recálculo
- `src/backend/server.ts` - Endpoint de recálculo
- `test-mmr-calculation.js` - Script de teste
- `CUSTOM_MMR_LP_SYSTEM.md` - Esta documentação

O sistema agora oferece uma experiência de ranking progressiva começando do zero, similar ao sistema da Riot Games mas adaptado para partidas customizadas com progressão mais conservadora.
