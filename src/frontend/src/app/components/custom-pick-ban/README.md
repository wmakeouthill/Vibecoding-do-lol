# Documentação do Componente `CustomPickBanComponent`

## 📄 Visão Geral

O `CustomPickBanComponent` é um componente Angular crucial responsável por gerenciar a interface de usuário para as fases de seleção e banimento de campeões em partidas personalizadas. Ele interage dinamicamente com o backend para coordenar as escolhas dos jogadores, exibir informações dos campeões e gerenciar o estado da partida durante o processo de pick/ban.

**Nota:** Devido a limitações técnicas na leitura completa do arquivo `custom-pick-ban.ts`, esta documentação é baseada nas partes do código que foram acessadas. Pode haver funcionalidades adicionais ou detalhes não abordados aqui. Se necessário, o código-fonte deve ser consultado diretamente para uma compreensão completa.

## 📁 Estrutura do Diretório

- `custom-pick-ban.ts`: Contém a lógica do componente, gerenciamento de estado, interações com serviços e manipulação de eventos.
- `custom-pick-ban.html`: Define a estrutura visual (template) do componente.
- `custom-pick-ban.scss`: Contém os estilos específicos do componente.

## 💡 `custom-pick-ban.ts`

Este é o arquivo TypeScript que define o `CustomPickBanComponent`. Ele gerencia a maior parte da lógica de negócios e interação com o usuário.

### Propósito e Funcionalidades Principais

O componente gerencia a complexa lógica de um sistema de pick/ban personalizado, incluindo:

- **Seleção de Campeões:** Permite aos jogadores selecionar campeões para suas equipes ou para banimento.
- **Exibição de Status do Jogo:** Exibe informações em tempo real sobre o estado atual da partida personalizada, incluindo campeões selecionados, banidos, e o jogador atual na vez.
- **Interação com Backend:** Comunica-se com o backend para enviar ações de pick/ban, receber atualizações de estado do jogo e buscar dados de campeões.
- **Gerenciamento de Tempo:** Lida com temporizadores para as fases de seleção e banimento.
- **Feedback Visual:** Fornece feedback visual aos usuários sobre as escolhas, campeões disponíveis e o progresso do jogo.

### Observações sobre a Lógica (Baseado em Informações Parciais)

Embora não tenha sido possível analisar o arquivo `custom-pick-ban.ts` na íntegra, as seções observadas sugerem as seguintes funcionalidades e padrões:

- **Injeção de Dependências:** O componente provavelmente injeta serviços como `DataDragonService` (para dados de campeões), `LCUService` (para interações com o cliente League of Legends), `MatchmakingService`, `PlayerService` e `DiscordIntegrationService` para comunicação e sincronização.
- **Gerenciamento de Estado:** Utiliza propriedades para armazenar o estado da partida, como `gameInProgress`, `players`, `currentView`, `myTeam`, `enemyTeam`, `availableChampions`, `selectedChampion`, `phaseCountdown`, entre outros.
- **Eventos e Ciclo de Vida:** Implementa métodos do ciclo de vida do Angular (`ngOnInit`, `ngOnDestroy`) para inicializar o componente, configurar listeners de eventos e limpar recursos.
- **Comunicação com WebSocket/Sinalização:** É provável que utilize um serviço de sinalização (`SignalingService`) para receber atualizações em tempo real do backend sobre o estado do jogo (picks, bans, timers).
- **Manipulação de Eventos de UI:** Contém métodos para lidar com eventos de usuário, como cliques em campeões (`handleChampionClick`), confirmação de escolhas (`confirmPickBan`), etc.
- **Lógica de Seleção e Banimento:** Implementa a lógica para determinar se um campeão pode ser selecionado, se está banido ou já foi escolhido.
- **Timer e Notificações:** Gerencia um temporizador para cada fase e pode emitir notificações sonoras ou visuais.

## 🎨 `custom-pick-ban.html`

Este arquivo define a estrutura visual do componente, exibindo informações sobre o estado da partida de pick/ban, as fases atuais, os campeões disponíveis, selecionados e banidos, e gerenciando as interações do usuário.

### Estrutura e Elementos Chave

O template HTML é dividido em várias seções principais:

- **Header (`pick-ban-header`):** Exibe informações da sessão, como o título da seleção de campeões, a fase atual (`getCurrentPhaseText()`) e uma barra de progresso (`getPhaseProgress()`). Inclui também a seção de temporizador (`timer-section`) que mostra o tempo restante (`timeRemaining`) para a ação atual e o nome do jogador atual (`getCurrentPlayerName()`). Um botão de debug temporário está presente para visualização de dados.
- **Contêiner de Times (`teams-container`):** Divide a tela em seções para o **Time Azul** (`blue-team`), **Time Vermelho** (`red-team`) e uma seção central para **Bans Gerais** (`bans-section`).
  - **Bans por Time (`team-bans`):** Exibe os campeões banidos por cada equipe (`getTeamBans()`). Slots vazios (`banned-placeholder`) são usados para indicar bans pendentes.
  - **Picks por Time (`team-picks`):** Exibe os campeões escolhidos por cada jogador de cada equipe (`getPlayerPick()`), organizados por lane (`getSortedTeamByLane()`). Inclui informações do jogador (`summonerName`, `name`, `player-lane`) e um indicador "(Você)" (`you-indicator`) para o jogador local. Slots vazios (`emptySlot`) são exibidos para picks pendentes.
  - **Bans Centrais (`bans-section`):** Mostra uma lista de todos os campeões banidos globalmente (`getBannedChampions()`).
- **Seleção de Campeão (`champion-selection`):** Ativado quando é a vez do jogador local (`isMyTurn`). Exibe o título da ação atual (Banir ou Escolher Campeão) e um botão para abrir o modal de seleção (`openChampionModal()`).
- **Mensagens de Espera/Conclusão:**
  - **Mensagem de Espera (`waiting-message`):** Exibida quando não é a vez do jogador, indicando que o aplicativo está aguardando outros jogadores.
  - **Mensagem de Conclusão (`completion-message`):** Exibida quando todas as fases de pick/ban estão completas, mostrando os times finais e botões para iniciar ou cancelar a partida.
- **Modal de Seleção de Campeões (`champion-modal-overlay`):** Um modal sobreposto que permite ao jogador selecionar um campeão para banir ou escolher.
  - **Header do Modal (`modal-header`):** Contém o título da ação, o nome do jogador atual e um temporizador específico para o modal (`modalTimeRemaining`).
  - **Filtros do Modal (`modal-filters`):** Inclui botões para filtrar campeões por lane (`selectRoleInModal()`) e um campo de busca (`modal-champion-search`, usando `ngModel`) para filtrar campeões por nome.
  - **Grid de Campeões (`modal-champions-grid`):** Exibe os campeões filtrados (`getModalFilteredChampions()`) em um grid. Cada card de campeão exibe a imagem, nome e sobreposições (`banned-overlay`, `picked-overlay`) para indicar se o campeão já está banido ou escolhido.
  - **Footer do Modal (`modal-footer`):** Exibe uma pré-visualização do campeão selecionado (`modalSelectedChampion`) e botões para cancelar (`cancelModalSelection()`) ou confirmar a seleção (`confirmModalSelection()`). O botão de confirmação é desabilitado se nenhum campeão for selecionado ou se o campeão já estiver banido/escolhido.
- **Diálogo de Confirmação Final (`final-confirmation-overlay`):** Um modal para a confirmação final das seleções e banimentos antes de iniciar a partida.
  - Exibe um resumo detalhado dos times, incluindo picks e bans, permitindo uma revisão antes de prosseguir.
  - Inclui botões para cancelar a partida, editar a seleção ou confirmar e continuar.

## 🖌️ `custom-pick-ban.scss`

Este arquivo SCSS define os estilos visuais para o `CustomPickBanComponent`, garantindo que a interface seja responsiva, coesa e alinhada ao design geral da aplicação. O uso de SASS permite uma organização modular e reusável dos estilos.

### Estilos Principais e Organização

O `custom-pick-ban.scss` é estruturado para estilizar cada parte do componente, desde o layout geral até detalhes de elementos interativos e estados. Algumas das áreas de estilo observadas incluem:

- **Estilos Globais do Componente (`.custom-pick-ban`):** Define o padding, background (com gradiente), cor do texto e fonte para todo o componente, estabelecendo a base visual.
- **Header (`.pick-ban-header`):** Estilos para o cabeçalho, incluindo layout flex, background translúcido com `backdrop-filter`, bordas arredondadas e padding. Subseções como `session-info`, `phase-indicator`, `current-phase`, `progress-bar` e `progress-fill` são estilizadas para exibir o status da sessão e o progresso da fase de pick/ban.
- **Temporizador (`.timer-section`, `.timer`, `.timer.warning`):** Estilos para o contador de tempo, incluindo cores, padding, bordas e uma animação `pulse` para o estado de aviso (tempo baixo).
- **Indicador do Jogador Atual (`.current-player`):** Estilos para exibir o nome do jogador na vez.
- **Contêiner de Times (`.teams-container`):** Define um layout de grid para organizar os painéis dos times e a seção de bans centrais.
- **Estilos dos Times (`.team`, `.blue-team`, `.red-team`):** Estilos gerais para os painéis das equipes, incluindo background, bordas arredondadas e cores de borda específicas para cada time.
- **Bans (`.team-bans`, `.banned-champions-row`, `.banned-champion`, `.banned-placeholder`):** Estilos para a exibição de campeões banidos, incluindo ícones, nomes, sobreposições e placeholders para bans pendentes.
- **Picks (`.team-picks`, `.pick-slot`, `.champion-img`, `.pick-info`, `.player-name`, `.champion-name`):** Estilos para os slots de escolha de campeões, incluindo layout flex, ícones de campeões, informações do jogador e do campeão, e indicadores.
- **Seção de Seleção (`.champion-selection`):** Estilos para o botão de abertura do modal, incluindo ícones e textos.
- **Mensagens (`.waiting-message`, `.completion-message`):** Estilos para mensagens de espera e de conclusão, incluindo ícones e layout.
- **Modal de Seleção de Campeões (`.champion-modal-overlay`, `.champion-modal`):** Estilos para o overlay e o modal principal, incluindo posicionamento, background, filtros de lane (`.modal-role-filter`, `.role-btn`), campo de busca (`.modal-search-container`, `.modal-champion-search`), grid de campeões (`.modal-champions-grid`, `.modal-champion-card`), e elementos de preview/confirmação no footer.
- **Overlays de Status de Campeão (`.banned-overlay`, `.picked-overlay`):** Estilos para as sobreposições visuais que indicam se um campeão está banido ou escolhido no grid do modal.
- **Diálogo de Confirmação Final (`.final-confirmation-overlay`, `.final-confirmation-modal`):** Estilos para o modal de confirmação final, que replica a visualização dos times para revisão.

### Responsividade e Animações

O SCSS provavelmente inclui media queries para garantir que o layout se adapte a diferentes tamanhos de tela. Animações e transições (`transition: width 0.3s ease;` para a barra de progresso e `@keyframes pulse` para o temporizador de aviso) são usadas para melhorar a experiência do usuário.

## 🔗 Dependências

Este componente provavelmente depende de:

- **Serviços Angular:** `DataDragonService`, `LCUService`, `MatchmakingService`, `PlayerService`, `DiscordIntegrationService`, `SignalingService`.
- **Módulos Angular:** `CommonModule`, `FormsModule`, `ReactiveFormsModule` (para formulários).
- **Modelos de Dados/Interfaces:** Interfaces definidas em `interfaces.ts` para tipagem de dados como `ChampionData`, `Player`, `Team`, `GameInProgress`.

## 🛠️ Tecnologias Utilizadas

- **Angular**: Framework para o desenvolvimento do frontend.
- **TypeScript**: Linguagem de programação para a lógica do componente.
- **HTML**: Estrutura do template.
- **SCSS (Sass)**: Pré-processador CSS para estilos.
- **WebSockets**: Para comunicação em tempo real com o backend (via `SignalingService`).

## 📈 Potenciais Melhorias

- **Otimização de Renderização:** Para grandes listas de campeões, considerar virtualização ou estratégias de detecção de mudanças mais otimizadas para melhorar o desempenho.
- **Testes Unitários/de Integração:** Expandir a cobertura de testes para a lógica do componente e interações com serviços.
- **Acessibilidade:** Garantir que o componente seja acessível a usuários com deficiência, adicionando atributos ARIA e melhorando a navegação via teclado.
- **Reusabilidade:** Se houver lógicas de UI semelhantes em outros componentes, extraí-las para um serviço ou componente compartilhado.
- **Modularização:** Avaliar a possibilidade de dividir o componente em subcomponentes menores para melhor manutenção e reusabilidade.
