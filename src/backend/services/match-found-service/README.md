# Documentação: `MatchFoundService.ts`

O `MatchFoundService.ts`, localizado em `src/backend/services/`, é um componente crítico do fluxo de matchmaking, responsável por gerenciar a fase de aceitação/recusa de partidas. Após o `MatchmakingService` formar duas equipes, o `MatchFoundService` assume para garantir que todos os jogadores confirmem sua participação antes que a partida avance para a fase de draft ou para o jogo.

## 🎯 Propósito e Funcionalidades Principais

As principais funções do `MatchFoundService` incluem:

1. **Orquestração da Aceitação:** Inicia e supervisiona o processo de aceitação de partida para um conjunto de jogadores.
2. **Tracking de Status:** Mantém o controle de quais jogadores aceitaram ou recusaram a partida.
3. **Gerenciamento de Timeout:** Implementa um temporizador para garantir que os jogadores aceitem a partida dentro de um prazo definido, cancelando-a se houver recusas ou timeouts.
4. **Notificação de Progresso:** Comunica o status da aceitação (quantos jogadores aceitaram, tempo restante) para o frontend em tempo real via WebSockets.
5. **Integração com Banco de Dados:** Atualiza o status de aceitação dos jogadores no banco de dados (`queue_players` ou tabela de status de aceitação).
6. **Integração com Outros Serviços:** Notifica o `DraftService` quando todos os jogadores aceitam a partida, ou o `MatchmakingService` para requeue jogadores se a partida for cancelada.
7. **Auto-aceitação para Bots:** Automaticamente aceita partidas para jogadores que são bots, com um pequeno atraso para simular o comportamento humano.

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `initialize`)

* O construtor recebe instâncias de `DatabaseManager`, o servidor WebSocket (`wss`) e o `DiscordService` para facilitar a comunicação e persistência.
* O método `initialize()` inicia o monitoramento contínuo de `acceptance_status` no banco de dados (`startAcceptanceMonitoring()`), que periodicamente verifica o estado das partidas pendentes.

### Criação de Partida para Aceitação (`createMatchForAcceptance`)

* Este método é chamado pelo `MatchmakingService` quando uma partida é formada.
* Ele tenta usar um `matchId` existente ou busca uma partida correspondente no banco de dados.
* Zera o status de aceitação dos jogadores envolvidos no banco de dados.
* Cria um objeto `AcceptanceStatus` para a partida, que inclui a lista de jogadores, sets para `acceptedPlayers` e `declinedPlayers`, e um `createdAt` timestamp.
* Configura um `setTimeout` para `ACCEPTANCE_TIMEOUT_MS` (30 segundos) que, se acionado, chamará `handleAcceptanceTimeout()` para cancelar a partida.
* Armazena o status da partida em `pendingMatches` (cache local).
* Notifica o frontend sobre a partida encontrada (`notifyMatchFound()`) e inicia as atualizações do temporizador (`startTimerUpdates()`).
* Aciona a auto-aceitação para bots após um pequeno atraso.

### Processamento de Aceitação/Recusa (`acceptMatch`, `declineMatch`)

* **`acceptMatch(matchId, summonerName)`:**
    1. Atualiza o status de aceitação do jogador para `1` (aceito) no banco de dados.
    2. Adiciona o jogador ao `acceptedPlayers` set no `AcceptanceStatus` local.
    3. Se todos os jogadores aceitarem (`acceptedPlayers.size === players.length`), invoca `handleAllPlayersAccepted()`.
    4. Caso contrário, notifica o frontend sobre o progresso da aceitação (`notifyAcceptanceProgress()`).
* **`declineMatch(matchId, summonerName)`:**
    1. Atualiza o status de aceitação do jogador para `2` (recusado) no banco de dados.
    2. Invoca `handleMatchDeclined()` para cancelar a partida e iniciar o processo de requeue dos jogadores.

### Tratamento de Eventos da Partida

* **`handleAllPlayersAccepted(matchId)`:**
    1. Limpa o timeout de aceitação.
    2. Atualiza o status da partida no banco de dados para `'accepted'`.
    3. Notifica o `MatchmakingService` para iniciar o processo de draft (`MatchmakingService.startDraft()`).
    4. Remove a partida de `pendingMatches`.
* **`handleMatchDeclined(matchId, declinedPlayerNames)`:**
    1. Limpa o timeout de aceitação.
    2. Atualiza o status da partida no banco de dados para `'declined'`.
    3. Notifica o `MatchmakingService` sobre o cancelamento da partida, que por sua vez fará o requeue dos jogadores.
    4. Remove a partida de `pendingMatches`.
* **`handleAcceptanceTimeout(matchId)`:** Similar a `handleMatchDeclined`, é acionado quando o tempo para aceitação expira.

### Monitoramento Contínuo (`startAcceptanceMonitoring`, `monitorAcceptanceStatus`)

* Um `setInterval` executa `monitorAcceptanceStatus()` periodicamente (a cada 1 segundo).
* `monitorAcceptanceStatus()` busca partidas ativas no banco de dados (`dbManager.getActiveCustomMatches()`) e processa o status de aceitação de cada uma via `processMatchAcceptanceFromDB()`. Isso garante que o estado do serviço reflita o banco de dados mesmo em caso de reinício ou múltiplas instâncias.

### Comunicação com Clientes

* **`notifyMatchFound()`:** Envia detalhes da partida encontrada para os jogadores envolvidos.
* **`notifyAcceptanceProgress()`:** Informa o progresso da aceitação (X de 10 jogadores aceitaram) e o tempo restante.
* **`notifyAllPlayersAccepted()`:** Confirma que a partida foi aceita por todos.
* **`notifyMatchCancelled()`:** Avisa que a partida foi cancelada (por recusa ou timeout).
* **`notifyTimerUpdate()`:** Envia atualizações do tempo restante para aceitação a cada segundo.
* Todos os broadcasts são feitos via `this.wss.clients.forEach(...)`.

## 🛠️ Tecnologias e Implementação

* **TypeScript:** Garante a tipagem forte das estruturas de dados como `AcceptanceStatus`.
* **WebSockets (`ws`):** Essencial para a comunicação em tempo real com o frontend, mantendo a UI atualizada durante a fase de aceitação.
* **`DatabaseManager`:** Injetado via construtor, é a camada de persistência para o status de aceitação dos jogadores e dados da partida.
* **`DiscordService`:** Opcionalmente injetado, pode ser utilizado para enviar notificações de aceitação/recusa via Discord.
* **`Map`:** A coleção `pendingMatches` utiliza um `Map` para armazenar o estado das partidas que aguardam aceitação, oferecendo acesso eficiente por `matchId`.
* **`setTimeout` / `setInterval`:** Utilizados para gerenciar o timeout de aceitação e o monitoramento periódico do status.

## ⚠️ Considerações e Boas Práticas

* **Resiliência:** O monitoramento do banco de dados é vital para a resiliência do serviço, permitindo que ele se recupere de reinícios e mantenha o estado consistente.
* **Concorrência:** Para um alto volume de partidas, a lógica de aceitação precisa ser otimizada para evitar condições de corrida e garantir que as atualizações sejam atômicas.
* **Feedback ao Usuário:** A clareza das mensagens e dos temporizadores na UI é crucial para guiar o usuário na fase de aceitação.
* **Bots:** A auto-aceitação para bots é uma boa adição, mas pode-se considerar a aleatoriedade ou pequenos atrasos variáveis para tornar o comportamento mais natural.
* **Testes:** Testes abrangentes para a lógica de aceitação, timeouts e interações com o banco de dados são essenciais para garantir a confiabilidade do sistema.
* **Notificações:** Explorar a possibilidade de notificações sonoras ou visuais mais proeminentes no frontend quando uma partida é encontrada para garantir que o usuário não perca a janela de aceitação.
