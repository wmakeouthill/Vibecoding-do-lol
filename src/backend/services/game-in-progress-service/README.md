# Documentação: `GameInProgressService.ts`

O `GameInProgressService.ts`, localizado em `src/backend/services/`, é o serviço encarregado de gerenciar o ciclo de vida das partidas customizadas uma vez que elas transicionam da fase de draft para o estado "em progresso". Ele atua como um monitor e orquestrador para tudo o que acontece durante e após o jogo, incluindo eventos, resultados e a integração com outros serviços.

## 🎯 Propósito e Funcionalidades Principais

As responsabilidades chave do `GameInProgressService` são:

1. **Início de Jogo:** Inicia uma nova partida quando o draft é finalizado, configurando o estado inicial do jogo.
2. **Monitoramento de Jogo:** Monitora continuamente partidas que estão em status de `'game_starting'` ou `'in_progress'` no banco de dados, garantindo a resiliência do estado do jogo.
3. **Registro de Eventos:** Permite o registro de vários eventos de jogo (ex: início, desconexão/reconexão de jogadores, fim de jogo, rendição), mantendo um histórico detalhado da partida.
4. **Finalização de Jogo:** Gerencia o término da partida, seja por vitória, rendição, desconexão ou cancelamento, atualizando o status e os resultados no banco de dados.
5. **Processamento Pós-Jogo:** Calcula e aplica as recompensas ou penalidades de LP/MMR aos jogadores com base no resultado da partida.
6. **Sincronização em Tempo Real:** Envia atualizações de estado do jogo e eventos para o frontend via WebSockets, mantendo a interface do usuário atualizada.
7. **Integração com Discord:** Notifica o `DiscordService` para limpar os canais de voz da partida quando o jogo termina.

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `initialize`)

* O construtor recebe instâncias de `DatabaseManager`, o servidor WebSocket (`wss`) e o `DiscordService`.
* O método `initialize()` é assíncrono e é o ponto de partida do serviço:
    1. Inicia o monitoramento contínuo de jogos (`startGameMonitoring()`), que periodicamente verifica o banco de dados para novas partidas ou atualizações.
    2. Carrega jogos ativos existentes do banco de dados (`loadActiveGames()`) para restaurar o estado em caso de reinício do serviço.

### Início de Jogo (`startGame(matchId, draftResults)`)

* Chamado pelo `DraftService` quando um draft é concluído.
* Busca os detalhes da partida no `DatabaseManager` e prepara a estrutura `GameData` com informações sobre times, jogadores, e resultados do draft.
* Atualiza o status da partida no banco de dados para `'in_progress'`.
* Adiciona a partida à coleção `activeGames` (cache local).
* Notifica o frontend sobre o início do jogo (`notifyGameStarted()`) via WebSocket.

### Registro de Eventos (`recordGameEvent`)

* Permite registrar eventos importantes durante a partida (ex: `player_disconnect`, `game_end`).
* Adiciona o evento à lista `gameEvents` dentro do `GameData` da partida correspondente.
* Notifica o frontend sobre o novo evento (`notifyGameEvent()`).

### Finalização de Jogo (`finishGame(matchId, gameResult)`)

* Chamado para finalizar uma partida com base em um `GameResult` (vencedor, duração, motivo do término).
* Atualiza o status da partida para `'completed'` no `GameData` local.
* Registra um evento `'game_end'`.
* Atualiza o banco de dados com o status final, vencedor, duração e todos os eventos de jogo (`dbManager.updateCustomMatchStatus`, `dbManager.updateCustomMatch`).
* Invoca `processPostGameRewards()` para ajustar o LP/MMR dos jogadores.
* Se o `DiscordService` estiver disponível, chama `discordService.cleanupMatchByCustomId()` para limpar os canais de voz do Discord associados à partida.
* Notifica o frontend sobre o término do jogo (`notifyGameFinished()`).
* Remove a partida de `activeGames`.

### Cancelamento de Jogo (`cancelGame(matchId, reason)`)

* Permite cancelar uma partida em andamento, por exemplo, em caso de problemas.
* Registra um evento de cancelamento.
* Atualiza o status da partida no banco de dados para `'cancelled'`.
* Notifica o frontend sobre o cancelamento (`notifyGameCancelled()`).
* Remove a partida de `activeGames`.

### Processamento Pós-Jogo (`processPostGameRewards`)

* Esta função, provavelmente implementada internamente, calcula as mudanças de LP/MMR para cada jogador com base no resultado da partida (`winnerTeam`, `duration`) e nos dados do draft (`draftResults`).
* Atualiza os perfis dos jogadores no banco de dados via `DatabaseManager`.

### Monitoramento Contínuo (`startGameMonitoring`, `monitorGames`, `loadActiveGames`)

* `startGameMonitoring()`: Configura um `setInterval` que chama `monitorGames()` periodicamente.
* `monitorGames()`: Busca por partidas no banco de dados que estão em transição (`game_starting`) ou ativas (`in_progress`) e garante que elas sejam gerenciadas corretamente.
* `loadActiveGames()`: Carrega partidas `in_progress` do banco de dados na inicialização para reestabelecer o estado do serviço.

### Comunicação com Clientes

* **`notifyGameStarted()`:** Envia detalhes do jogo iniciado para os clientes.
* **`notifyGameEvent()`:** Notifica sobre eventos específicos que ocorrem durante o jogo.
* **`notifyGameFinished()`:** Informa sobre o término do jogo e seus resultados.
* **`notifyGameCancelled()`:** Anuncia o cancelamento de uma partida.
* Todos os broadcasts são feitos via `this.wss.clients.forEach(...)`.

## 🛠️ Tecnologias e Implementação

* **TypeScript:** Garante a tipagem forte das estruturas de dados como `GameData`, `GamePlayer`, `GameEvent` e `GameResult`.
* **WebSockets (`ws`):** Essencial para a comunicação em tempo real com o frontend, provendo atualizações dinâmicas sobre o estado do jogo e eventos.
* **`DatabaseManager`:** Injetado via construtor, é a camada de persistência para o estado do jogo, resultados e eventos.
* **`DiscordService`:** Opcionalmente injetado, permite que o `GameInProgressService` interaja com o Discord para gerenciar canais de voz e notificações de jogo.
* **`Map`:** A coleção `activeGames` utiliza um `Map` para armazenar o estado dos jogos ativos, oferecendo acesso eficiente por `matchId`.
* **`setInterval`:** Utilizado para implementar o monitoramento periódico de jogos.

## ⚠️ Considerações e Boas Práticas

* **Resiliência:** A capacidade de carregar jogos ativos do banco de dados na inicialização (`loadActiveGames()`) é crucial para a resiliência, permitindo que o serviço se recupere de interrupções.
* **Precisão dos Eventos:** Garantir que os eventos de jogo sejam registrados com precisão e em tempo real é vital para a integridade do histórico da partida.
* **Tratamento de Desconexões:** A lógica para lidar com jogadores que se desconectam (marcar como desconectados, penalidades) precisa ser robusta.
* **Processamento Pós-Jogo:** A lógica de `processPostGameRewards` é crítica e deve ser exaustivamente testada para garantir que o MMR/LP seja atualizado corretamente.
* **Sincronização LCU:** Para detecção mais precisa de eventos de jogo (início/fim, kills, objetivos), uma integração mais profunda com o LCU (League of Legends Client Update) seria necessária. Isso pode ser feito através do `LCUService`.
* **UX/UI:** O frontend precisa de uma representação clara do estado do jogo, dos eventos e dos resultados finais para os jogadores.
* **Logging:** Detalhar os logs de eventos de jogo e transições de estado é fundamental para depuração e auditoria.
