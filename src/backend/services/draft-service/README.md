# Documentação: `DraftService.ts`

O `DraftService.ts`, localizado em `src/backend/services/`, é o componente central para gerenciar a fase de draft (escolha e banimento de campeões) em partidas customizadas. Ele orquestra a lógica, o estado e a comunicação em tempo real necessários para que os jogadores realizem suas escolhas e banimentos de forma organizada, integrando-se com o banco de dados e o serviço de Discord.

## 🎯 Propósito e Funcionalidades Principais

O `DraftService` é responsável por:

1. **Início e Monitoramento do Draft:** Inicia o processo de draft para partidas que foram aceitas no sistema e monitora continuamente o banco de dados por novas partidas que exigem um draft.
2. **Preparação de Dados do Draft:** Coleta e organiza os dados dos jogadores, incluindo suas lanes atribuídas e MMRs, vindos do `MatchmakingService` ou diretamente do banco de dados.
3. **Processamento de Ações de Pick/Ban:** Recebe e valida as ações de escolha (pick) e banimento (ban) de campeões dos jogadores, atualizando o estado do draft.
4. **Finalização e Cancelamento do Draft:** Gerencia o término do draft (seja por conclusão ou cancelamento), persistindo os resultados e notificando os serviços relevantes.
5. **Sincronização em Tempo Real:** Utiliza WebSockets para enviar atualizações de estado do draft para o frontend e o Discord, garantindo que todos os clientes tenham a visão mais recente do que está acontecendo.
6. **Integração com `DatabaseManager`:** Persiste o estado do draft e os resultados finais no banco de dados.
7. **Integração com `DiscordService`:** Coordena a movimentação de jogadores para canais de voz específicos no Discord durante as fases da partida (pré-draft, in-game).

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `initialize`)

* O construtor recebe instâncias de `DatabaseManager`, o servidor WebSocket (`wss`) e, opcionalmente, `DiscordService` para permitir a comunicação entre os serviços.
* O método `initialize()` inicia os monitores de draft (`startDraftMonitoring()`) e o monitor de sincronização de dados de pick/ban (`startDraftSyncMonitoring()`), que são intervalos que verificam o estado das partidas no banco de dados.

### Início do Draft (`startDraft(matchId)`)

* Busca os detalhes da partida no `DatabaseManager`.
* Prioriza o uso de dados de balanceamento de times (`draft_data`) já existentes da fase de matchmaking. Se não houver, prepara os dados do draft com base nos jogadores da fila.
* Atualiza o status da partida no banco de dados para `'draft'`.
* Remove os jogadores da fila de matchmaking, pois agora estão na fase de draft.
* Armazena o `DraftData` na coleção `activeDrafts` do serviço.
* Notifica o frontend sobre o início do draft via WebSocket.

### Processamento de Ações (`processDraftAction(matchId, playerId, championId, action)`)

* Recebe a ação de um jogador (pick ou ban de um campeão).
* Valida a ação (se é a vez do jogador, se o campeão é válido, etc.).
* Atualiza o estado do `activeDrafts` e os dados de `pick_ban_data` da partida no banco de dados.
* Notifica o frontend sobre a ação para que a interface seja atualizada em tempo real.

### Finalização e Cancelamento

* **`finalizeDraft(matchId, draftResults)`:** Chamado quando o draft é concluído. Atualiza o banco de dados com os resultados finais do draft (campeões escolhidos, etc.) e pode acionar o `DiscordService` para mover os jogadores para canais de jogo.
* **`cancelDraft(matchId, reason)`:** Permite cancelar um draft em andamento, limpando o estado e notificando os clientes.

### Monitoramento e Sincronização

* **`startDraftMonitoring()`:** Um `setInterval` que periodicamente chama `monitorAcceptedMatches()` para verificar partidas no banco de dados com status `'accepted'` e iniciar o draft para elas.
* **`startDraftSyncMonitoring()`:** Um `setInterval` que periodicamente chama `monitorDraftDataChanges()` para detectar alterações no `pick_ban_data` de partidas em draft no banco de dados. Isso é crucial para sincronizar o estado do draft entre múltiplas instâncias do backend ou caso os dados sejam atualizados externamente.

### Comunicação com Clientes (`notifyDraftStarted`, `notifyDraftAction`, etc.)

* Vários métodos `notify` e `broadcast` são usados para enviar mensagens via WebSocket para o frontend, informando sobre o início do draft, ações de pick/ban, e o status geral da partida.

## 🛠️ Tecnologias e Implementação

* **TypeScript:** Utilizado para tipagem forte, garantindo a consistência e a previsibilidade das estruturas de dados como `DraftData` e `DraftPlayer`.
* **WebSockets (`ws`):** Usado para comunicação bidirecional em tempo real com o frontend, permitindo uma experiência de usuário interativa e responsiva durante o draft.
* **`DatabaseManager`:** Injetado via construtor, este serviço é fundamental para persistir e recuperar o estado do draft e os dados da partida.
* **`DiscordService`:** Opcionalmente injetado, permite que o `DraftService` interaja com o Discord para mover jogadores para canais de voz específicos, aprimorando a experiência in-game.
* **`Map`:** A coleção `activeDrafts` utiliza um `Map` para armazenar o estado dos drafts ativos, oferecendo acesso eficiente por `matchId`.
* **`setInterval` / `setTimeout`:** Utilizados para implementar a lógica de monitoramento e sincronização periódica do estado do draft.

## ⚠️ Considerações e Boas Práticas

* **Robustez da Lógica de Draft:** A lógica de validação de pick/ban deve ser extremamente robusta para lidar com entradas inesperadas, assincronia e garantir que o draft siga as regras do jogo.
* **Tratamento de Falhas:** Considerar como o sistema reage a falhas durante o draft (ex: jogador desconecta, erro no backend). O estado do draft precisa ser resiliente e recuperável.
* **Persistência:** A decisão de persistir `pick_ban_data` e `draft_data` no banco de dados é crucial para a recuperação de estado em caso de reinício do serviço.
* **Sincronização:** A sincronização via `monitorDraftDataChanges` é importante para ambientes distribuídos ou quando múltiplos processos podem estar acessando os mesmos dados de partida.
* **Feedback ao Usuário:** As notificações de sucesso e erro (tanto para o frontend quanto via Discord, se aplicável) são importantes para manter o usuário informado.
* **Segurança:** Validar todas as entradas do cliente para evitar ações maliciosas ou que comprometam a integridade do draft.
