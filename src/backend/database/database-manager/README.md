# Documentação: `DatabaseManager.ts`

O arquivo `DatabaseManager.ts`, localizado em `src/backend/database/`, é o componente central da camada de persistência de dados do backend. Ele é responsável por gerenciar todas as interações com o banco de dados MySQL, garantindo a integridade e a consistência dos dados da aplicação.

## 🎯 Propósito e Funcionalidades Principais

A classe `DatabaseManager` provê uma interface robusta para operações de banco de dados, encapsulando a lógica de conexão, criação de tabelas e manipulação de dados para diversas entidades da aplicação. Suas principais responsabilidades incluem:

1. **Gerenciamento de Conexões MySQL:** Estabelece e gerencia um pool de conexões MySQL, otimizando o uso de recursos e a performance das requisições ao banco de dados.
2. **Criação e Manutenção de Tabelas:** Garante que todas as tabelas necessárias para o funcionamento da aplicação existam e estejam com a estrutura correta. As tabelas principais gerenciadas são:
    * `players`: Armazena informações de jogadores, incluindo MMR (Matchmaking Rating) e estatísticas de partidas customizadas.
    * `matches`: Registra informações sobre partidas oficiais de League of Legends vinculadas ao sistema.
    * `custom_matches`: Gerencia dados de partidas customizadas criadas e jogadas dentro da aplicação.
    * `discord_lol_links`: Armazena os vínculos entre IDs de usuários do Discord e contas de League of Legends.
    * `settings`: Persiste configurações globais da aplicação, como fatores de MMR, tempos limite de fila, etc.
    * `queue_players`: Mantém o estado dos jogadores atualmente na fila de matchmaking.
3. **Operações CRUD:** Oferece métodos para Criar (Create), Ler (Read), Atualizar (Update) e Deletar (Delete) registros nas tabelas gerenciadas, abstraindo a complexidade das queries SQL.
4. **Gerenciamento de LP Customizado:** Contém lógica para recalcular e atualizar o LP (League Points) customizado dos jogadores com base nos resultados das partidas customizadas.
5. **Estatísticas e Monitoramento:** Provê métodos para obter contagens de jogadores e estatísticas gerais das tabelas, auxiliando no monitoramento do estado do banco de dados.
6. **Integração com `DataDragonService`:** Durante a inicialização, invoca o `DataDragonService` para carregar dados de campeões, que podem ser usados por outras partes do backend.

## ⚙️ Lógica e Funcionamento

### Inicialização (`initialize()`)

O método `initialize()` é o ponto de entrada para a configuração do banco de dados. Ele realiza as seguintes etapas:

* **Verificação de Variáveis de Ambiente:** Assegura que as credenciais e configurações do MySQL (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT) estejam definidas.
* **Criação do Pool de Conexões:** Utiliza `mysql2/promise` para criar um pool de conexões, configurado com parâmetros como `connectionLimit`, `charset`, e `timezone`.
* **Teste de Conexão:** Realiza um `ping` no banco de dados para verificar a conectividade.
* **Configuração de Charset:** Define o charset da conexão para `utf8mb4` para garantir o correto tratamento de caracteres especiais.
* **Criação de Tabelas:** Chama `createTables()` para criar todas as tabelas necessárias se elas ainda não existirem.
* **Inclusão de Configurações Padrão:** Insere configurações iniciais na tabela `settings` através de `insertDefaultSettings()`.
* **Inicialização do `DataDragonService`:** Garante que os dados dos campeões sejam carregados para uso em toda a aplicação.

### Criação de Tabelas (`createTables()`)

Este método contém as declarações SQL para criar cada uma das tabelas. Ele utiliza `CREATE TABLE IF NOT EXISTS` para evitar erros caso as tabelas já existam. Além disso, gerencia a adição de `constraints` e a correção de estruturas de tabela, como a adição da coluna `match_leader` e a verificação do `charset` da tabela `settings`.

### Métodos de Manipulação de Dados

A classe expõe uma série de métodos assíncronos para interagir com cada tabela:

* **Jogadores (`players`):**
  * `getPlayer`, `createPlayer`, `updatePlayer`, `deletePlayer`, `getAllPlayers`, `getPlayerBySummonerName`, `updatePlayerMMR`.
* **Partidas (`matches`):**
  * `createMatch`, `updateMatchStatus`, `getMatchById`, `updateMatchLeader`.
* **Partidas Customizadas (`custom_matches`):**
  * `createCustomMatch`, `updateCustomMatch`, `getCustomMatchById`, `getActiveCustomMatches`, `getCustomMatchesBySummonerName`, `deleteCustomMatch`, `clearCustomMatchesTable`, `updateCustomMatchParticipants`, `updateCustomMatchPickBan`.
* **Vinculações Discord-LoL (`discord_lol_links`):**
  * `linkDiscordAccount`, `getDiscordLolLink`, `verifyDiscordLink`, `updateDiscordLinkLastUsed`.
* **Configurações (`settings`):**
  * `getSetting`, `setSetting`, `insertDefaultSettings`.
* **Fila de Jogadores (`queue_players`):**
  * `addPlayerToQueue`, `getPlayersInQueue`, `removePlayerFromQueue`, `updatePlayerQueuePosition`, `clearQueue`, `getQueuePlayerBySummonerName`.

### Manutenção e Utilitários

* **`recalculateCustomLP()`:** Processa partidas customizadas completadas para atualizar o LP (`custom_lp`) e o MMR de pico (`custom_peak_mmr`) dos jogadores.
* **`getPlayersCount()` e `getTablesStats()`:** Fornecem métricas sobre o número de jogadores e estatísticas de contagem de registros por tabela.
* **`close()`:** Encerra o pool de conexões MySQL de forma graciosa.

## 🛠️ Tecnologias e Implementação

* **`mysql2/promise`:** Driver MySQL para Node.js com suporte a `Promises`, facilitando o trabalho com operações assíncronas.
* **TypeScript:** Garante tipagem forte, melhorando a manutenibilidade e reduzindo erros em tempo de desenvolvimento.
* **Pool de Conexões:** Implementação de um pool para reutilizar conexões e gerenciar eficientemente as requisições ao banco.
* **SQL:** Utilização de `template literals` para construir queries SQL, embora seja importante garantir a segurança contra SQL Injection (o que `mysql2/promise` ajuda a mitigar com `prepared statements`).

## ⚠️ Considerações e Boas Práticas

* **Segurança:** A utilização de `prepared statements` com `mysql2/promise` é fundamental para prevenir SQL Injection. Credenciais do banco de dados devem ser gerenciadas via variáveis de ambiente e não hardcoded.
* **Tratamento de Erros:** Todos os métodos assíncronos incluem blocos `try-catch` para lidar com erros de banco de dados, mas é crucial que a camada superior (serviços) também implemente tratamento de erros adequado.
* **Performance:** Para tabelas com grande volume de dados, a otimização de queries com índices e a revisão de design de schema são essenciais.
* **Migrações:** Para um ambiente de produção, um sistema de migração de banco de dados (ex: `knex`, `TypeORM Migrations`) seria recomendado para gerenciar mudanças no schema de forma controlada.
* **Normalização:** As tabelas parecem bem normalizadas para os dados que armazenam, mas é sempre bom revisar o design do schema para otimização futura.
