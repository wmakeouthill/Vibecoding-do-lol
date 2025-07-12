# Documentação: `LCUService.ts`

O `LCUService.ts`, localizado em `src/backend/services/`, é o componente que estabelece a ponte de comunicação entre o backend da aplicação e o cliente do League of Legends (LCU - League Client Update) rodando localmente na máquina do usuário. Ele é fundamental para obter informações em tempo real e interagir com o estado atual do jogo sem depender da Riot Games API externa, que possui limites de taxa.

## 🎯 Propósito e Funcionalidades Principais

O `LCUService` é responsável por:

1. **Conexão com o LCU:** Detecta e estabelece uma conexão segura com a API interna do cliente League of Legends, utilizando o `lockfile` ou informações do processo para obter a porta e o token de autenticação.
2. **Obtenção de Dados do Summoner:** Permite buscar informações detalhadas sobre o summoner atualmente logado no cliente do jogo (nome de exibição, ID, PUUID, nível, etc.).
3. **Monitoramento do Fluxo do Jogo (`Gameflow`):** Acompanha o estado do cliente LoL (ex: no lobby, em queue, em seleção de campeões, em jogo, pós-jogo), acionando lógicas específicas para cada fase.
4. **Obtenção de Detalhes da Partida:** Coleta dados em tempo real sobre a partida atual (jogadores, campeões, eventos).
5. **Histórico de Partidas Local:** Acessa o histórico de partidas diretamente do cliente, que pode ser mais rápido ou mais detalhado para partidas recentes do que a API externa.
6. **Estatísticas de Ranked:** Recupera informações de ranqueada do summoner.
7. **Sincronização de Eventos de Jogo:** Detecta o início e o fim de partidas para notificar outros serviços (como `GameInProgressService` e `DiscordService`), garantindo que o backend esteja ciente do estado do jogo.

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `initialize`, `findLeagueClient`, `connectToLCU`)

* O construtor pode receber uma instância do `RiotAPIService` e inicializa o `DataDragonService`.
* O método `setDatabaseManager`, `setMatchHistoryService` e `setDiscordService` são usados para injetar outras dependências, mostrando que o serviço pode ser configurado dinamicamente.
* **`initialize()`:** Tenta conectar ao LCU com retries. Primeiro, ele chama `findLeagueClient()`.
* **`findLeagueClient()`:** Esta é a parte mais crítica. Ela tenta localizar as credenciais de conexão do LCU:
    1. **Busca por `lockfile`:** Tenta ler o arquivo `lockfile` (geralmente em `AppData/Local/Riot Games/League of Legends/lockfile`), que contém a porta e o token de autenticação. Este é o método mais confiável no Windows.
    2. **WMIC (Windows Management Instrumentation Command-line):** Como fallback, utiliza `wmic` para inspecionar a linha de comando do processo `LeagueClientUx.exe` em busca dos parâmetros `--app-port` e `--remoting-auth-token`.
* **`connectToLCU()`:** Uma vez que as `connectionInfo` são obtidas, ele cria uma instância do `axios` configurada para ignorar certificados auto-assinados (necessário para LCU HTTPS) e com as credenciais de autenticação. Um `ping` (`getCurrentSummoner()`) é realizado para testar a conexão.
* Durante a inicialização, também garante que os dados dos campeões sejam carregados via `DataDragonService`.

### Obtenção de Dados

* **`getCurrentSummoner()`:** Faz uma requisição GET para `/lol-summoner/v1/current-summoner` para obter o perfil do invocador logado.
* **`getGameflowPhase()`:** Retorna a fase atual do cliente (ex: `None`, `Lobby`, `Matchmaking`, `ChampSelect`, `InProgress`, `EndOfGame`).
* **`getCurrentMatchDetails()`:** Obtém informações detalhadas da partida em que o usuário está, incluindo jogadores, seus campeões, e `pick_ban_data`.
* **`captureAllPlayerData()`:** Combina informações do summoner atual com dados de ranqueada e maestria de campeões.
* Métodos como `getRankedStats()`, `getChampionMastery()`, `getLocalMatchHistory()` (`/lol-match-history/v1/products/leagueoflegends/current-summoner/matches`) e `getMatchDetails()` (`/lol-match-history/v1/games/<gameId>`) fornecem acesso a outros endpoints da LCU API.

### Monitoramento de Jogo (`startGameMonitoring`, `checkGameStatus`, `handleGameStart`, `handleGameEnd`, `handleGameCancel`)

* **`startGameMonitoring()`:** Configura um `setInterval` que periodicamente chama `checkGameStatus()` para monitorar a fase atual do jogo no LCU.
* **`checkGameStatus()`:** Compara a `gameflowPhase` atual com a `lastGameflowPhase` para detectar transições de estado.
* **`handleGameStart()`:** Chamado quando uma partida começa. Envia o `gameId` e os dados do summoner para o `GameInProgressService` (se disponível) para iniciar o monitoramento da partida.
* **`handleGameEnd()`:** Chamado quando uma partida termina. Tenta obter o resultado da partida (vencedor, duração) e notifica o `GameInProgressService` e o `DiscordService` para processar o fim do jogo e limpar os canais.
* **`handleGameCancel()`:** Acionado se uma partida é cancelada, notificando os serviços relevantes.

## 🛠️ Tecnologias e Implementação

* **Node.js `child_process` (`exec`):** Usado para executar comandos de sistema (como `wmic` no Windows) para encontrar informações do cliente League of Legends.
* **`fs` e `path`:** Para leitura do `lockfile`.
* **`axios`:** Cliente HTTP para fazer requisições para a API REST do LCU.
* **`https`:** Usado para configurar o agente HTTPS (`rejectUnauthorized: false`) para ignorar o certificado auto-assinado do LCU.
* **TypeScript:** Garante a tipagem forte das respostas da LCU API e das estruturas de dados internas.
* **`setInterval`:** Para implementar o monitoramento periódico do estado do jogo.
* **Injeção de Dependência:** Recebe instâncias de `DatabaseManager`, `MatchHistoryService`, `DataDragonService` e `DiscordService`, demonstrando uma arquitetura modular.

## ⚠️ Considerações e Boas Práticas

* **Confiabilidade da Conexão:** A lógica de `findLeagueClient()` precisa ser robusta para diferentes ambientes e instalações do LoL. A leitura do `lockfile` é preferível ao `wmic` devido à sua confiabilidade.
* **Tratamento de Erros:** O serviço deve ser resiliente a falhas de conexão com o LCU ou respostas inesperadas da API. Implementar retries e tratamento de erros adequado é crucial.
* **Performance:** Requisições frequentes à LCU API podem impactar o desempenho do cliente LoL. É importante otimizar a frequência das chamadas (ex: usando o `gameMonitorInterval` de forma inteligente).
* **Permissões:** Em alguns sistemas, o acesso ao `lockfile` ou a execução de `wmic` pode exigir permissões elevadas.
* **Segurança:** Embora seja uma API local, é importante garantir que não haja vetores de ataque que possam ser explorados através da interação com o LCU.
* **Atualizações do LCU:** As APIs do LCU podem mudar com as atualizações do cliente. O serviço deve ser flexível o suficiente para se adaptar a essas mudanças ou, pelo menos, falhar graciosamente.
* **Notificações de Fim de Jogo:** A detecção do `handleGameEnd()` e o envio de dados para o `GameInProgressService` são cruciais para que o backend possa processar o resultado da partida customizada e o LP/MMR.
