# Scripts de Utilitário do Banco de Dados

Esta pasta contém scripts utilitários relacionados a operações de banco de dados, especificamente para a limpeza ou redefinição de dados. É importante notar que, embora o projeto principal utilize MySQL, alguns desses scripts podem ter sido desenvolvidos para um contexto anterior ou para operações específicas que envolvam SQLite.

## `clear_custom_matches.js`

Este script JavaScript possui duas funcionalidades principais:

1. **Limpeza da Tabela `custom_matches` (SQLite - Potencialmente Legado):**
    * **Propósito:** Originalmente, este script visava deletar todos os registros da tabela `custom_matches` em um banco de dados SQLite (`database.sqlite`).
    * **Tecnologia:** Utiliza `sqlite3` para interagir com o banco de dados SQLite.
    * **Contexto:** Dada a migração para MySQL no projeto principal, esta parte do script pode ser considerada um remanescente de uma implementação anterior ou para uso em um ambiente de desenvolvimento local que ainda utiliza SQLite para testes específicos.

2. **Limpeza de Dados Corrompidos na Fila (`queue_players` - MySQL):**
    * **Propósito:** Conecta-se ao banco de dados MySQL principal e verifica a tabela `queue_players` por entradas consideradas "corrompidas" (jogadores na fila por um tempo excessivamente longo ou com `join_time` inválido). Ele então desativa esses jogadores (`is_active = 0`).
    * **Tecnologia:** Utiliza `mysql2/promise` para interagir com o MySQL.
    * **Lógica:** Calcula o tempo que os jogadores estão na fila e os marca como corrompidos se o tempo for negativo ou exceder um limite (3 horas). Oferece uma opção de limpeza manual/automática para remover esses jogadores da fila.
    * **Uso:** Este script pode ser executado como uma ferramenta de manutenção para garantir a integridade da fila de matchmaking.

## `reset_custom_matches.ts`

Este script TypeScript é projetado para redefinir a tabela `custom_matches` em um banco de dados SQLite.

* **Propósito:** Deleta todos os registros da tabela `custom_matches` e redefine a sequência de IDs (`sqlite_sequence`), efetivamente "limpando" a tabela para um estado inicial.
* **Tecnologia:** Utiliza `sqlite3` e `sqlite` (com `open`) para interagir com o banco de dados SQLite.
* **Contexto:** Similar ao uso de SQLite em `clear_custom_matches.js`, este script provavelmente serve a um propósito específico de desenvolvimento ou teste com um banco de dados SQLite local, não sendo diretamente ligado ao MySQL principal do backend.
