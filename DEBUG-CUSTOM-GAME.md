# 🐛 Debug - CustomGameService - Criação Automática de Partidas

## 📋 Problema Identificado

A partida customizada não está sendo criada automaticamente nem colocando o jogador na partida no League of Legends via automação LCU.

## 🔍 Principais Falhas Identificadas

### 1. **Estrutura de Dados Incorreta do Lobby**
- ❌ **Problema**: A estrutura enviada para o LCU pode estar incorreta
- ✅ **Correção**: Estrutura corrigida com `banMode` incluído

### 2. **Identificação do Líder Falha**
- ❌ **Problema**: Comparação de nomes pode falhar devido a diferenças de formato
- ✅ **Correção**: Lógica de comparação normalizada e mais robusta

### 3. **SummonerId Incorreto**
- ❌ **Problema**: `summonerId` estava sendo definido como string (nome) em vez de número
- ✅ **Correção**: Busca do `summonerId` real do jogador atual

### 4. **LCU Não Conectado**
- ❌ **Problema**: Se o League of Legends não estiver aberto, a criação falha
- ✅ **Correção**: Verificação melhorada e logs detalhados

## 🧪 Como Testar

### Passo 1: Verificar Conexão LCU
```bash
cd src/backend
node test-lcu-connection.js
```

**Resultado Esperado:**
```
✅ LCU Service inicializado com sucesso
✅ Lobby criado com sucesso
🎉 Todos os testes passaram! LCU está funcionando corretamente.
```

### Passo 2: Testar CustomGameService
```bash
cd src/backend
node test-custom-game.js
```

**Resultado Esperado:**
```
✅ CustomGameService criado
✅ startCustomGameCreation executado com sucesso
📊 Dados da partida customizada: { matchId: 999999, status: 'waiting', ... }
```

### Passo 3: Verificar Logs do Servidor
```bash
# No terminal do servidor, procurar por:
🎮 [CustomGame] Iniciando criação de partida customizada
👑 [CustomGame] Jogador atual é o líder!
✅ [CustomGame] Lobby criado com sucesso
```

## 🔧 Correções Implementadas

### 1. **Estrutura de Dados Corrigida**
```typescript
// ANTES (incorreto)
const lobbyResponse = await this.lcuService.createLobby({
    queueId: 0,
    gameConfig: {
        gameMode: 'CLASSIC',
        mapId: 11,
        pickType: 'DRAFT_MODE',
        spectatorType: 'ALL',
        teamSize: 5  // ❌ Faltava banMode
    },
    // ...
});

// DEPOIS (corrigido)
const lobbyData = {
    queueId: 0,
    gameConfig: {
        gameMode: 'CLASSIC',
        mapId: 11,
        pickType: 'DRAFT_MODE',
        spectatorType: 'ALL',
        teamSize: 5,
        banMode: 'BAN_MODE_5_BANS'  // ✅ Adicionado
    },
    // ...
};
```

### 2. **Identificação do Líder Melhorada**
```typescript
// ANTES (simples)
if (currentRiotId === leader.riotId) {
    return true;
}

// DEPOIS (robusta)
const normalizeString = (str: string) => str.toLowerCase().trim().replace(/\s+/g, '');

// Múltiplas estratégias de comparação
const normalizedCurrent = normalizeString(currentRiotId);
const normalizedLeader = normalizeString(leader.riotId);

if (normalizedCurrent === normalizedLeader) {
    return true;
}
// + outras estratégias de fallback
```

### 3. **SummonerId Correto**
```typescript
// ANTES (incorreto)
participants.push({
    summonerId: player.summonerName, // ❌ String
    // ...
});

// DEPOIS (correto)
const currentSummoner = await this.lcuService.getCurrentSummoner();
const currentSummonerId = currentSummoner.summonerId;

participants.push({
    summonerId: currentSummonerId, // ✅ Número
    // ...
});
```

## 🚨 Checklist de Verificação

### Antes de Testar:
- [ ] League of Legends está aberto e logado
- [ ] Servidor backend está rodando
- [ ] Frontend está conectado ao backend
- [ ] Partida está em status 'accepted' ou 'draft'

### Durante o Teste:
- [ ] Verificar logs do servidor para erros
- [ ] Verificar se o LCU está conectado
- [ ] Verificar se o jogador atual é identificado como líder
- [ ] Verificar se o lobby é criado com sucesso

### Após o Teste:
- [ ] Verificar se a partida aparece no League of Legends
- [ ] Verificar se o jogador está na partida
- [ ] Verificar se outros jogadores podem entrar

## 📊 Logs Importantes para Monitorar

### Logs de Sucesso:
```
🎮 [CustomGame] Iniciando criação de partida customizada para match 123
👑 [CustomGame] Jogador atual é o líder!
🎮 [CustomGame] Criando partida customizada via LCU com ordem controlada...
✅ [CustomGame] Lobby criado: { lobbyId: "abc123", ... }
✅ [CustomGame] Lobby criado com sucesso
```

### Logs de Erro Comuns:
```
❌ [CustomGame] LCU não está conectado!
❌ [CustomGame] Erro ao criar partida customizada via LCU
❌ [CustomGame] Jogador atual não é o líder
```

## 🔄 Próximos Passos

1. **Execute os testes** para verificar se as correções funcionaram
2. **Monitore os logs** do servidor durante a criação da partida
3. **Verifique se o League of Legends** recebe a partida customizada
4. **Teste com outros jogadores** para verificar se conseguem entrar

## 📞 Suporte

Se os problemas persistirem após as correções:

1. Execute os scripts de teste e compartilhe os logs
2. Verifique se o League of Legends está na versão mais recente
3. Verifique se não há outros programas interferindo com o LCU
4. Considere reiniciar o League of Legends e o servidor

---

**Última atualização**: Correções implementadas em `CustomGameService.ts`
**Status**: ✅ Correções aplicadas, aguardando testes 