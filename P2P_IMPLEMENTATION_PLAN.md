# Plano de Implementação P2P - LoL Matchmaking System

## 🎯 Objetivo

Implementar sistema de conexão Peer-to-Peer (P2P) para permitir que usuários com o app aberto se conectem diretamente uns aos outros, criando uma rede descentralizada para matchmaking sem depender de servidor central.

## 🏗️ Arquitetura P2P Proposta

### Modelo Híbrido: WebRTC + Servidor de Sinalização

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Player A     │    │  Signaling      │    │    Player B     │
│   (Electron)    │    │   Server        │    │   (Electron)    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • WebRTC Client │◄──►│ • WebSocket     │◄──►│ • WebRTC Client │
│ • P2P Manager   │    │ • Room Mgmt     │    │ • P2P Manager   │
│ • Data Channels │    │ • NAT Discovery │    │ • Data Channels │
└─────────┬───────┘    └─────────────────┘    └─────────┬───────┘
          │                                             │
          └─────────────────┐           ┌───────────────┘
                            │           │
                    ┌───────▼───────────▼───────┐
                    │    P2P Connection         │
                    │   (Direct WebRTC)         │
                    │ • Match Data Exchange     │
                    │ • Real-time Communication│
                    │ • Distributed Queue       │
                    └───────────────────────────┘
```

## 🔧 Componentes Técnicos

### 1. Servidor de Sinalização (Mínimo)

```typescript
// src/backend/services/SignalingService.ts
export class SignalingService {
  private rooms: Map<string, Set<string>> = new Map();
  private peers: Map<string, PeerInfo> = new Map();

  // Descoberta de pares na rede local
  discoverPeers(peerId: string): void {
    // Broadcast na rede local para encontrar outros clientes
    // Usando UDP multicast ou mDNS
  }

  // Facilitação de handshake WebRTC
  facilitateConnection(peer1: string, peer2: string): void {
    // Troca de ICE candidates e SDP offers/answers
  }

  // Manutenção de lista de peers ativos
  maintainPeerList(): void {
    // Heartbeat e cleanup de peers desconectados
  }
}
```

### 2. Cliente P2P (Electron)

```typescript
// src/frontend/src/app/services/p2p-manager.ts
export class P2PManager {
  private rtcConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private localPeerId: string;

  async initializeP2P(): Promise<void> {
    // Inicializar WebRTC
    // Conectar ao servidor de sinalização
    // Iniciar descoberta de peers
  }

  async connectToPeer(peerId: string): Promise<void> {
    // Estabelecer conexão WebRTC direta
    // Criar data channels para comunicação
  }

  broadcastToNetwork(message: any): void {
    // Enviar mensagem para todos os peers conectados
  }

  // Sistema de fila distribuída
  joinDistributedQueue(preferences: QueuePreferences): void {
    // Notificar todos os peers sobre entrada na fila
    // Participar do consenso de matchmaking
  }
}
```

### 3. Sistema de Fila Distribuída

```typescript
// src/frontend/src/app/services/distributed-queue.ts
export class DistributedQueue {
  private localQueue: QueuedPlayer[] = [];
  private networkQueue: Map<string, QueuedPlayer[]> = new Map();
  private consensusManager: ConsensusManager;

  // Sincronização de fila entre peers
  syncQueueWithNetwork(): void {
    // Merge de filas de diferentes peers
    // Resolução de conflitos
    // Manutenção de ordem consistente
  }

  // Algoritmo de consenso para matchmaking
  proposeMatch(players: QueuedPlayer[]): void {
    // Propor match para a rede
    // Aguardar aprovação de maioria dos peers
    // Executar match se aprovado
  }

  // Eleição de líder para coordenação
  electMatchmakingLeader(): string {
    // Algoritmo de eleição (ex: peer com menor latência)
    // Delegar responsabilidade de matchmaking
  }
}
```

## 🌐 Descoberta de Peers

### Opção 1: Descoberta Local (LAN)
```typescript
// Descoberta via multicast UDP na rede local
export class LocalPeerDiscovery {
  private multicastAddress = '239.255.255.250';
  private multicastPort = 9999;

  startDiscovery(): void {
    // Enviar beacons UDP multicast
    // Escutar por outros clientes na rede
    // Trocar informações de contato
  }
}
```

### Opção 2: Descoberta via Internet
```typescript
// Usando servidor de sinalização como ponto de encontro
export class InternetPeerDiscovery {
  async findPeersInRegion(region: string): Promise<PeerInfo[]> {
    // Buscar peers na mesma região
    // Filtrar por latência e disponibilidade
    // Retornar lista de peers compatíveis
  }
}
```

## 🔄 Fluxos de Funcionamento

### 1. Inicialização do Cliente
```
App inicia → P2P Manager init → Descoberta de peers → 
Estabelecer conexões → Sincronizar estado → Pronto para matchmaking
```

### 2. Matchmaking Distribuído
```
Player entra na fila → Broadcast para rede → Sincronizar filas → 
Algoritmo de consenso → Match aprovado → Criar lobby → 
Notificar players
```

### 3. Tolerância a Falhas
```
Peer desconecta → Detectar desconexão → Redistribuir responsabilidades → 
Reeleger líder → Manter continuidade do serviço
```

## 📦 Implementação Técnica

### Dependências Necessárias

```json
{
  "dependencies": {
    "simple-peer": "^9.11.1",
    "socket.io-client": "^4.7.2",
    "node-datachannel": "^0.4.4",
    "mdns": "^2.7.2",
    "dgram": "builtin"
  }
}
```

### Estrutura de Arquivos

```
src/
├── backend/
│   └── services/
│       ├── SignalingService.ts      # Servidor mínimo de sinalização
│       └── PeerDiscoveryService.ts  # Descoberta de peers
└── frontend/src/app/
    └── services/
        ├── p2p-manager.ts           # Gerenciador P2P principal
        ├── distributed-queue.ts     # Fila distribuída
        ├── peer-discovery.ts        # Descoberta de peers
        ├── consensus-manager.ts     # Algoritmos de consenso
        └── webrtc-service.ts        # Wrapper WebRTC
```

## 🛡️ Considerações de Segurança

### 1. Autenticação
- Verificação via Riot API que o peer é válido
- Assinatura digital de mensagens
- Lista de peers confiáveis

### 2. Prevenção de Ataques
- Rate limiting de mensagens P2P
- Validação de dados recebidos
- Blacklist de peers maliciosos

### 3. Privacidade
- Não exposição de IPs públicos
- Criptografia de dados sensíveis
- Consentimento para conexões

## 🚀 Fases de Implementação

### Fase 1: Infraestrutura Base
- [ ] Implementar P2PManager básico
- [ ] Servidor de sinalização mínimo
- [ ] Descoberta de peers na LAN
- [ ] Conexões WebRTC básicas

### Fase 2: Matchmaking Distribuído
- [ ] Sistema de fila distribuída
- [ ] Algoritmo de consenso simples
- [ ] Sincronização de estado
- [ ] Eleição de líder

### Fase 3: Otimizações
- [ ] Tolerância a falhas
- [ ] Balanceamento de carga
- [ ] Métricas de performance
- [ ] Interface de monitoramento

### Fase 4: Produção
- [ ] Testes extensivos
- [ ] Documentação completa
- [ ] Deploy e distribuição
- [ ] Monitoramento em produção

## 🎯 Benefícios da Implementação P2P

### Vantagens
- ✅ **Descentralização**: Sem dependência de servidor central
- ✅ **Escalabilidade**: Capacidade cresce com número de usuários
- ✅ **Latência**: Conexões diretas entre peers
- ✅ **Resiliência**: Sistema continua funcionando mesmo com falhas
- ✅ **Custo**: Redução de custos de infraestrutura

### Desafios
- ⚠️ **Complexidade**: Maior complexidade de implementação
- ⚠️ **NAT Traversal**: Necessário STUN/TURN servers
- ⚠️ **Consistência**: Manter estado consistente entre peers
- ⚠️ **Segurança**: Validação e prevenção de ataques

## 🔧 Configuração Recomendada

### Configuração Híbrida
```typescript
interface P2PConfig {
  // Servidor de sinalização (mínimo, apenas para handshake)
  signalingServer: {
    url: string;
    fallbackUrls: string[];
  };
  
  // Servidores STUN/TURN para NAT traversal
  iceServers: RTCIceServer[];
  
  // Descoberta de peers
  discovery: {
    enableLAN: boolean;        // Descoberta na rede local
    enableInternet: boolean;   // Descoberta via servidor
    maxPeers: number;         // Máximo de conexões simultâneas
  };
  
  // Configurações de matchmaking
  matchmaking: {
    consensusThreshold: number;  // % de peers para aprovar match
    leaderElectionTimeout: number;
    queueSyncInterval: number;
  };
}
```

Esta implementação permitirá que os usuários se conectem diretamente uns aos outros, mantendo o sistema funcionando mesmo sem servidor central, mas utilizando um servidor mínimo apenas para facilitar as conexões iniciais.
