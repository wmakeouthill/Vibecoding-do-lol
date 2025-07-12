# Documentação: `MatchHistoryService.ts`

O `MatchHistoryService.ts`, localizado em `src/backend/services/`, é o serviço encarregado de coletar, processar e persistir o histórico de partidas de League of Legends para os jogadores. Sua funcionalidade principal é garantir que a aplicação tenha acesso aos dados de partidas, sejam eles obtidos via API oficial da Riot Games ou através de métodos alternativos quando a API Key não está disponível.

## 🎯 Propósito e Funcionalidades Principais

O `MatchHistoryService` desempenha as seguintes funções:

1. **Captura de Histórico de Partidas:** Obtém dados de partidas recentes de jogadores, com uma preferência pela API oficial da Riot.
2. **Modo de Operação Duplo:**
    * **Com API Key:** Utiliza o `RiotAPIService` para acessar o histórico de partidas detalhado e oficial.
    * **Sem API Key (Modo "Porofessor"):** Em ambientes sem uma chave de API Riot configurada, ele tenta capturar dados básicos do LCU e pode ser estendido para integrar-se com serviços públicos (via web scraping, por exemplo) para obter informações adicionais.
3. **Persistência de Dados:** Salva as informações das partidas no banco de dados via `DatabaseManager`, evitando duplicações.
4. **Atualização de MMR:** Processa os resultados das partidas para atualizar o MMR (`current_mmr`) dos jogadores no banco de dados, refletindo seu desempenho.

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `checkApiKey`)

* O construtor recebe instâncias de `RiotAPIService` e `DatabaseManager`.
* Ele inicializa uma instância de `PublicRiotDataService` (atualmente um placeholder para dados públicos).
* **`checkApiKey()`:** Este método assíncrono verifica se o `RiotAPIService` tem uma chave de API configurada. Essa flag (`hasApiKey`) determina qual método de captura de histórico será utilizado.

### Captura de Partidas (`captureLatestMatch`)

* Este é o método principal para iniciar a captura do histórico de partidas para um dado `puuid` de jogador.
* Ele delega a chamada para `captureWithApiKey()` se uma chave de API estiver disponível, ou para `captureWithoutApiKey()` caso contrário.

### Captura com API Key (`captureWithApiKey`)

* Faz uma chamada para `riotAPI.getMatchHistory()` para obter os IDs das partidas mais recentes.
* Para cada `matchId` obtido, chama `riotAPI.getMatchDetails()` para buscar os detalhes completos da partida.
* Invoca `saveMatchToDatabase()` para armazenar os detalhes da partida e processar o MMR.

### Captura sem API Key (`captureWithoutApiKey`)

* Este método é invocado quando não há uma chave de API Riot configurada.
* Atualmente, ele registra dados básicos da partida usando o `gameId` fornecido pelo LCU (se disponível) através de `saveBasicMatchData()`.
* Possui um placeholder para `publicService.getPublicMatchHistory()`, indicando uma futura integração com fontes de dados públicas (ex: web scraping de sites de estatísticas de LoL).

### Salvamento de Dados (`saveMatchToDatabase`, `saveBasicMatchData`)

* **`saveMatchToDatabase(matchData, playerPuuid)`:**
  * Localiza o jogador na lista de participantes da partida.
  * Verifica se a partida já existe no banco de dados (`dbManager.getRiotMatchByGameId`) para evitar duplicações.
  * Prepara um objeto `matchToSave` com os dados relevantes da partida (ID, modo, duração, participantes, resultado do jogador).
  * Chama `dbManager.saveRiotMatch()` para persistir a partida.
  * **Atualização de MMR:** Após salvar a partida, ele busca o perfil do jogador no banco de dados e atualiza seu `current_mmr` com base no resultado da partida (vitória/derrota), utilizando uma lógica simples de ganho/perda de MMR.
* **`saveBasicMatchData(matchData, playerPuuid)`:** Usado no modo sem API Key para salvar apenas as informações essenciais da partida.

### Métodos de Consulta de Histórico (`getPlayerMatchHistory`, `getPlayerStats`)

* **`getPlayerMatchHistory(playerId, limit)`:** Busca o histórico de partidas de um jogador específico no banco de dados.
* **`getPlayerStats(playerId)`:** Recupera estatísticas gerais de um jogador, como vitórias, derrotas e o total de jogos.

## 🛠️ Tecnologias e Implementação

* **TypeScript:** Garante a tipagem forte das interfaces de dados (`MatchData`) e a modularidade do serviço.
* **`RiotAPIService`:** Injetado via construtor, é a dependência primária para obter dados oficiais da Riot API.
* **`DatabaseManager`:** Injetado via construtor, é responsável por todas as operações de persistência de dados no MySQL.
* **`axios`:** (Implícito, via `RiotAPIService`) Usado para fazer requisições HTTP para as APIs da Riot e, potencialmente, para serviços públicos.
* **`PublicRiotDataService`:** Uma classe auxiliar (atualmente com lógica mockada) que demonstra a intenção de coletar dados de fontes públicas ou de terceiros.

## ⚠️ Considerações e Boas Práticas

* **Robustez do `PublicRiotDataService`:** A implementação atual de `PublicRiotDataService` é um placeholder. Para que o modo "sem API Key" seja funcional, seria necessário implementar web scraping ou integração com APIs de terceiros confiáveis, o que pode ser frágil e sujeito a mudanças.
* **Cálculo de MMR:** O cálculo de MMR é simplificado (`+25/-20`). Para um sistema de matchmaking mais preciso, um algoritmo de MMR mais sofisticado (como Elo ou TrueSkill) seria recomendado.
* **Tratamento de Rate Limit:** Ao usar a Riot API (via `RiotAPIService`), é crucial que o `RiotAPIService` lide de forma robusta com os limites de taxa da API para evitar bloqueios.
* **Consistência de Dados:** Garantir que os dados de histórico de partidas (oficiais e customizadas) sejam consistentes e que o MMR reflita corretamente o desempenho do jogador.
* **Logs Detalhados:** Manter logs claros sobre qual método de captura (com ou sem API Key) foi usado e quaisquer erros na obtenção ou salvamento de dados.
* **Testes:** Testes unitários para a lógica de salvamento e atualização de MMR são importantes. Testes de integração para a comunicação com a Riot API e o banco de dados também seriam benéficos.
