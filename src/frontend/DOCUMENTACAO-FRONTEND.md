# Documentação do Frontend do Projeto Vibecoding-do-lol

## 🌐 Visão Geral do Frontend Angular

O frontend é a camada de interface do usuário do projeto Vibecoding-do-lol, construída com o framework Angular. Localizado em `src/frontend`, ele é responsável por todas as interações visuais e lógicas do lado do cliente, proporcionando uma experiência rica e interativa para o usuário. Ele consome dados do backend via API RESTful e WebSockets, e os apresenta de forma dinâmica através de uma arquitetura baseada em componentes.

O objetivo principal do frontend é exibir informações relevantes do League of Legends (como status de matchmaking, detalhes de partidas, histórico, perfis de jogadores, etc.) e permitir que o usuário interaja com as funcionalidades do aplicativo de forma intuitiva. A modularidade do Angular e o uso de TypeScript garantem um código escalável, manutenível e com forte tipagem.

## 📁 Estrutura do Módulo Frontend

O diretório `src/frontend` contém a aplicação Angular principal, organizada da seguinte forma:

- `angular.json`: Arquivo de configuração do Angular CLI.
- `package.json` e `package-lock.json`: Gerenciamento de dependências do Node.js para o frontend.
- `public/`: Contém assets estáticos como imagens e favicon.
- `src/`: O diretório principal da aplicação Angular.
  - `app/`: Contém os módulos, componentes, serviços, rotas e interfaces da aplicação.
    - `app.config.ts`, `app.routes.ts`, `app.ts`, `app.html`, `app.scss`, `app.spec.ts`, `app-simple.html`:
            Arquivos de configuração e bootstrapping da aplicação principal Angular.
    - `components/`: Subdiretórios para cada componente UI modular.
      - Ex: `custom-pick-ban/`, `dashboard/`, `draft/`, `game-in-progress/`, `lane-selector/`, `leaderboard/`, `match-found/`, `match-history/`, `queue/`.
            Cada subdiretório de componente geralmente contém seu arquivo `.html` (template), `.scss` (estilos) e `.ts` (lógica do componente).
    - `interfaces.ts`: Definições de interfaces TypeScript para tipos de dados globais usados em toda a aplicação.
    - `services/`: Contém os serviços Angular que encapsulam a lógica de negócio, comunicação com APIs e gerenciamento de estado.
      - Ex: `api.ts`, `bot.service.ts`, `champion.service.ts`, `discord-integration.service.ts`, `match-linking.ts`, `player-search.ts`, `profile-icon.service.ts`, `queue-state.ts`.
  - `index.html`: O ponto de entrada HTML da aplicação Angular.
  - `main.ts`: O arquivo principal para bootstrapping da aplicação Angular.
  - `styles.scss`: Estilos globais da aplicação.
- `tsconfig.*.json`: Arquivos de configuração do TypeScript.

## 🧠 Análise Detalhada da Arquitetura e Componentes Chave

### Arquitetura Angular

O frontend segue a arquitetura de componentes do Angular, que promove a modularidade e reutilização de código. Cada funcionalidade ou seção da UI é encapsulada em um componente, que pode ser aninhado ou reutilizado. Serviços são injetados nos componentes para separar a lógica de negócio da lógica de apresentação, e o roteamento (`app.routes.ts`) gerencia a navegação entre as diferentes visualizações da aplicação.

- **Componentes:** São os blocos de construção da UI. Eles combinam um template (HTML), estilos (SCSS) e lógica (TypeScript). O Angular gerencia o ciclo de vida dos componentes (criação, atualização, destruição), permitindo manipulações eficientes do DOM.
- **Serviços:** São classes que encapsulam a lógica de negócio, comunicação com APIs externas, gerenciamento de estado e outras funcionalidades que podem ser compartilhadas entre múltiplos componentes. A injeção de dependência do Angular facilita a utilização e testabilidade dos serviços.
- **Roteamento:** O `app.routes.ts` define as rotas da aplicação, mapeando URLs a componentes específicos. Isso permite uma navegação Single Page Application (SPA) sem recarregar a página inteira.
- **HTTP Client:** O Angular utiliza seu próprio `HttpClient` (ou `fetch` e `Axios` em projetos mais antigos) para se comunicar com o backend, fazendo requisições GET, POST, PUT, DELETE para os endpoints da API.
- **RxJS:** Amplamente utilizado para lidar com eventos assíncronos e fluxos de dados, especialmente na comunicação com o backend e no gerenciamento de estado reativo.

### 📄 Arquivo: `app.ts` (App Componente Principal)

- **Localização:** `src/frontend/src/app/app.ts`
- **Propósito:** Este é o componente raiz da aplicação Angular. Ele serve como o contêiner principal para todos os outros componentes e rotas. É onde a estrutura global da UI é definida, e onde serviços globais podem ser inicializados.
- **Lógica e Funcionamento:**
  - Gerencia a navegação principal e a estrutura do layout (cabeçalho, rodapé, navegação lateral).
  - Pode conter lógica para inicialização de serviços globais (ex: verificar status de conexão, carregar configurações iniciais).
  - O `app.html` associado define o template HTML para o componente raiz, incluindo o `<router-outlet>` onde os componentes de rota são renderizados.
- **Tecnologias e Implementação:** Decorador `@Component` do Angular, `RouterOutlet`, `NgIf`, `NgFor` (diretivas estruturais) e injeção de serviços.
- **Considerações e Melhorias:** Manter este componente o mais 'burro' possível, delegando a lógica complexa para serviços ou componentes filhos, é uma boa prática para escalabilidade.

### 📄 Arquivo: `api.ts` (Serviço de Comunicação com o Backend)

- **Localização:** `src/frontend/src/app/services/api.ts`
- **Propósito:** Este serviço centraliza todas as chamadas HTTP para o backend Node.js. Ele encapsula a lógica de requisições, tratamento de erros e parsing de respostas, fornecendo uma interface limpa para outros serviços e componentes.
- **Lógica e Funcionamento:**
  - Define métodos assíncronos (usando `Promise` ou `Observable` do RxJS) para interagir com os diferentes endpoints da API (ex: `GET /api/champions`, `POST /api/matchmaking`).
  - Pode incluir lógica para adicionar *headers* (como tokens de autenticação), tratar erros de rede ou de API, e transformar dados JSON recebidos em objetos TypeScript tipados.
- **Tecnologias e Implementação:** `HttpClient` do Angular, `Observable` (RxJS), `Promise`s, interfaces TypeScript para tipagem dos dados da API.
- **Considerações e Melhorias:** Implementar interceptors HTTP para lidar globalmente com autenticação, erros e *loading states*. Caching de respostas de API pode melhorar o desempenho em dados que não mudam com frequência.

### 📁 Componentes Específicos (Exemplos)

Para cada componente em `src/frontend/src/app/components/`, a estrutura geral e a análise se aplicam:

- **`match-found/`:**
  - **Funcionalidade:** Exibe a tela quando uma partida é encontrada. Lida com a confirmação ou recusa da partida.
  - **Lógica:** O componente (`match-found.ts`) ouve eventos de matchmaking (provavelmente via um serviço como `queue-state.ts` ou `api.ts` com WebSockets), exibe um modal ou rota com detalhes da partida (campeões, jogadores), e permite a interação do usuário para aceitar/recusar. Integração com `DiscordIntegrationService` para notificar o usuário no Discord.
  - **Tecnologias:** `@Component`, `Input`/`Output` (para comunicação entre componentes), `Router` (para navegação), `NgIf`/`NgSwitch` (para lógica condicional do template), `scss` para animações e responsividade.
  - **Considerações:** Gerenciamento de timeout para aceitar a partida, feedback visual claro e tratamento de múltiplos cenários de estado (ex: match encontrado, match recusado por outro jogador).

- **`dashboard/`:**
  - **Funcionalidade:** A tela principal do usuário, exibindo um resumo de estatísticas, notícias, status de fila, etc.
  - **Lógica:** Agrega dados de múltiplos serviços (ex: `PlayerService`, `ChampionService`, `QueueStateService`) para construir a visualização. Pode incluir gráficos, listas e widgets interativos.
  - **Tecnologias:** `Angular Material` (se usado para UI), componentes filhos para cada widget, RxJS para combinar múltiplos fluxos de dados assíncronos.

- **`draft/` (e seus sub-componentes como `draft-pick-ban`, `draft-champion-modal`, `draft-confirmation-modal`):**
  - **Funcionalidade:** Simula o processo de `pick-ban` de campeões do League of Legends, com seleção de campeões, bans, e contadores de tempo.
  - **Lógica:** Componente complexo que gerencia o estado do draft em tempo real (quem escolhe, quem bane, tempo restante), interage com o `DraftService` (no backend) e `ChampionService` (no frontend) para obter dados e enviar ações. Modais (`draft-champion-modal`, `draft-confirmation-modal`) são usados para interações específicas do usuário.
  - **Tecnologias:** `NgFor` (para listar campeões), `NgClass` (para aplicar estilos dinâmicos), `HostListener` (para interações de teclado, se houver), `setInterval` (para contadores de tempo), comunicação entre componentes (Inputs/Outputs ou serviços compartilhados).

- **`game-in-progress/`:**
  - **Funcionalidade:** Exibe informações sobre uma partida que está atualmente em andamento.
  - **Lógica:** O componente ouve atualizações de um serviço (provavelmente ligado a WebSockets do `GameInProgressService` do backend) para mostrar tempo de jogo, placar, builds de jogadores, etc.
  - **Tecnologias:** Atualizações reativas de UI, possivelmente uso de `WebSockets` através de um serviço Angular wrapper para comunicação em tempo real.

### 📄 Arquivo: `interfaces.ts`

- **Localização:** `src/frontend/src/app/interfaces.ts`
- **Propósito:** Este arquivo centraliza as definições de interfaces TypeScript para os modelos de dados utilizados em toda a aplicação frontend. Isso garante consistência de dados e forte tipagem.
- **Lógica e Funcionamento:** Contém interfaces como `IPlayer`, `IChampion`, `IMatchDetails`, etc., que refletem a estrutura dos dados recebidos do backend ou usados internamente no frontend.
- **Tecnologias e Implementação:** TypeScript `interface` keyword.
- **Considerações:** Manter as interfaces atualizadas com as mudanças na API do backend é crucial. O uso de ferramentas de geração de tipos (se houver) pode automatizar isso.

### 📁 Serviços Específicos (Exemplos)

Para cada serviço em `src/frontend/src/app/services/`, a análise se aplica:

- **`champion.service.ts`:**
  - **Funcionalidade:** Gerencia o carregamento e acesso a dados de campeões do League of Legends.
  - **Lógica:** Busca dados de campeões do backend (via `api.ts`), pode fazer caching localmente no navegador (`localStorage` ou `sessionStorage`) para desempenho. Oferece métodos para buscar campeões por ID, nome, filtrar por lane, etc.
  - **Tecnologias:** `HttpClient`, RxJS `BehaviorSubject` (para dados de campeões em cache), `map`, `filter` (operadores RxJS).

- **`discord-integration.service.ts`:**
  - **Funcionalidade:** Lida com a lógica de integração com o Discord a partir do frontend.
  - **Lógica:** Provavelmente expõe métodos para enviar notificações, interagir com o bot Discord, ou gerenciar o status do usuário no Discord. Pode se comunicar com o `DiscordService` no backend via API.
  - **Tecnologias:** `HttpClient`, IPC (se houver comunicação direta com Electron para nots. nativas).

- **`queue-state.ts`:**
  - **Funcionalidade:** Gerencia o estado da fila de matchmaking no frontend.
  - **Lógica:** Mantém o estado atual da fila (em fila, partida encontrada, etc.), e notifica os componentes interessados sobre mudanças. Pode ser atualizado via WebSockets do backend ou polling.
  - **Tecnologias:** RxJS `Subject` ou `BehaviorSubject` para gerenciamento de estado reativo.

## 🔗 Integração do Frontend com Backend e Electron

- **Comunicação com Backend:** O frontend interage exclusivamente com o backend através de chamadas de API (RESTful) para dados e, crucialmente, via WebSockets para comunicação em tempo real (matchmaking, atualizações de jogo, etc.). O `api.ts` é o principal ponto de contato para REST.
- **Comunicação com Electron:** Através do script `preload.ts` e dos *handlers* `ipcMain` em `main.ts`, o frontend pode invocar funcionalidades nativas do sistema (ex: controlar a janela, acessar informações do aplicativo). Isso é feito via `ipcRenderer.invoke` (no frontend) e `ipcMain.handle` (no processo main do Electron), garantindo uma ponte de comunicação segura e tipada.

Esta documentação fornece uma análise aprofundada do módulo Frontend. Agora, vamos prosseguir com a documentação do Backend, e depois as documentações específicas de cada componente/serviço.
