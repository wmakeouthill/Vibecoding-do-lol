# Documentação: `MatchmakingService.ts`

O `MatchmakingService.ts`, localizado em `src/backend/services/`, é o coração do sistema de emparelhamento de jogadores da aplicação. Ele é responsável por gerenciar a fila de matchmaking, balancear equipes com base em MMR e preferências de lane, criar partidas, e coordenar o fluxo entre os serviços de `MatchFound`, `Draft` e `GameInProgress`. Além disso, ele mantém uma comunicação constante com o frontend via WebSockets para fornecer atualizações em tempo real do estado da fila.

## 🎯 Propósito e Funcionalidades Principais

O `MatchmakingService` orquestra as seguintes funcionalidades:

1. **Gerenciamento da Fila:** Adiciona e remove jogadores da fila, mantendo um controle sobre sua posição e tempo de espera.
2. **Sincronização com o Banco de Dados:** Carrega jogadores da fila persistente do banco de dados na inicialização e sincroniza o cache local com a tabela `queue_players` em intervalos regulares, garantindo que o estado da fila seja persistente e consistente.
3. **Balanceamento de Equipes:** Implementa uma lógica sofisticada para formar duas equipes (azul e vermelho) a partir dos jogadores na fila, considerando o MMR, as preferências de lane (primária/secundária) e minimizando o autofill.
4. **Criação de Partidas:** Uma vez que duas equipes balanceadas são formadas, o serviço cria uma nova partida no banco de dados e notifica o `MatchFoundService`.
5. **Comunicação em Tempo Real:** Utiliza WebSockets para transmitir o status da fila, atividades recentes e eventos de partida encontrada para todos os clientes conectados, proporcionando uma experiência de usuário dinâmica.
6. **Integração de Serviços:** Atua como um orquestrador, invocando `MatchFoundService`, `DraftService` e `GameInProgressService` nas etapas apropriadas do ciclo de vida da partida.
7. **Tratamento de Aceitação/Recusa:** Lida com a fase de aceitação/recusa de partidas, removendo jogadores que não aceitam e ajustando a fila.

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `initialize`)

* O construtor recebe o `DatabaseManager`, o servidor WebSocket (`wss`) e o `DiscordService`, e inicializa as instâncias de `MatchFoundService`, `DraftService` e `GameInProgressService`.
* O método `initialize()` é assíncrono e é o ponto de partida do serviço:
    1. Carrega quaisquer jogadores persistentes da fila do banco de dados (`loadQueueFromDatabase()`).
    2. Adiciona atividades iniciais para logging.
    3. Inicializa os serviços dependentes (`MatchFoundService`, `DraftService`, `GameInProgressService`).
    4. Inicia o `matchmakingInterval` (`startMatchmakingInterval()`) para processar a fila periodicamente.
    5. Inicia o `cacheSyncInterval` (`startCacheSyncInterval()`) para manter a fila local sincronizada com o banco de dados.

### Adição de Jogadores à Fila (`addPlayerToQueue`)

* Recebe um WebSocket e os dados do jogador.
* Verifica se o jogador já está na fila (local ou no banco de dados) para garantir um único registro.
* Adiciona o jogador à fila interna (`this.queue`) e, crucialmente, ao banco de dados via `dbManager.addPlayerToQueue()`.
* Atualiza as posições na fila e adiciona uma atividade (`player_joined`).
* Envia uma notificação de `queue_joined` ao jogador e transmite uma atualização da fila para todos os clientes via WebSocket.

### Processamento de Matchmaking (`processMatchmaking`, `createMatchFromQueue`)

* O método `processMatchmaking()` é executado periodicamente (`matchmakingInterval`).
* Ele verifica se há jogadores suficientes na fila para formar uma partida (geralmente 10).
* **`balanceTeamsByMMRAndLanes()`:** Esta é a lógica central. Tenta formar duas equipes balanceadas usando um algoritmo que considera o MMR e as preferências de lane dos jogadores.
* Se as equipes forem balanceadas com sucesso, ele remove os jogadores da fila local e do banco de dados (`removePlayersFromQueue()`).
* Cria uma nova partida no banco de dados (`dbManager.createCompleteMatch()`).
* Notifica o `MatchFoundService` sobre a nova partida (`matchFoundService.notifyMatchFound()`), que iniciará a fase de aceitação.

### Gerenciamento da Aceitação de Partidas (`acceptMatch`, `declineMatch`)

* **`acceptMatch()`:** Chamado quando um jogador aceita uma partida. Se todos os jogadores aceitarem, a partida avança para a fase de draft via `draftService.startDraft()`.
* **`declineMatch()`:** Chamado quando um jogador recusa uma partida. Se a partida for recusada por qualquer jogador (ou tempo limite), ela é cancelada (`matchFoundService.cancelMatch()`), e os jogadores podem ser requeuedos (`requeuePlayersAfterDecline()`).

### Comunicação em Tempo Real (`broadcastQueueUpdate`)

* O método `broadcastQueueUpdate()` é responsável por enviar o estado atual da fila (número de jogadores, atividades recentes, lista de jogadores) para todos os clientes WebSocket conectados.
* Possui um mecanismo de throttling para evitar o envio excessivo de mensagens.

### Sincronização de Cache (`syncCacheWithDatabase`)

* O `syncCacheWithDatabase()` é executado periodicamente para garantir que a fila em memória (`this.queue`) esteja sempre alinhada com o estado mais recente no banco de dados. Isso é vital para resiliência e para ambientes onde múltiplos processos podem interagir com a mesma fila.

## 🛠️ Tecnologias e Implementação

* **TypeScript:** Garante a tipagem forte de todos os dados e interfaces, como `QueuedPlayer` e `QueueStatus`.
* **WebSockets (`ws`):** Essencial para a comunicação bidirecional e em tempo real com o frontend, mantendo a UI atualizada com o estado do matchmaking.
* **`DatabaseManager`:** Injetado via construtor, é a camada de abstração para todas as operações de persistência de dados no MySQL.
* **`MatchFoundService`, `DraftService`, `GameInProgressService`:** Demonstra o padrão de injeção de dependência e a modularidade da arquitetura de serviços.
* **`setInterval`:** Utilizado para implementar a lógica de processamento periódico do matchmaking e a sincronização de cache.
* **Algoritmos de Balanceamento:** A lógica de `balanceTeamsByMMRAndLanes` é um algoritmo customizado para otimizar a formação de equipes.

## ⚠️ Considerações e Boas Práticas

* **Robustez da Lógica de Balanceamento:** A complexidade do balanceamento de equipes pode ser um ponto de falha. Aprimoramentos podem incluir algoritmos mais avançados (GA, IA) para cenários de fila difíceis.
* **Tratamento de Conexões WebSocket:** O serviço precisa lidar graciosamente com desconexões de clientes, removendo-os da fila ou marcando-os como inativos. O `websocket: null as any` no `QueuedPlayer` sugere que o WebSocket pode não estar sempre presente, o que pode indicar a necessidade de um sistema de reconexão ou reatribuição.
* **Persistência de Estado:** A sincronização regular com o banco de dados é uma boa prática, mas é importante garantir que não haja condições de corrida ou perdas de dados em cenários de alta concorrência ou falhas inesperadas.
* **Feedback ao Usuário:** As mensagens de atividade na fila e as estimativas de tempo são cruciais para a experiência do usuário. Mantê-las precisas e informativas é um desafio.
* **Testes:** Devido à complexidade e criticidade do matchmaking, testes unitários e de integração extensivos são essenciais para todas as fases, desde a adição à fila até a formação da partida.
* **Escalabilidade:** Para um grande volume de jogadores, a performance do algoritmo de balanceamento e a eficiência das operações de banco de dados serão críticas. Considerar a distribuição de carga se a aplicação crescer.
