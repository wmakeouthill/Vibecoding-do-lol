# Sistema de MMR e LP para Partidas Customizadas

## Resumo
Este documento descreve a implementação do sistema de MMR (MatchMaking Rating) e LP (League Points) para partidas customizadas no aplicativo League of Legends Matchmaking.

## Características do Sistema

### 1. MMR Personalizado
- **MMR Inicial**: 1000 pontos para novos jogadores
- **Sistema Elo**: Baseado no sistema de ranking Elo tradicional
- **Fator K**: 32 (padrão para sistemas de ranking dinâmicos)

### 2. Cálculo de LP (League Points)

#### Fórmula Base
- **Vitória**: +18 LP (base)
- **Derrota**: -15 LP (base)

#### Ajustes por Diferença de MMR
- Para cada 100 pontos de diferença de MMR, o LP é ajustado em ±8
- **Exemplo**: Se seu MMR é 1200 e o adversário é 1400 (diferença de +200):
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

#### Jogador Iniciante (MMR 1000)
- Contra adversário MMR 1000: +19 LP (vitória) / -14 LP (derrota)
- Contra adversário MMR 1200: +27 LP (vitória) / -6 LP (derrota)

#### Jogador Intermediário (MMR 1500)
- Contra adversário MMR 1500: +18 LP (vitória) / -15 LP (derrota)
- Contra adversário MMR 1300: +10 LP (vitória) / -23 LP (derrota)

#### Jogador Avançado (MMR 1900)
- Contra adversário MMR 1900: +17 LP (vitória) / -16 LP (derrota)
- Contra adversário MMR 1700: +9 LP (vitória) / -24 LP (derrota)

## Implementação Técnica

### Banco de Dados

#### Tabela `players` - Novas Colunas
```sql
custom_mmr INTEGER DEFAULT 1000,
custom_peak_mmr INTEGER DEFAULT 1000,
custom_games_played INTEGER DEFAULT 0,
custom_wins INTEGER DEFAULT 0,
custom_losses INTEGER DEFAULT 0,
custom_win_streak INTEGER DEFAULT 0
```

#### Tabela `custom_matches` - Novas Colunas
```sql
lp_changes TEXT,               -- JSON com mudanças de LP por jogador
average_mmr_team1 INTEGER,     -- MMR médio do time 1
average_mmr_team2 INTEGER      -- MMR médio do time 2
```

### Funções Principais

#### `calculateLPChange(playerMMR, opponentMMR, isWin)`
Calcula a mudança de LP baseada nos MMRs e resultado.

#### `calculateMMRChange(playerMMR, opponentMMR, isWin)`
Calcula a mudança de MMR usando o sistema Elo.

#### `updatePlayerCustomStats(playerIdentifier, isWin, lpChange, mmrChange)`
Atualiza as estatísticas do jogador após uma partida.

### Interface do Usuário

#### Exibição de LP
- **Partidas Riot API**: Não mostram LP (continuam mostrando "0 LP")
- **Partidas Customizadas**: Mostram LP real ganho/perdido

#### Cores
- **LP Positivo**: Verde (#10b981)
- **LP Negativo**: Vermelho (#ef4444)

## Endpoints da API

### `POST /api/admin/recalculate-custom-lp`
Recalcula LP para todas as partidas customizadas existentes.

### `GET /api/player/:identifier/custom-stats`
Retorna estatísticas customizadas de um jogador específico.

## Migração de Dados

O sistema inclui migração automática que:
1. Adiciona novas colunas às tabelas existentes
2. Mantém compatibilidade com dados antigos
3. Permite recálculo manual de partidas via endpoint administrativo

## Benefícios do Sistema

1. **Progressão Clara**: Jogadores veem progresso real em LP
2. **Matchmaking Balanceado**: MMR considera histórico de partidas customizadas
3. **Incentivo à Participação**: Sistema de recompensas mais dinâmico
4. **Separação de Contextos**: LP só em partidas customizadas, mantendo clareza

## Futuras Melhorias

1. **Ranks Visuais**: Converter MMR em ranks (Bronze, Prata, Ouro, etc.)
2. **Decaimento de MMR**: Redução gradual por inatividade
3. **Bônus de Temporada**: Resets periódicos com recompensas
4. **Sistema de Promoções**: Séries promocionais entre ranks
