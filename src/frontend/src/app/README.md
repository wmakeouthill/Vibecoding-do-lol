# Documentação do Módulo Principal do Frontend (`src/frontend/src/app/`)

## 📄 Visão Geral

O diretório `src/frontend/src/app/` é o coração da aplicação Angular, contendo o componente raiz (`App`), as definições de interfaces compartilhadas, as configurações do aplicativo, a lógica de roteamento, estilos globais e os módulos de teste. Ele orquestra a inicialização da aplicação, gerencia o estado global e atua como o ponto de integração para todos os componentes de UI e serviços de lógica de negócio.

## 📁 Estrutura do Diretório

- `app.ts`: O componente raiz da aplicação (`App`).
- `app.config.ts`: Configurações de aplicação do Angular.
- `app.routes.ts`: Definições de rotas da aplicação (atualmente vazias, roteamento imperativo).
- `app.html`: Template HTML principal (versão simplificada/alternativa é usada).
- `app-simple.html`: O template HTML **ativo** e mais detalhado do componente raiz.
- `app.scss`: Estilos SCSS globais e de layout para a aplicação.
- `app.spec.ts`: Testes unitários para o componente `App`.
- `interfaces.ts`: Definições de interfaces TypeScript compartilhadas.
- `components/`: Subdiretório contendo todos os componentes de UI da aplicação.
- `services/`: Subdiretório contendo todos os serviços de lógica de negócio.

## 🧠 Análise Detalhada dos Componentes Chave

### 📄 `App` Componente Principal (`app.ts`)

O `App` é o componente raiz da aplicação. Ele é responsável por:

- **Gerenciamento de Visão:** Controla a visualização ativa (`currentView`) entre `dashboard`, `queue`, `history`, `leaderboard` e `settings` usando a diretiva `*ngIf` no template, em vez do roteador Angular padrão.
- **Estado Global:** Mantém o estado global da aplicação, incluindo `currentPlayer` (dados do jogador logado), `queueStatus` (status da fila de matchmaking), `lcuStatus` (status de conexão com o cliente League of Legends), `discordStatus` (status de conexão com o bot Discord), e o estado das fases do jogo (match encontrado, draft, em jogo).
- **Inicialização:** Implementa uma sequência de inicialização assíncrona (`initializeAppSequence`) que garante que o backend esteja pronto (`ensureBackendIsReady`), a comunicação WebSocket esteja configurada (`setupBackendCommunication`), os dados do jogador sejam carregados (`loadPlayerDataWithRetry`), e o jogador seja identificado no WebSocket. Isso evita *race conditions* e garante que a aplicação esteja em um estado consistente.
- **Comunicação:** Interage extensivamente com a `ApiService` para comunicação RESTful e WebSocket com o backend, recebendo atualizações em tempo real.
- **Gerenciamento de Notificações:** Adiciona e dispensa notificações para feedback ao usuário (`addNotification`, `dismissNotification`).
- **Integração com Electron:** Detecta se está sendo executado no Electron (`isElectron`) e expõe métodos para controlar a janela (minimizar, maximizar, fechar) via `electronAPI`.
- **Lógica de Negócio:** Contém métodos para interagir com a fila (`joinQueue`, `leaveQueue`), aceitar/recusar partidas (`acceptMatch`, `declineMatch`), e atualizar configurações (`savePlayerSettings`, `updateRiotApiKey`, `updateDiscordBotToken`, `updateDiscordChannel`).
- **Monitoramento:** Realiza verificações periódicas do status do LCU (`startLCUStatusCheck`).

### 📄 `app.config.ts`

Define a configuração fundamental do aplicativo Angular. Inclui provedores essenciais como:

- `provideBrowserGlobalErrorListeners()`: Para lidar com erros globais no navegador.
- `provideZoneChangeDetection({ eventCoalescing: true })`: Otimiza a detecção de mudanças do Angular.
- `provideRouter(routes)`: Configura o serviço de roteamento (embora as rotas sejam controladas imperativamente no `app.ts` neste projeto, este provedor ainda é necessário para o módulo do roteador funcionar).
- `provideHttpClient()`: Fornece o `HttpClient` para fazer requisições HTTP.

### 📄 `app.routes.ts`

Este arquivo define a configuração de rotas da aplicação. No entanto, notavelmente, a array `routes` está vazia (`export const routes: Routes = [];`). Isso indica que a navegação entre as diferentes 'páginas' ou visualizações do aplicativo (Dashboard, Fila, Histórico, etc.) é gerenciada diretamente pelo `App` componente (`app.ts`) através da propriedade `currentView` e das diretivas `*ngIf` no template, em vez de utilizar o sistema de roteamento declarativo padrão do Angular.

### 📄 `app.html` e `app-simple.html`

- **`app.html`**: É um template HTML básico, que aparentemente foi substituído ou é uma alternativa mais simples.
- **`app-simple.html`**: Este é o template HTML **ativo** para o componente `App` (`app.ts`), conforme especificado em `@Component({ templateUrl: './app-simple.html' })`. Ele define a estrutura de layout principal da aplicação, incluindo o cabeçalho, navegação (botões que controlam `currentView`), a área de conteúdo que renderiza dinamicamente os sub-componentes (`<app-dashboard>`, `<app-queue>`, etc. usando `*ngIf` e `*ngSwitchCase`), um rodapé de status e uma área para notificações e modais (como o `app-match-found`). Ele também inclui estilos inline para as seções de configurações, o que é uma escolha de design específica.

### 📄 `app.scss`

Contém os estilos SCSS globais e específicos do layout principal da aplicação. Abrange:

- **Estrutura da Aplicação:** Estilos para o contêiner principal (`.app-container`), cabeçalho (`.app-header`), navegação (`.app-nav`, `.nav-buttons`), e área de conteúdo (`.app-main`).
- **Elementos Comuns:** Estilos para botões, indicadores de status (conectado/desconectado), modais e notificações.
- **Componentes Embedados:** Contém estilos para as visualizações de Dashboard, Fila, Histórico, Leaderboard e Configurações, mesmo que alguns sejam de componentes separados (sugerindo que alguns estilos são globais ou importados).
- **Animações:** Define animações CSS como `fadeIn`, `scaleIn`, `slideInRight` e `fadeOut` para uma experiência de usuário mais fluida, especialmente para notificações e modais.
- **Variáveis CSS:** Utiliza variáveis CSS (`var(--...)`) para gerenciar cores, espaçamentos, bordas e sombras de forma consistente.

### 📄 `app.spec.ts`

Este arquivo contém os testes unitários para o componente `App`. Utiliza o framework de teste do Angular (`TestBed`, `describe`, `it`, `expect`) para:

- Verificar se o componente `App` pode ser criado com sucesso (`should create the app`).
- Testar se o título da aplicação é renderizado corretamente (`should render title`).

### 📄 `interfaces.ts`

Este arquivo centraliza todas as definições de interfaces TypeScript para os modelos de dados usados em todo o frontend. Isso é crucial para manter a consistência dos dados e garantir a segurança de tipagem. Algumas interfaces chave incluem:

- `Player`: Detalhes do perfil do jogador (nome, MMR, rank, ID, PUUID).
- `QueueStatus`: Estado da fila de matchmaking (jogadores na fila, tempo de espera, atividades).
- `QueuedPlayerInfo`: Informações detalhadas de um jogador na fila.
- `QueueActivity`: Tipos de atividades que ocorrem na fila.
- `Lane`: Informações sobre as lanes (rota no jogo).
- `QueuePreferences`: Preferências de lane e auto-aceitação.
- `LCUStatus`: Status de conexão com o cliente League of Legends.
- `MatchFound`: Detalhes de uma partida encontrada.
- `Notification`: Estrutura para notificações pop-up.
- `CurrentGame`: Status do jogo atual.
- `Match`: Dados detalhados de uma partida do histórico.
- `RefreshPlayerResponse`: Resposta para atualização de dados do jogador.

## 🔗 Integração do Módulo Principal com o Resto da Aplicação

O módulo `app/` é o orquestrador principal, conectando:

- **Componentes de UI:** Ele hospeda e gerencia a exibição dos sub-componentes (Dashboard, Fila, Histórico, etc.), passando dados (`@Input`) e ouvindo eventos (`@Output`).
- **Serviços de Lógica de Negócio:** Injeta e utiliza diversos serviços (ex: `ApiService`, `QueueStateService`, `DiscordIntegrationService`, `BotService`) para realizar operações assíncronas, gerenciar estado e interagir com o backend.
- **Backend:** A comunicação é feita principalmente via `ApiService` (HTTP e WebSockets), garantindo que o frontend receba atualizações em tempo real e possa enviar ações.
- **Electron:** A integração com o processo `main` do Electron permite funcionalidades nativas, como controle da janela e acesso a informações do sistema, via `electronAPI` exposto pelo `preload.ts`.

## 💡 Considerações e Potenciais Melhorias

- **Roteamento:** A abordagem de roteamento imperativo (`currentView` com `*ngIf`) pode se tornar complexa em aplicações maiores. Considerar a migração para o roteador declarativo do Angular (`RouterModule.forRoot`) para melhor escalabilidade e manutenção.
- **Gerenciamento de Estado:** Para aplicações mais complexas, a gestão de estado global diretamente no componente `App` pode levar a um 'componente gorducho'. Avaliar a adoção de uma biblioteca de gerenciamento de estado (ex: NgRx, Akita, ou uma solução baseada em RxJS mais robusta) para dados compartilhados.
- **Refatoração de Template:** O `app-simple.html` contém muitos estilos inline. Mover esses estilos para `app.scss` ou para os arquivos SCSS dos componentes aninhados melhoraria a manutenibilidade.
- **Separação de Preocupações:** O `App` componente atualmente lida com uma ampla gama de responsabilidades (inicialização, gerenciamento de UI, comunicação de dados). Refatorar algumas dessas responsabilidades para serviços mais especializados pode melhorar a modularidade.
- **Testes:** Expandir a cobertura de testes unitários e adicionar testes de integração para as interações entre o `App` componente e seus serviços dependentes.

Este módulo é a fundação sobre a qual toda a experiência do usuário do aplicativo é construída.

## Documentação: `interfaces.ts`

O arquivo `interfaces.ts`, localizado em `src/frontend/src/app/`, serve como um repositório centralizado para todas as definições de interfaces TypeScript utilizadas em todo o frontend da aplicação. O propósito principal deste arquivo é garantir a consistência dos dados, promover a segurança de tipagem (type-safety) e melhorar a legibilidade e a manutenção do código, ao definir claramente a estrutura dos objetos de dados que transitam entre os componentes e serviços.

## 🎯 Propósito e Funcionalidades Principais

Este arquivo é essencial para:

1. **Padronização de Dados:** Define contratos claros para a estrutura dos dados, garantindo que todos os componentes e serviços manipulem objetos com as mesmas propriedades e tipos.
2. **Segurança de Tipagem:** Permite que o TypeScript realize verificações em tempo de compilação, ajudando a prevenir erros relacionados a dados inesperados ou ausentes.
3. **Documentação Implícita:** As interfaces servem como uma forma de documentação do schema dos dados, facilitando para novos desenvolvedores entenderem as estruturas de dados do projeto.
4. **Reusabilidade:** Evita a redefinição de tipos de dados em múltiplos locais, mantendo as definições em um único ponto de verdade.

## ⚙️ Interfaces Detalhadas

### `Player`

Representa o perfil completo de um jogador, combinando dados do backend (banco de dados customizado) e da Riot API.

```typescript
export interface Player {
  id: number;
  summonerName: string;
  displayName?: string; // Nome completo formatado (gameName#tagLine)
  gameName?: string;    // Nome do Riot ID (sem tag)
  summonerId?: string;
  puuid?: string;
  tagLine?: string;
  profileIconId?: string | number;
  summonerLevel?: number;
  currentMMR: number;
  mmr?: number; // Alias para currentMMR
  customLp?: number; // LP customizado
  region: string;
  rank?: {         // Informações de rank oficial da Riot
    tier: string;
    rank: string;
    display: string;
    lp?: number;
  };
  wins?: number;
  losses?: number;
  lastMatchDate?: Date;
  rankedData?: {   // Dados brutos de rank da Riot API
    soloQueue?: any;
    flexQueue?: any;
  };
}
```

### `QueueStatus`

Descreve o estado atual da fila de matchmaking, exibindo informações globais e detalhes dos jogadores na fila.

```typescript
export interface QueueStatus {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime?: number;
  isActive?: boolean;
  yourPosition?: number;
  playersInQueueList?: QueuedPlayerInfo[]; // Lista dos jogadores na fila
  recentActivities?: QueueActivity[];    // Atividades recentes na fila
  isCurrentPlayerInQueue?: boolean;      // Indica se o usuário atual está na fila
}
```

### `QueuedPlayerInfo`

Contém informações detalhadas de um jogador específico que está atualmente na fila de matchmaking.

```typescript
export interface QueuedPlayerInfo {
  summonerName: string;
  tagLine?: string;
  primaryLane: string;
  secondaryLane: string;
  primaryLaneDisplay: string;
  secondaryLaneDisplay: string;
  mmr: number;
  queuePosition: number;
  joinTime: string; // ISO string da data de entrada na fila
  isCurrentPlayer?: boolean; // Indica se este é o jogador atual
}
```

### `QueueActivity`

Representa um evento ou atividade que ocorreu na fila de matchmaking.

```typescript
export interface QueueActivity {
  id: string;
  timestamp: Date;
  type: 'player_joined' | 'player_left' | 'match_created' | 'system_update' | 'queue_cleared';
  message: string;
  playerName?: string;
  playerTag?: string;
  lane?: string;
}
```

### `Lane`

Define a estrutura de uma lane (posição) em League of Legends para seleção de preferências.

```typescript
export interface Lane {
  id: string;
  name: string;
  icon: string;
  description: string;
}
```

### `QueuePreferences`

Contém as preferências de lane e a opção de auto-aceitação do jogador para entrar na fila.

```typescript
export interface QueuePreferences {
  primaryLane: string;
  secondaryLane: string;
  autoAccept?: boolean;
}
```

### `LCUStatus`

Descreve o status de conexão e a fase atual do League of Legends Client Update (LCU).

```typescript
export interface LCUStatus {
  isConnected: boolean;
  summoner?: any;      // Dados do invocador logado no LCU
  gameflowPhase?: string; // Fase atual do cliente (Lobby, ChampSelect, InProgress, etc.)
  lobby?: any;          // Detalhes do lobby atual
}
```

### `MatchFound`

Representa os dados de uma partida que foi encontrada pelo sistema de matchmaking, antes da fase de aceitação.

```typescript
export interface MatchFound {
  matchId: number;
  team1: any[];       // Jogadores do time 1
  team2: any[];       // Jogadores do time 2
  yourTeam: number;   // Indica qual time o jogador atual pertence
  averageMMR1: number; // MMR médio do time 1
  averageMMR2: number; // MMR médio do time 2
}
```

### `Notification`

Define a estrutura para mensagens de notificação exibidas ao usuário.

```typescript
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  isRead?: boolean;
}
```

### `CurrentGame`

Representa o estado atual de um jogo em andamento.

```typescript
export interface CurrentGame {
  session: any;    // Detalhes da sessão de jogo (do backend)
  phase: string;   // Fase atual do jogo (draft, in_progress, etc.)
  isInGame: boolean; // Indica se o jogo está ativo
}
```

### `Match`

Define a estrutura de uma partida do histórico, tanto para partidas oficiais da Riot quanto para partidas customizadas.

```typescript
export interface Match {
  id: string | number;
  createdAt?: Date;
  timestamp?: number;
  duration: number;
  team1?: any[];
  team2?: any[];
  winner?: number; // 1 ou 2
  averageMMR1?: number;
  averageMMR2?: number;
  isVictory?: boolean;
  mmrChange?: number;
  gameMode?: string;

  // Propriedades adicionais para exibição no dashboard
  champion?: string;
  playerName?: string;
  kda?: string;

  // Dados expandidos da Riot API
  participants?: any[]; // Todos os 10 jogadores
  teams?: any[];        // Dados dos times
  gameVersion?: string;
  mapId?: number;

  // Campos específicos para partidas customizadas
  player_lp_change?: number; // LP ganho/perdido pelo jogador
  player_mmr_change?: number; // MMR ganho/perdido pelo jogador
  player_team?: number;     // Em qual time o jogador estava (1 ou 2)
  player_won?: boolean;     // Se o jogador ganhou a partida
  lp_changes?: any;         // Objeto com LP changes de todos os jogadores
  participants_data?: any[]; // Dados reais dos participantes (KDA, itens, etc.)

  playerStats?: {          // Estatísticas detalhadas do jogador na partida
    champion: string;
    kills: number;
    deaths: number;
    assists: number;
    mmrChange: number;
    isWin: boolean;
    championLevel?: number;
    lane?: string;
    firstBloodKill?: boolean;
    doubleKills?: number;
    tripleKills?: number;
    quadraKills?: number;
    pentaKills?: number;
    items?: number[];
    lpChange?: number;
    goldEarned?: number;
    totalDamageDealt?: number;
    totalDamageDealtToChampions?: number;
    totalDamageTaken?: number;
    totalMinionsKilled?: number;
    neutralMinionsKilled?: number;
    wardsPlaced?: number;
    wardsKilled?: number;
    visionScore?: number;
    summoner1Id?: number;
    summoner2Id?: number;
    perks?: any; // Runas
  };
}
```

### `RefreshPlayerResponse`

Define a estrutura da resposta ao tentar atualizar os dados de um jogador.

```typescript
export interface RefreshPlayerResponse {
  success: boolean;
  player: Player | null;
  error?: string;
}
```
