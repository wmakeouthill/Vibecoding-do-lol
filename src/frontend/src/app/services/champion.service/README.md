# Documentação: `ChampionService.ts`

O `ChampionService.ts`, localizado em `src/frontend/src/app/services/`, é o serviço Angular responsável por gerenciar o carregamento, o cache e o fornecimento de dados de campeões do League of Legends para toda a aplicação frontend. Ele atua como uma camada de abstração para a obtenção de dados do Data Dragon (via backend), garantindo que os componentes da UI tenham acesso fácil e eficiente às informações dos campeões.

## 🎯 Propósito e Funcionalidades Principais

O `ChampionService` abrange as seguintes responsabilidades:

1. **Carregamento de Campeões:** Obtém a lista completa de campeões e seus detalhes (imagens, tags, estatísticas) do backend.
2. **Cache Inteligente:** Armazena em cache os campeões carregados e os campeões organizados por função (`ChampionsByRole`) para evitar requisições repetitivas e melhorar a performance.
3. **Organização por Função (Role):** Organiza os campeões em categorias por função (Top, Jungle, Mid, ADC, Support) com base em suas tags, facilitando a filtragem na UI.
4. **Busca e Filtragem:** Permite buscar campeões por nome, título ou tags, e filtrar a lista por função, atendendo às necessidades de seleção em diferentes partes da aplicação (ex: pick/ban).
5. **Fornecimento de Fallback:** Em caso de falha na comunicação com o backend para obter dados de campeões, o serviço oferece uma lista mínima de campeões de fallback, garantindo que a aplicação possa operar com funcionalidade básica.
6. **Seleção Aleatória:** Oferece um método para obter um campeão aleatório da lista, excluindo IDs específicos se necessário.

## ⚙️ Lógica e Funcionamento

### Interfaces (`Champion`, `ChampionsByRole`)

* **`Champion`:** Define a estrutura de dados para um único campeão, incluindo `id`, `key`, `name`, `title`, `image` (URL), `tags` (array de strings como 'Fighter', 'Mage'), e `info` (estatísticas de ataque, defesa, magia, dificuldade).
* **`ChampionsByRole`:** Agrupa coleções de campeões por suas funções principais (top, jungle, mid, adc, support), além de uma lista de todos os campeões.

### Inicialização (`constructor`)

* O construtor recebe instâncias de `HttpClient` (para requisições HTTP) e `ApiService` (para obter a URL base do backend). Ele define a `baseImageUrl` para os retratos dos campeões e um `roleMapping` para categorizar campeões por função.

### Carregamento e Cache de Campeões (`getAllChampions`, `getChampionsByRole`, `clearCache`)

* **`getAllChampions()`:**
  * Primeiro, verifica se os campeões já estão no `cachedChampions`. Se sim, retorna o cache imediatamente via `of(this.cachedChampions)` (RxJS `of` para um Observable síncrono).
  * Se o cache estiver vazio, faz uma requisição GET para o endpoint `/champions` do backend via `http.get()`. Espera uma resposta com `response.success` e `response.champions`.
  * Em caso de sucesso, armazena os campeões em `cachedChampions`. Em caso de erro na requisição, retorna a `fallbackChampions` (uma lista predefinida de campeões).
* **`getChampionsByRole()`:**
  * Similar a `getAllChampions()`, verifica e retorna `cachedChampionsByRole` se disponível.
  * Caso contrário, faz uma requisição para o backend (`/champions`) para obter a lista já organizada por role. Se o backend falhar, usa `createFallbackChampionsByRole()`.
* **`createFallbackChampionsByRole()`:** Um método privado que organiza os `fallbackChampions` em categorias por função com base no `roleMapping`.
* **`clearCache()`:** Limpa o cache de campeões, forçando um novo carregamento do backend na próxima vez que for solicitado.

### Utilitários de Campeões (`getChampionNameById`, `searchChampions`, `getRandomChampion`, `isChampionBanned`, `isChampionPicked`)

* **`static getChampionNameById(championId)`:** Um método estático que tenta retornar o nome de um campeão pelo seu ID. Atualmente, ele é um fallback simples que retorna `'Minion'` se o ID for desconhecido, pois o backend já deve fornecer nomes completos.
* **`searchChampions(query, role?)`:** Filtra a lista de todos os campeões (obtida de `getAllChampions()`) com base em uma `query` de texto (nome, título, tags) e opcionalmente por uma `role` (Top, Jungle, Mid, ADC, Support).
* **`getRandomChampion(excludeIds)`:** Retorna um `Observable` de um campeão selecionado aleatoriamente da lista de todos os campeões, excluindo aqueles cujos IDs estão na lista `excludeIds`.
* **`isChampionBanned(championId, bannedChampions)` / `isChampionPicked(championId, pickedChampions)`:** Métodos booleanos que verificam se um campeão já foi banido ou escolhido em uma lista fornecida, útil para a lógica de UI durante o draft.

## 🛠️ Tecnologias e Implementação

* **Angular `Injectable`:** Permite que o serviço seja injetado em outros componentes e serviços, promovendo a modularidade.
* **Angular `HttpClient`:** Utilizado para realizar requisições HTTP para o backend.
* **RxJS (`Observable`, `of`, `catchError`, `map`):** Amplamente usado para lidar com operações assíncronas (chamadas HTTP), cache de dados e transformação de streams de dados de forma reativa.
* **TypeScript:** Garante a tipagem forte de todas as interfaces e parâmetros, resultando em um código mais robusto e fácil de manter.
* **Padrão de Cache:** Implementa um padrão de cache simples para otimizar o desempenho e reduzir a carga no backend.

## ⚠️ Considerações e Boas Práticas

* **Consistência do Fallback:** A lista de `fallbackChampions` é manual e pode ficar desatualizada. Idealmente, ela seria gerada ou mantida automaticamente, ou a dependência total no backend seria reforçada.
* **Atualização do Data Dragon:** A `baseImageUrl` está hardcoded com uma versão (`15.13.1`). Isso pode precisar ser atualizado manualmente em cada patch do jogo ou ser obtido dinamicamente da Riot API (através do `DataDragonService` do backend).
* **Otimização de Pesquisa/Filtragem:** Para um número muito grande de campeões, a lógica de filtragem `searchChampions` pode ser otimizada para melhor desempenho (ex: usando web workers ou algoritmos de busca mais eficientes se a lista for extremamente grande).
* **Tratamento de Erros:** O serviço lida com erros do backend retornando dados de fallback. Uma estratégia mais sofisticada pode incluir notificar o usuário sobre a falha no carregamento dos dados mais recentes.
* **Testes:** Testes unitários para a lógica de cache, filtragem, e `getRandomChampion` são importantes para garantir a corretude do serviço.
