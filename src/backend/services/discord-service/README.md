# Documentação: `DiscordService.ts`

O `DiscordService.ts`, localizado em `src/backend/services/`, é o componente responsável por toda a integração da aplicação com a plataforma Discord. Ele atua como o coração do bot Discord, gerenciando suas funcionalidades, interações com usuários, sincronização de estados de jogo com canais de voz e comunicação em tempo real com o frontend da aplicação.

## 🎯 Propósito e Funcionalidades Principais

O `DiscordService` desempenha um papel multifacetado na aplicação:

1. **Gerenciamento do Bot Discord:** Inicializa e mantém a conexão com o Discord usando a biblioteca `discord.js`.
2. **Interação por Comandos Slash:** Registra e lida com comandos slash (`/vincular`, `/desvincular`, `/queue`, `/clear_queue`, `/lobby`) que permitem aos usuários interagir com o bot diretamente no Discord.
3. **Monitoramento de Canais de Voz:** Detecta entradas e saídas de usuários em canais de voz específicos (o canal de matchmaking configurado) e atualiza o estado da fila em tempo real.
4. **Gerenciamento de Fila de Matchmaking:** Sincroniza a fila de jogadores no Discord com a lógica de matchmaking do backend, facilitando o emparelhamento de jogadores.
5. **Criação e Gerenciamento de Partidas:** Cria canais de voz temporários para partidas encontradas, move os jogadores para esses canais e gerencia o ciclo de vida da partida (início, fim, cancelamento, limpeza).
6. **Vinculação de Contas:** Permite que os usuários vinculem suas contas Discord com suas contas de League of Legends, utilizando o `DatabaseManager` para persistir esses links.
7. **Comunicação em Tempo Real (WebSockets):** Utiliza um servidor WebSocket (`wss`) para enviar atualizações de estado (fila, usuários em canal, status de partidas) para o frontend em tempo real, garantindo uma experiência de usuário fluida.
8. **Throttling de Broadcasts:** Implementa um sistema de throttling para broadcasts de dados, otimizando o desempenho e evitando o envio excessivo de informações para o frontend.
9. **Integração LCU:** Monitora dados do cliente League of Legends (LCU) para identificar o usuário atual e seu status no jogo.

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `initialize`)

* O construtor inicializa o cliente Discord e configura os ouvintes de eventos (`setupDiscordEvents`).
* O método `initialize` é chamado para logar o bot no Discord usando o token fornecido (geralmente via variáveis de ambiente) e carregar as configurações do canal de matchmaking do banco de dados (`loadChannelConfiguration`).

### Eventos do Discord (`setupDiscordEvents`)

* **`ready`:** Disparado quando o bot está conectado e pronto. Registra os comandos slash (`registerSlashCommands`) e realiza uma verificação inicial dos usuários no canal de matchmaking (`performInitialChannelCheck`).
* **`voiceStateUpdate`:** Monitora mudanças no estado de voz dos usuários (entrar/sair de canais) e invoca `handleVoiceStateChange` para processar essas mudanças, atualizando a fila e transmitindo para o frontend.
* **`interactionCreate`:** Escuta por interações, principalmente comandos slash. O `switch` direciona a interação para o handler de comando apropriado (`handleVincularCommand`, `handleQueueCommand`, etc.).

### Comandos Slash (Exemplos)

* **`/vincular <gameName> <tagLine>`:** Permite ao usuário vincular sua conta Discord a uma conta Riot Games. Interage com `DatabaseManager` para armazenar o link e com `RiotAPIService` (implícito, através de outras lógicas que verificam a conta Riot).
* **`/queue`:** Adiciona o usuário à fila de matchmaking. `addToQueue` gerencia a adição e `tryCreateMatch` tenta formar uma partida.
* **`/clear_queue`:** Limpa a fila de matchmaking, removendo todos os jogadores.
* **`/lobby`:** Permite que jogadores em um lobby personalizado se juntem a uma partida customizada gerenciada pelo bot.

### Gerenciamento de Fila e Partidas

* **`addToQueue` / `removeFromQueue`:** Gerenciam a adição e remoção de jogadores da fila, atualizando o estado interno e o banco de dados.
* **`tryCreateMatch`:** A lógica central de matchmaking. Quando há jogadores suficientes na fila, tenta formar duas equipes balanceadas.
* **`createMatch`:** Cria uma nova partida, incluindo a criação de canais de voz temporários para as equipes e o movimento dos jogadores para esses canais.
* **`movePlayersToChannels` / `cleanupMatch` / `movePlayersBackToOrigin`:** Funções auxiliares para gerenciar o movimento de jogadores entre canais de voz durante o ciclo de vida da partida e a limpeza de canais após o término.

### Comunicação em Tempo Real

* **`setWebSocketServer(wss)`:** Recebe a instância do servidor WebSocket principal para que o `DiscordService` possa transmitir dados para o frontend.
* **`broadcastUsersInChannel` / `broadcastUsersInChannelImmediate` / `broadcastUsersInChannelCritical`:** Métodos para enviar atualizações sobre os usuários nos canais de voz para os clientes conectados via WebSocket, com diferentes níveis de throttling para otimização.
* **`broadcastToClients`:** Método genérico para enviar qualquer objeto de dados para os clientes WebSocket.

## 🛠️ Tecnologias e Implementação

* **`discord.js`:** Biblioteca Node.js para interagir com a API do Discord, fornecendo abstrações para clientes, eventos, comandos e interações de voz.
* **TypeScript:** Garante a tipagem forte e a modularidade do serviço.
* **`DatabaseManager`:** Usado para persistência de dados (configurações, links de usuários Discord-LoL) e gerenciamento da fila.
* **WebSockets:** Usados para comunicação em tempo real com o frontend, permitindo que a interface do usuário seja atualizada instantaneamente com as mudanças no Discord.
* **Express.js:** Indiretamente, as rotas do backend podem interagir com o `DiscordService` para operações específicas (ex: atualizar configurações do canal via API).

## ⚠️ Considerações e Boas Práticas

* **Permissões:** É crucial que o bot Discord tenha as permissões corretas configuradas no servidor Discord para criar/mover canais de voz, enviar mensagens e ler estados de voz.
* **Tratamento de Erros:** O serviço possui tratamento de erros para comandos e eventos, mas a robustez pode ser aprimorada para lidar com falhas de API do Discord ou problemas de conexão de forma mais graciosa.
* **Escalabilidade:** Para um número muito grande de usuários, a lógica de matchmaking e o gerenciamento de canais de voz podem precisar de otimizações de performance e arquitetura.
* **Segurança:** Gerenciar tokens do bot Discord e chaves de API com segurança (variáveis de ambiente, sem hardcoding) é fundamental.
* **UX/UI:** As mensagens e interações do bot no Discord devem ser claras e informativas para o usuário, fornecendo feedback adequado sobre as ações.
