# Documentação do Backend do Projeto Vibecoding-do-lol

## ⚙️ Visão Geral do Backend Node.js

O backend do projeto, localizado em `src/backend`, é o motor lógico e de dados da aplicação LoL Matchmaking. Construído com Node.js e TypeScript, ele atua como um servidor central que gerencia todas as operações de dados, integrações com APIs externas (principalmente a API oficial do Riot Games e Discord), e coordena a lógica de negócios para funcionalidades como matchmaking, gerenciamento de jogos e perfis de jogadores.

Sua arquitetura é baseada em serviços modulares e rotas API, projetada para alta concorrência e comunicação em tempo real, utilizando WebSockets para eventos críticos (como o status do matchmaking) e RESTful APIs para operações de dados padrão.

## 📁 Estrutura do Módulo Backend

O diretório `src/backend` é organizado da seguinte forma:

- `database/`: Contém scripts e módulos para interação com o banco de dados (se houver), como `DatabaseManager.ts`, e scripts para limpeza ou reset de dados como `clear_custom_matches.js` e `reset_custom_matches.ts`.
- `package.json` e `package-lock.json`: Gerenciamento de dependências Node.js para o backend.
- `routes/`: Define os endpoints da API RESTful.
  - Ex: `champions.ts`.
- `services/`: Contém a lógica de negócio encapsulada em serviços, cada um responsável por uma funcionalidade específica.
  - Ex: `DataDragonService.ts`, `DiscordService.ts`, `DraftService.ts`, `GameInProgressService.ts`, `LCUService.ts`, `MatchFoundService.ts`, `MatchHistoryService.ts`, `MatchmakingService.ts`, `PlayerService.ts`, `RiotAPIService.ts`, `signaling-server.ts`.
- `server.ts`: O ponto de entrada principal do servidor Express.js, onde as rotas e os middlewares são configurados.
- `test-env.js`: Provavelmente um script para configurar ou testar o ambiente em desenvolvimento.
- `tsconfig.json`: Configuração do TypeScript para o backend.

## 🧠 Análise Detalhada da Arquitetura e Componentes Chave

### Arquitetura do Backend

O backend emprega uma arquitetura baseada em camadas:

- **Camada de Rotas (Routes):** Responsável por definir os endpoints HTTP e por receber as requisições dos clientes (Frontend/Electron). As rotas delegam a lógica de negócio para a camada de serviços.
- **Camada de Serviços (Services):** Contém a lógica de negócio principal. Cada serviço é especializado em uma área (ex: `MatchmakingService` lida com a lógica de emparelhamento de jogadores). Eles interagem com APIs externas, banco de dados e outros serviços.
- **Camada de Dados (Database/APIs Externas):** Onde a persistência de dados (seja em um banco de dados local ou via APIs de terceiros como a Riot Games API) é gerenciada. Serviços como `RiotAPIService` e `DatabaseManager` pertencem a esta camada lógica.

### 📄 Arquivo: `server.ts` (Servidor Principal)

- **Localização:** `src/backend/server.ts`
- **Propósito:** Este é o ponto de inicialização do servidor Express.js. Ele configura o aplicativo Express, middlewares, e registra todas as rotas da API.
- **Lógica e Funcionamento:**
  - **Inicialização do Express:** Cria uma instância do aplicativo Express.
  - **Middlewares:** Configura middlewares para parsear JSON (`express.json()`), CORS (Cross-Origin Resource Sharing) para permitir requisições do frontend, e outros middlewares para logging ou tratamento de erros.
  - **Registro de Rotas:** Importa e utiliza os módulos de rota definidos em `src/backend/routes/` para mapear os endpoints da API.
  - **Servidor HTTP:** Inicia o servidor HTTP em uma porta específica (provavelmente 3000, conforme `main.ts` do Electron).
  - **WebSocket:** Pode inicializar um servidor WebSocket (ou integrar com `signaling-server.ts`) para comunicação em tempo real.
- **Tecnologias e Implementação:** Express.js para roteamento e gerenciamento de requisições HTTP, TypeScript para tipagem. Pode usar `cors` para políticas de segurança de domínio.
- **Considerações e Melhorias:** Implementar um robusto tratamento de erros global (error handling middleware). Modularizar a configuração de middlewares e rotas para grandes aplicações. Adicionar validação de esquema para payloads de requisição (ex: com `Joi` ou `Yup`).

### 📁 Serviços Essenciais (Exemplos)

Para cada serviço em `src/backend/services/`, a análise se aplica:

- **`RiotAPIService.ts`:**
  - **Localização:** `src/backend/services/RiotAPIService.ts`
  - **Propósito:** Responsável por toda a comunicação com a API oficial do Riot Games. Ele encapsula a lógica de requisições HTTP, autenticação (chave de API), tratamento de limites de taxa (`rate limiting`), e parsing das respostas.
  - **Lógica e Funcionamento:**
    - Métodos para buscar dados de campeões, informações de invocadores, histórico de partidas, etc.
    - Gerenciamento de chaves de API e estratégias para evitar exceder os limites de requisição da Riot (ex: filas de requisição, backoff exponencial).
    - Transforma os dados brutos da API em estruturas TypeScript tipadas para uso interno.
  - **Tecnologias e Implementação:** `axios` (ou `fetch`) para requisições HTTP, TypeScript para tipagem. Pode usar `async/await` para operações assíncronas.
  - **Considerações e Melhorias:** Caching de dados frequentes (ex: dados de campeões que não mudam) para reduzir chamadas à API da Riot. Implementar retry mechanisms para requisições falhas.

- **`MatchmakingService.ts`:**
  - **Localização:** `src/backend/services/MatchmakingService.ts`
  - **Propósito:** Contém a lógica central para o emparelhamento de jogadores. É um dos serviços mais críticos para a funcionalidade principal da aplicação.
  - **Lógica e Funcionamento:**
    - Recebe solicitações de jogadores para entrar na fila.
    - Implementa algoritmos de matchmaking baseados em critérios como MMR/rank, preferências de lane, tempo na fila.
    - Notifica os jogadores quando uma partida é encontrada, possivelmente via WebSocket (`signaling-server.ts`).
    - Gerencia o estado das filas e das partidas em formação.
  - **Tecnologias e Implementação:** Node.js para concorrência e eventos, pode usar estruturas de dados (filas, mapas) para gerenciar jogadores. Integração com `signaling-server.ts` para comunicação em tempo real.
  - **Considerações e Melhorias:** Otimização dos algoritmos de matchmaking para garantir justiça e rapidez. Tratamento de exceções para jogadores que saem da fila ou recusam partidas.

- **`DiscordService.ts`:**
  - **Localização:** `src/backend/services/DiscordService.ts`
  - **Propósito:** Gerencia todas as interações com a API do Discord, permitindo que a aplicação envie mensagens, notificações e talvez interaja com bots Discord.
  - **Lógica e Funcionamento:**
    - Envia notificações de matchmaking, atualizações de jogos, ou alertas gerais para canais ou usuários Discord.
    - Pode usar webhooks ou a biblioteca `discord.js` (ou similar) para interações mais complexas (ex: comandos de bot).
    - Autenticação com tokens do Discord.
  - **Tecnologias e Implementação:** `discord.js` (se aplicável), requisições HTTP para webhooks, TypeScript.
  - **Considerações e Melhorias:** Gerenciamento seguro de tokens Discord. Adicionar configurações para que os usuários personalizem as notificações do Discord.

- **`signaling-server.ts`:**
  - **Localização:** `src/backend/services/signaling-server.ts`
  - **Propósito:** Este módulo é crucial para a comunicação em tempo real entre o backend e o frontend (e entre os próprios clientes para P2P, se implementado). Ele gerencia as conexões WebSocket.
  - **Lógica e Funcionamento:**
    - Inicia um servidor WebSocket (ex: `ws` ou `socket.io`).
    - Lida com eventos de conexão, desconexão e mensagens de WebSocket.
    - Usado para enviar atualizações de estado de matchmaking, eventos de jogo em tempo real (picks/bans, status de partida), e potencialmente para facilitar a comunicação P2P entre jogadores (se o `LCUService` ou `GameInProgressService` o utilizar para isso).
  - **Tecnologias e Implementação:** Biblioteca WebSocket (ex: `ws`, `socket.io`), Node.js Event Emitters.
  - **Considerações e Melhorias:** Escalabilidade do servidor WebSocket para muitos clientes. Autenticação e autorização das conexões WebSocket para segurança.

### 📁 Rotas da API (Exemplo)

- **`champions.ts`:**
  - **Localização:** `src/backend/routes/champions.ts`
  - **Propósito:** Define as rotas API para operações relacionadas a dados de campeões.
  - **Lógica e Funcionamento:**
    - Define endpoints `GET /api/champions` para listar todos os campeões.
    - Pode ter `GET /api/champions/:id` para buscar detalhes de um campeão específico.
    - Internamente, ele chama o `RiotAPIService` para obter os dados brutos e os formata antes de enviá-los de volta ao cliente.
  - **Tecnologias e Implementação:** Express.js `Router`, TypeScript.
  - **Considerações e Melhorias:** Implementar paginação, filtragem e ordenação para listas grandes de campeões. Adicionar validação de parâmetros de rota.

## 🔗 Integração do Backend com Frontend e Riot API

- **Comunicação Frontend-Backend:** O backend serve como a principal API para o frontend. A comunicação ocorre via requisições HTTP (REST) para dados estáticos e transações, e via WebSockets para comunicação em tempo real e eventos críticos. O endpoint `/api/health` é usado pelo Electron e Frontend para verificar a disponibilidade do backend.
- **Comunicação Backend-Riot API:** O `RiotAPIService` é o gateway para a API da Riot Games, traduzindo as necessidades do frontend em chamadas de API externas e retornando os dados relevantes após processamento.
- **Base de Dados:** A pasta `database/` indica uma camada de persistência. O `DatabaseManager.ts` (ou similar) seria o responsável por gerenciar a conexão e as operações CRUD no banco de dados, que pode ser usado por vários serviços para armazenar dados de usuários, configurações, logs, ou dados cacheados.

Esta documentação fornece uma análise aprofundada do módulo Backend. A seguir, prosseguirei com a documentação de componentes/serviços específicos dentro de cada módulo.
