# Documentação: `PlayerService.ts`

O `PlayerService.ts`, localizado em `src/backend/services/`, é o serviço central para todas as operações relacionadas a jogadores dentro da aplicação. Ele atua como um intermediário entre o frontend, o banco de dados e as APIs externas (Riot Games API) para gerenciar o ciclo de vida dos perfis de jogadores, suas estatísticas e seu progresso no sistema de matchmaking.

## 🎯 Propósito e Funcionalidades Principais

O `PlayerService` abrange as seguintes responsabilidades:

1. **Registro de Jogadores:** Permite o registro de novos jogadores na base de dados da aplicação, opcionalmente buscando informações iniciais de MMR e rank na Riot API.
2. **Obtenção e Enriquecimento de Dados:** Recupera perfis de jogadores do banco de dados e os enriquece com dados adicionais (taxa de vitórias, rank formatado, etc.).
3. **Atualização de Dados da Riot API:** Busca e atualiza as informações de um jogador diretamente da Riot API (dados de invocador e ranqueada) para manter o perfil interno atualizado.
4. **Cálculo de MMR e Rank:** Contém a lógica para converter dados de rank da Riot API em um MMR inicial e para mapear o MMR interno da aplicação para um rank de League of Legends (Ferro, Bronze, etc.).
5. **Estatísticas de Jogadores:** Calcula e fornece estatísticas detalhadas de jogadores, como taxa de vitórias, progresso para o próximo rank, e MMR total ganho.
6. **Pesquisa e Leaderboard:** Oferece funcionalidades para pesquisar jogadores e obter um ranking global (leaderboard).

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`)

* O construtor recebe instâncias de `RiotAPIService` e `DatabaseManager`, que são as dependências primárias para interagir com a API da Riot e o banco de dados, respectivamente.

### Registro de Jogadores (`registerPlayer`)

* Recebe o nome do invocador e a região.
* Primeiro, verifica se o jogador já existe no banco de dados para evitar duplicações.
* Tenta buscar `summonerId` e `puuid` na Riot API via `riotAPI.getSummoner()`. Se a Riot API não estiver acessível, o registro prossegue sem esses dados, mas com um aviso.
* Cria um novo registro de jogador no `DatabaseManager` com um MMR inicial padrão (1000).
* Se os dados da Riot API foram obtidos, busca os dados ranqueados (`riotAPI.getRankedData()`) e calcula um `initialMMR` mais preciso com base no rank oficial, atualizando o jogador no banco de dados.
* Retorna o objeto `player` completo do banco de dados.

### Obtenção e Enriquecimento de Dados (`getPlayer`, `getPlayerStats`, `enrichPlayerData`)

* **`getPlayer(playerId)`:** Busca um jogador por seu ID interno no `DatabaseManager` e o enriquece com dados calculados (`enrichPlayerData()`).
* **`getPlayerStats(playerId)`:** Estende `getPlayer` para incluir estatísticas mais detalhadas, como `winRate`, `rank` formatado, `nextRankMMR` e `progressToNextRank`.
* **`enrichPlayerData(player)`:** Método privado que adiciona campos calculados (como `rank` e `winRate`) ao objeto `player` antes de retorná-lo.

### Atualização de Dados da Riot API (`updatePlayerFromRiotAPI`, `getPlayerBySummonerNameWithDetails`, `getPlayerByPuuid`)

* **`updatePlayerFromRiotAPI(playerId)`:** Tenta buscar dados atualizados de invocador e ranqueada na Riot API para um jogador existente (usando `summoner_id` do banco).
* **`getPlayerBySummonerNameWithDetails(displayName, region)`:** Busca dados de invocador diretamente da Riot API usando o formato `gameName#tagLine` (novo sistema de nomes da Riot). Lida com erros de jogador não encontrado.
* **`getPlayerByPuuid(puuid, region)`:** Obtém dados completos de um jogador (conta, invocador, ranqueada) usando o `PUUID`, que é um identificador mais estável na Riot API. Ele consolida informações de diferentes endpoints da Riot API.

### Lógica de MMR e Rank (`calculateInitialMMR`, `calculateRankFromMMR`, `getNextRankMMR`, `calculateRankProgress`)

* **`calculateInitialMMR(rankedData)`:** Converte o rank de um jogador (ex: OURO IV) em um valor de MMR numérico. Utiliza um mapa `tierMMR` e considera a divisão para um cálculo mais preciso.
* **`calculateRankFromMMR(mmr)`:** Faz o caminho inverso, convertendo um valor de MMR numérico de volta para um formato de rank de League of Legends (Tier e Divisão).
* **`getNextRankMMR(currentMMR)`:** Calcula o MMR necessário para alcançar o próximo rank.
* **`calculateRankProgress(currentMMR)`:** Calcula o progresso percentual do jogador dentro do seu rank atual.

### Pesquisa e Leaderboard (`searchPlayers`, `getLeaderboard`)

* **`searchPlayers(query)`:** Permite buscar jogadores no banco de dados por `summoner_name` que corresponda à query.
* **`getLeaderboard(limit)`:** Retorna uma lista de jogadores ordenada por `custom_lp` ou `current_mmr`, formando um ranking.

## 🛠️ Tecnologias e Implementação

* **TypeScript:** Garante a tipagem forte de todas as interfaces e parâmetros, resultando em um código mais robusto e fácil de manter.
* **`RiotAPIService`:** Uma dependência crucial, injetada no construtor, que abstrai as interações com a API pública da Riot Games.
* **`DatabaseManager`:** Também injetado no construtor, é a camada de persistência para todos os dados de jogadores no MySQL.
* **Algoritmos Personalizados:** A lógica de cálculo de MMR e ranqueamento é customizada para o contexto da aplicação.
* **`async/await`:** Utilizado extensivamente para lidar com operações assíncronas de rede e banco de dados, tornando o fluxo de controle mais legível.

## ⚠️ Considerações e Boas Práticas

* **Consistência de MMR:** O `current_mmr` interno é um valor da aplicação, enquanto `calculateInitialMMR` tenta correlacioná-lo com o rank da Riot. É importante decidir se o MMR interno será primário e ajustado por resultados de partidas customizadas, ou se ele será sempre sincronizado com o MMR/Rank da Riot API. Atualmente, parece ser uma combinação.
* **Atualização de Dados da Riot API:** As chamadas à Riot API (`getSummoner`, `getRankedData`) são assíncronas e podem ter limites de taxa. Implementar um cache para esses dados e/ou gerenciar os limites de taxa de forma centralizada no `RiotAPIService` é essencial.
* **Lógica de Rank:** A lógica de mapeamento de MMR para rank (`calculateRankFromMMR`) é uma simplificação. Sistemas de ranqueamento complexos (como o da Riot) têm nuances que podem não ser totalmente replicadas.
* **Tratamento de Erros:** O serviço lida com erros de API da Riot, mas a forma como esses erros são propagados e exibidos ao usuário final deve ser consistente em todo o frontend.
* **Performance da Pesquisa:** Para um grande número de jogadores, `searchPlayers` pode precisar de otimizações de banco de dados (ex: índices `FULLTEXT` ou busca por prefixo otimizada).
* **Dados `PUUID`:** O uso de `PUUID` para identificar jogadores na Riot API é uma boa prática moderna, pois é mais estável que `summonerId` e `summonerName`.
