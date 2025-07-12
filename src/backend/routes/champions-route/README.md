# Documentação: Rotas de Campeões (`champions.ts`)

O arquivo `champions.ts`, localizado em `src/backend/routes/`, é responsável por definir e configurar os endpoints da API RESTful que servem dados relacionados a campeões de League of Legends para o frontend. Ele atua como uma interface entre as requisições HTTP do cliente e a lógica de negócios para obtenção de dados de campeões, delegando a responsabilidade principal ao `DataDragonService`.

## 🎯 Propósito e Funcionalidades Principais

A principal função de `champions.ts` é expor dois endpoints para o consumo de dados de campeões:

1. **Obter Todos os Campeões:** Permite que o frontend solicite uma lista completa de todos os campeões disponíveis, juntamente com uma organização por função (role).
2. **Obter Campeões por Função (Role):** Oferece a funcionalidade de filtrar e obter campeões com base em sua função específica (ex: 'fighter', 'mage', 'tank').

## ⚙️ Lógica e Funcionamento (`setupChampionRoutes`)

A função `setupChampionRoutes` é a principal exportação deste módulo e é chamada durante a inicialização do servidor Express.js (`server.ts`) para registrar as rotas. Ela recebe a instância do aplicativo Express (`app`) e uma instância do `DataDragonService`.

### Endpoint: `GET /api/champions`

* **Propósito:** Retornar uma lista completa de todos os campeões do League of Legends e uma lista organizada por suas respectivas funções.
* **Lógica:**
    1. Verifica se o `DataDragonService` já carregou os dados dos campeões. Se não, invoca `dataDragonService.loadChampions()` para garantir que os dados estejam disponíveis.
    2. Obtém todos os campeões (`dataDragonService.getAllChampions()`).
    3. Obtém os campeões categorizados por função (`dataDragonService.getChampionsByRole()`).
    4. Retorna uma resposta JSON contendo as listas de campeões, `championsByRole`, e o total de campeões.
* **Tratamento de Erros:** Qualquer erro durante o processo é capturado, logado, e uma resposta de erro 500 é enviada ao cliente.

### Endpoint: `GET /api/champions/role/:role`

* **Propósito:** Retornar uma lista de campeões que pertencem a uma função (role) específica (ex: `/api/champions/role/mage`).
* **Lógica:**
    1. Extrai o parâmetro `role` da URL da requisição.
    2. Similar ao endpoint anterior, verifica e garante que os dados dos campeões estejam carregados no `DataDragonService`.
    3. Acessa a lista de campeões por função (`dataDragonService.getChampionsByRole()`) e filtra pela `role` solicitada.
    4. Retorna uma resposta JSON com os campeões da função especificada, o nome da função e o total de campeões encontrados.
* **Tratamento de Erros:** Erros são capturados e tratados de forma semelhante ao endpoint `/api/champions`.

## 🛠️ Tecnologias e Implementação

* **Express.js:** Utilizado para definir as rotas e gerenciar as requisições e respostas HTTP.
* **TypeScript:** Garante a tipagem forte dos parâmetros de requisição (`Request`, `Response`, `RequestHandler`) e dos dados manipulados, melhorando a robustez do código.
* **`DataDragonService`:** Uma dependência crucial que fornece os métodos para acessar os dados dos campeões, isolando a lógica de obtenção e processamento de dados externos da camada de rota.
* **`async/await`:** Utilizado para lidar com operações assíncronas, como o carregamento de dados do `DataDragonService`, de forma mais legível e sequencial.

## ⚠️ Considerações e Boas Práticas

* **Cache:** Embora o `DataDragonService` já possa ter um mecanismo de cache interno, para sistemas de alta carga, uma camada de cache adicional na rota ou no serviço poderia otimizar ainda mais o desempenho e reduzir a latência.
* **Validação de Entrada:** Para o endpoint `/api/champions/role/:role`, seria benéfico adicionar validação para o parâmetro `role` para garantir que apenas funções válidas sejam processadas, prevenindo requisições inválidas ou maliciosas.
* **Paginação e Filtragem Avançada:** Para grandes conjuntos de dados de campeões (embora atualmente seja um número fixo), a implementação de paginação e opções de filtragem mais avançadas (além da role) seria útil para otimizar a transferência de dados e a performance do frontend.
