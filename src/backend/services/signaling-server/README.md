# Documentação: `SignalingServer.ts`

O `SignalingServer.ts`, localizado em `src/backend/services/`, implementa um servidor de sinalização Peer-to-Peer (P2P) utilizando `Socket.IO`. Seu propósito principal é facilitar a descoberta e a troca de mensagens de sinalização entre os clientes da aplicação (frontend/Electron) para estabelecer conexões P2P diretas para comunicação em tempo real. Isso é crucial para cenários onde a comunicação de baixa latência entre jogadores é necessária, como em partidas customizadas.

## 🎯 Propósito e Funcionalidades Principais

O `SignalingServer` é responsável por:

1. **Facilitar Conexões P2P:** Atua como um intermediário para que os clientes troquem os metadados necessários para estabelecer uma conexão WebRTC (ofertas, respostas, candidatos ICE), sem que o tráfego de mídia passe pelo servidor.
2. **Registro de Peers:** Permite que os clientes se registrem no servidor de sinalização, fornecendo suas informações (ID, `summonerName`, região, MMR).
3. **Descoberta de Peers:** Permite que um cliente descubra outros peers ativos conectados ao servidor, facilitando a formação de grupos para comunicação P2P.
4. **Encaminhamento de Mensagens de Sinalização:** Recebe mensagens de sinalização de um cliente e as retransmite para o cliente alvo (ou para todos os outros clientes, dependendo do tipo de mensagem).
5. **Gerenciamento de Conexões:** Monitora as conexões ativas, detecta desconexões e remove peers inativos para manter a lista de peers atualizada.
6. **Broadcast de Eventos:** Notifica os clientes sobre eventos de conexão e desconexão de peers (`peer-joined`, `peer-left`).

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `setupEventHandlers`, `startServer`)

* O construtor cria um `httpServer` e inicializa uma instância do `Socket.IO Server` sobre ele, configurando CORS para permitir conexões de qualquer origem (`origin: "*"`).
* **`setupEventHandlers()`:** Configura os listeners para os eventos de `Socket.IO` (`connection`, `register-peer`, `signaling-message`, `discover-peers`, `heartbeat`, `disconnect`).
* **`startServer(port)`:** Inicia o servidor HTTP para escutar em uma porta especificada. Também configura um `setInterval` para `cleanupInactivePeers()` para remover peers que não enviaram `heartbeat`.

### Gerenciamento de Peers

* **`peers: Map<string, PeerInfo>`:** Um `Map` que armazena informações sobre todos os peers atualmente conectados ao servidor de sinalização, indexado pelo `peer.id`.
* **`socketToPeer: Map<string, string>`:** Um `Map` auxiliar que mapeia o `socket.id` do Socket.IO para o `peer.id`, facilitando a localização de peers por seu socket.
* **`register-peer` (Evento Socket):** Quando um cliente envia este evento, o servidor registra as informações do peer (`PeerInfo`), o armazena nos mapas `peers` e `socketToPeer`, e então:
  * Envia a lista de peers disponíveis para o novo cliente (`socket.emit('peers-list')`).
  * Notifica todos os outros peers sobre a entrada do novo peer (`socket.broadcast.emit('peer-joined')`).
* **`disconnect` (Evento Socket):** Quando um cliente se desconecta, o servidor remove o peer dos mapas `peers` e `socketToPeer` e notifica os outros peers sobre a saída (`socket.broadcast.emit('peer-left')`).
* **`cleanupInactivePeers()`:** Executado periodicamente, remove peers que não enviaram um evento `heartbeat` dentro de um `inactiveThreshold` (atualmente 1 minuto), assumindo que a conexão foi perdida.

### Troca de Mensagens de Sinalização (`signaling-message`)

* **`signaling-message` (Evento Socket):** Este é o evento central para a troca de mensagens WebRTC. Um cliente envia uma mensagem de sinalização (contendo `type`, `data`, `targetPeer`, `sourcePeer`).
* O servidor verifica se há um `targetPeer` específico. Se sim, retransmite a mensagem apenas para o `socket.id` desse peer. Caso contrário, ele faz um broadcast da mensagem para todos os outros clientes conectados (`socket.broadcast.emit`), permitindo a descoberta ou troca de mensagens em massa.

### Descoberta de Peers (`discover-peers`)

* **`discover-peers` (Evento Socket):** Um cliente pode solicitar a lista de peers atualmente conectados. O servidor retorna a lista de peers disponíveis (excluindo o próprio solicitante) via `socket.emit('peers-list')`.

### Heartbeat (`heartbeat`)

* **`heartbeat` (Evento Socket):** Clientes enviam este evento periodicamente para indicar que ainda estão ativos. Isso é usado pelo `cleanupInactivePeers()` para determinar quais peers estão inativos e podem ser removidos.

### Estatísticas (`getStats`)

* **`getStats()`:** Retorna um objeto com o número de peers conectados e uma lista detalhada de cada peer ativo, incluindo informações como `summonerName`, `region`, `mmr` e `connectedFor` (tempo conectado em segundos).

## 🛠️ Tecnologias e Implementação

* **`Socket.IO`:** A biblioteca principal para comunicação WebSocket bidirecional, abstraindo a complexidade do WebSockets puro e fornecendo funcionalidades de salas, eventos, reconexão, etc.
* **Node.js `http`:** Usado para criar o servidor HTTP subjacente ao Socket.IO.
* **TypeScript:** Garante a tipagem forte das interfaces de dados (`PeerInfo`, `SignalingMessage`) e a estrutura das mensagens, aumentando a robustez do código.
* **`Map`:** Utilizado para gerenciar eficientemente as coleções de `peers` e `socketToPeer`.
* **CORS (`cors`):** Configurado para permitir que o frontend (provavelmente em uma porta diferente) se conecte ao servidor de sinalização.
* **`setInterval`:** Para a funcionalidade de limpeza de peers inativos e monitoramento.

## ⚠️ Considerações e Boas Práticas

* **Escalabilidade:** Para um grande número de clientes, um único servidor de sinalização pode se tornar um gargalo. Estratégias de escalabilidade (ex: múltiplas instâncias de servidores de sinalização, Redis para gerenciar estado compartilhado entre instâncias) seriam necessárias.
* **Autenticação/Autorização:** Atualmente, o servidor permite que qualquer peer se registre. Para um ambiente de produção, seria crucial implementar autenticação e autorização para o registro e para o envio de mensagens de sinalização, garantindo que apenas usuários válidos possam interagir.
* **Segurança (WebRTC):** Embora o servidor de sinalização não processe a mídia P2P, ele é vital para a configuração inicial. Garantir que as mensagens de sinalização não contenham informações sensíveis e que o processo de troca de candidatos ICE seja seguro é importante.
* **Robustez da Conexão:** O sistema de `heartbeat` e `cleanupInactivePeers` é um bom começo, mas reconexões de clientes e cenários de rede instável podem exigir lógica mais complexa.
* **Detalhes do Peer:** As informações enviadas durante o `register-peer` (MMR, região) são usadas para descoberta, mas também podem ser usadas para matchmaking ou filtragem de peers para comunicação direta.
* **Testes:** Testes de unidade e integração para o fluxo de conexão, registro de peers, encaminhamento de mensagens e limpeza de inativos são essenciais.
