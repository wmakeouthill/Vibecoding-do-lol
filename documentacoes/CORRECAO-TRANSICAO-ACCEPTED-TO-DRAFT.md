# Correção: Transição de Status "accepted" para "draft"

## 🚨 Problema Identificado

A partida não estava mudando de status `accepted` para `draft` após todos os jogadores aceitarem no match-found, ficando presa na tela de match-found.

## 🔍 Causa Raiz

Durante a simplificação do `DraftService`, o método `monitorAcceptedMatches` foi removido, mas não foi substituído por nenhum mecanismo que monitorasse partidas com status 'accepted' e as transicionasse para 'draft'.

### Fluxo Antes da Correção

1. Jogadores aceitam → status = 'accepted'
2. ❌ FALHA: Nenhum serviço monitorava partidas 'accepted'
3. Partida ficava presa em 'accepted'
4. Frontend continuava mostrando match-found

## ✅ Correção Implementada

### 1. **Adicionado Monitoramento de Partidas Aceitas**

**Arquivo:** `src/backend/services/DraftService.ts`

```typescript
// ✅ NOVO: Monitoramento de partidas aceitas para iniciar draft
private startAcceptedMatchesMonitoring(): void {
  console.log('🔍 [DraftPickBan] Iniciando monitoramento de partidas aceitas');

  // Verificar partidas aceitas a cada 3 segundos
  setInterval(async () => {
    try {
      const acceptedMatches = await this.dbManager.getCustomMatchesByStatus('accepted');
      
      for (const match of acceptedMatches) {
        // Verificar se todos os jogadores aceitaram
        const allPlayers = await this.getAllPlayersFromMatch(match);
        const acceptedPlayers = await this.getAcceptedPlayers(allPlayers);
        
        if (acceptedPlayers.length === 10) {
          console.log(`🎉 [DraftPickBan] Todos os 10 jogadores aceitaram partida ${match.id}, iniciando draft`);
          await this.startDraft(match.id);
        }
      }
    } catch (error) {
      console.error('❌ [DraftPickBan] Erro no monitoramento de partidas aceitas:', error);
    }
  }, 3000); // 3 segundos
}
```

### 2. **Métodos Auxiliares Adicionados**

```typescript
// ✅ NOVO: Obter todos os jogadores de uma partida
private async getAllPlayersFromMatch(match: any): Promise<string[]> {
  try {
    const team1 = typeof match.team1_players === 'string'
      ? JSON.parse(match.team1_players)
      : (match.team1_players || []);
    const team2 = typeof match.team2_players === 'string'
      ? JSON.parse(match.team2_players)
      : (match.team2_players || []);

    return [...team1, ...team2];
  } catch (error) {
    console.error(`❌ [DraftPickBan] Erro ao parsear jogadores da partida ${match.id}:`, error);
    return [];
  }
}

// ✅ NOVO: Obter jogadores que aceitaram
private async getAcceptedPlayers(playerNames: string[]): Promise<string[]> {
  try {
    const queuePlayers = await this.dbManager.getActiveQueuePlayers();
    const matchPlayers = queuePlayers.filter(p => playerNames.includes(p.summoner_name));
    
    return matchPlayers
      .filter(p => p.acceptance_status === 1)
      .map(p => p.summoner_name);
  } catch (error) {
    console.error('❌ [DraftPickBan] Erro ao obter jogadores aceitos:', error);
    return [];
  }
}
```

### 3. **Inicialização Atualizada**

```typescript
async initialize(): Promise<void> {
  console.log('🎯 [DraftPickBan] Inicializando DraftService...');
  
  // Iniciar monitoramento básico
  this.startBasicMonitoring();
  
  // ✅ NOVO: Iniciar monitoramento de partidas aceitas
  this.startAcceptedMatchesMonitoring();
  
  console.log('✅ [DraftPickBan] DraftService inicializado com sucesso');
}
```

## 🔄 Fluxo Corrigido

### Fluxo Após a Correção

1. Jogadores aceitam → status = 'accepted'
2. ✅ DraftService monitora partidas 'accepted' a cada 3s
3. Quando 10 jogadores aceitam → chama startDraft()
4. startDraft() atualiza status para 'draft'
5. Frontend recebe notificação 'draft_started'
6. Tela muda de match-found para draft

## 📋 Verificações Implementadas

### 1. **Proteção contra Duplicação**

- Verifica se partida já está em draft (`activeDrafts.has(match.id)`)
- Evita processamento duplicado

### 2. **Validação de Jogadores**

- Confirma que todos os 10 jogadores aceitaram
- Verifica `acceptance_status === 1` no banco

### 3. **Logs Detalhados**

- Rastreamento completo do processo
- Identificação de problemas

## 🎯 Resultado Esperado

- ✅ Partidas com status 'accepted' são automaticamente transicionadas para 'draft'
- ✅ Frontend recebe notificação e muda para tela de draft
- ✅ Sincronização correta entre backend e frontend
- ✅ Eliminação do problema de "partida presa no match-found"

## 🔧 Teste da Correção

Para testar a correção:

1. **Criar uma partida** com 10 jogadores
2. **Aceitar a partida** por todos os jogadores
3. **Verificar logs** do DraftService:

   🔍 [DraftPickBan] Verificando partida aceita X para iniciar draft
   🎉 [DraftPickBan] Todos os 10 jogadores aceitaram partida X, iniciando draft
   ✅ [DraftPickBan] Draft X iniciado com sucesso
  
4. **Verificar no banco** se status mudou de 'accepted' para 'draft'
5. **Verificar no frontend** se tela mudou para draft

## 📝 Observações

- **Intervalo de monitoramento:** 3 segundos (otimizado para resposta rápida)
- **Proteção contra race conditions:** Verificação de `activeDrafts`
- **Logs detalhados:** Para facilitar debugging
- **Compatibilidade:** Mantém estrutura existente do DraftService
