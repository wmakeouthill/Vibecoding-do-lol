# Documentação: `RiotAPIService.ts`

O `RiotAPIService.ts`, localizado em `src/backend/services/`, é o serviço dedicado a todas as interações com a API oficial da Riot Games. Ele atua como um invólucro para as chamadas HTTP à API, gerenciando a autenticação, roteamento entre regiões (incluindo o roteamento regional da API de Contas), tratamento de erros e fornecendo métodos tipados para buscar dados de League of Legends.

## 🎯 Propósito e Funcionalidades Principais

O `RiotAPIService` encapsula a complexidade da API da Riot, oferecendo:

1. **Gerenciamento de Chave de API:** Carrega a chave de API de variáveis de ambiente e permite sua configuração dinâmica, verificando sua validade.
2. **Roteamento de Requisições:** Gerencia o roteamento correto das requisições para os endpoints específicos de plataforma (por região de invocador) e os endpoints regionais (Américas, Ásia, Europa, SEA) para a API de Contas e Histórico de Partidas.
3. **Obtenção de Dados de Invocador:** Busca informações detalhadas de invocadores por nome (legado) ou por `PUUID`/`DisplayName` (novo sistema de nomes).
4. **Obtenção de Dados Ranqueados:** Recupera o status ranqueado de um invocador em diferentes filas (Solo/Duo, Flex).
5. **Histórico de Partidas:** Obtém uma lista de IDs de partidas e detalhes completos de partidas específicas.
6. **Tratamento de Erros:** Implementa interceptadores de requisição para lidar com erros comuns da API (ex: 401, 403, 404, timeouts).

## ⚙️ Lógica e Funcionamento

### Inicialização (`constructor`, `createAxiosInstance`, `setApiKey`, `isApiKeyConfigured`)

* O construtor inicializa a classe, tentando carregar a `RIOT_API_KEY` das variáveis de ambiente. Se a chave não for encontrada, um aviso é logado.
* **`createAxiosInstance()`:** Configura uma instância do `axios` com um timeout padrão e adiciona o cabeçalho `X-Riot-Token` com a chave de API. Inclui um interceptor para lidar com erros de resposta HTTP.
* **`setApiKey(newKey)`:** Permite que a chave de API seja definida ou atualizada em tempo de execução, garantindo que o `axiosInstance` seja atualizado.
* **`isApiKeyConfigured()`:** Retorna `true` se uma chave de API válida estiver configurada.

### Validação da Chave de API (`validateApiKey`)

* Este método tenta fazer uma requisição leve (para o endpoint de status da plataforma) para verificar se a chave de API é válida e tem as permissões corretas para uma determinada região. Lança um erro se a chave for inválida (401/403) ou se houver outros problemas de conexão.

### Roteamento Regional (`baseUrls`, `regionalRoutingMap`, `regionalBaseUrls`, `getRegionalUrl`)

* A classe define mapas (`baseUrls`, `regionalRoutingMap`, `regionalBaseUrls`) para correlacionar regiões de plataforma (ex: `br1`) com os URLs de base corretos da API da Riot e com os grupos de roteamento regional (ex: `americas`).
* **`getRegionalUrl(platformRegion)`:** Um método utilitário que, dada uma região de plataforma, retorna o URL de roteamento regional apropriado (ex: `https://americas.api.riotgames.com`). Isso é crucial para as APIs de Conta e Histórico de Partidas, que usam roteamento regional em vez de roteamento de plataforma.

### Obtenção de Dados de Jogador

* **`getSummoner(nameInput, region)`:** Um método unificado que pode buscar dados de invocador tanto pelo nome legado quanto pelo novo `gameName#tagLine`. Ele tenta usar `getSummonerByDisplayName` primeiro e, se falhar, usa `getSummonerByName` como fallback. Retorna dados completos do invocador, incluindo `PUUID`, informações ranqueadas e dados da conta.
* **`getSummonerByName(summonerName, region)`:** Busca dados de invocador por seu nome legado (antigo sistema de nomes) e `region`. Também tenta buscar dados de conta (gameName/tagLine) e ranqueados, consolidando tudo em um único objeto de retorno.
* **`getSummonerByPuuid(puuid, region)`:** Busca dados de invocador utilizando o `PUUID`, que é o identificador mais estável.
* **`getAccountByPuuid(puuid, region)`:** Busca dados da conta (gameName, tagLine) usando o `PUUID` na API de Contas (que usa roteamento regional).
* **`getSummonerByDisplayName(gameName, tagLine, region)`:** Busca dados de invocador usando o novo sistema de `DisplayName` (`gameName` e `tagLine`) e a região. Esta é a forma preferida para novas consultas.

### Obtenção de Dados Ranqueados (`getRankedData`)

* Faz uma requisição para `/lol/league/v4/entries/by-summoner/{encryptedSummonerId}` para obter todas as entradas ranqueadas de um invocador.

### Histórico de Partidas (`getMatchHistory`, `getMatchDetails`)

* **`getMatchHistory(puuid, region, count, ...)`:** Busca uma lista de IDs de partidas para um `PUUID` na API de Histórico de Partidas (que usa roteamento regional). Suporta filtros de contagem, tempo e fila.
* **`getMatchDetails(matchId, region)`:** Recupera os detalhes completos de uma partida específica usando seu `matchId` na API de Dados de Partidas (que usa roteamento regional).

## 🛠️ Tecnologias e Implementação

* **TypeScript:** Garante tipagem forte para interfaces de dados (`SummonerData`, `RankedData`, `AccountData`) e para as entradas/saídas dos métodos, melhorando a robustez e a manutenibilidade.
* **`axios`:** A biblioteca HTTP utilizada para fazer as requisições para a API da Riot Games. Sua configuração é centralizada na instância `axiosInstance`.
* **Programação Assíncrona (`async/await`):** Amplamente utilizada para lidar com as chamadas de rede de forma não bloqueante e sequencial.
* **Tratamento de Erros:** Interceptores de `axios` e blocos `try-catch` são usados para capturar e logar erros da API, fornecendo feedback útil.
* **Roteamento e Estratégia de Retries:** A lógica de roteamento regional e de retries com backoff exponencial é crucial para a robustez da integração com a API da Riot Games.

## ⚠️ Considerações e Boas Práticas

* **Limites de Taxa (`Rate Limiting`):** A Riot API impõe limites de taxa rigorosos. Embora não haja uma lógica de *rate limiting* explícita neste serviço (geralmente é gerenciada por uma camada global ou por um proxy), é crucial que a aplicação não exceda esses limites. Exceder os limites pode levar a bloqueios temporários da chave de API.
* **Tratamento de Erros:** O serviço já lida com alguns códigos de erro, mas pode ser aprimorado para casos mais específicos, como invocadores não encontrados (404) ou manutenção da API.
* **Cache:** Para dados que não mudam frequentemente (ex: dados de invocador que não se alteram), a implementação de um cache (ex: Redis) reduziria a carga na API da Riot e melhoraria a performance.
* **Chave de API:** A chave de API deve ser tratada como credencial sensível, carregada via variáveis de ambiente e nunca hardcoded no código fonte. A lógica atual já faz isso, o que é uma boa prática.
* **Documentação da API:** Consultar sempre a documentação oficial da Riot API para garantir que os endpoints e os parâmetros estejam atualizados, pois a API pode sofrer alterações.
* **Confiabilidade de `PUUID`:** O uso do `PUUID` é mais confiável para identificar jogadores a longo prazo do que o `summonerId` ou `summonerName`.
