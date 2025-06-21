# Histórico de Partidas Customizadas - Paridade com Riot API/LCU

## Objetivo
Garantir que a aba "Partidas Customizadas" exiba o mesmo nível de detalhes e experiência visual que a aba "Riot API" (histórico oficial), utilizando dados reais extraídos do cliente do League of Legends (LCU).

## Estrutura de Dados
- **Campo principal:** `participants_data` (na tabela `custom_matches`)
- **Conteúdo:** Array de objetos, cada um representando um participante da partida, contendo:
  - Nome do jogador (summonerName)
  - Campeão, lane, nível, KDA (kills, deaths, assists)
  - Itens, feitiços, estatísticas detalhadas (gold, dano, farm, etc)
  - Flags de vitória, multi-kills, etc

## Fluxo de Salvamento
1. **Ao finalizar uma partida customizada:**
   - O backend localiza a partida real correspondente no LCU (comparando picks, jogadores e gameId).
   - Extrai todos os dados detalhados dos participantes (`participants` do LCU).
   - Salva esse array completo no campo `participants_data` da tabela `custom_matches`.

2. **No frontend:**
   - O método de mapeamento (`mapApiMatchesToModel`) verifica se existe `participants_data`.
   - Se existir, utiliza esses dados para exibir todos os detalhes (igual à aba "Riot API").
   - Caso não exista, exibe dados mockados.

## Resultado
- O histórico de partidas customizadas terá a mesma riqueza de informações e visual da aba "Riot API":
  - Campeão, lane, KDA, itens, multi-kills, estatísticas completas.
  - Experiência visual e de análise idêntica para ambas as abas.

## Observação
Se notar diferença entre as abas, verifique se o campo `participants_data` está sendo corretamente preenchido ao finalizar a partida customizada. O frontend já está preparado para consumir e exibir esses dados.

---

**Próximos passos:**
- Garantir que todos os fluxos de finalização de partida customizada estejam populando corretamente o campo `participants_data`.
- Testar no frontend a exibição dos detalhes para partidas customizadas recentes.
- Avançar para melhorias de UX, filtros, exportação, etc.
