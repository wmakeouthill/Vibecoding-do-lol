# 🔄 Refatoração do Sistema de Nomenclatura de Bots

## 📋 Resumo das Mudanças

Este documento descreve a refatoração completa do sistema de nomenclatura de bots, mudando de nomes aleatórios com hashtag (`Bot123456#BOT`) para nomes sequenciais simples (`Bot1`, `Bot2`, `Bot3`, etc.).

## 🎯 Objetivos

- **Simplificar nomes**: Mudar de `Bot123456#BOT` para `Bot1`, `Bot2`, `Bot3`
- **Melhorar legibilidade**: Nomes mais curtos e fáceis de identificar
- **Manter compatibilidade**: Suportar tanto o novo padrão quanto o antigo
- **Centralizar lógica**: Unificar a detecção de bots em todo o sistema

## 🔧 Mudanças Implementadas

### Backend (MatchmakingService.ts)

#### 1. **Criação de Bots**

```typescript
// ANTES
const botNumber = Math.floor(Math.random() * 1000000) + 100000; // 6 dígitos
const botName = `Bot${botNumber}#BOT`;

// DEPOIS
const botNumber = this.getNextBotNumber();
const botName = `Bot${botNumber}`;
```

#### 2. **Contador Sequencial**

```typescript
// ✅ NOVO: Contador sequencial para bots
private botCounter = 0;

private getNextBotNumber(): number {
  this.botCounter++;
  return this.botCounter;
}

// ✅ NOVO: Resetar contador de bots
public resetBotCounter(): void {
  this.botCounter = 0;
  console.log('🔄 [Matchmaking] Contador de bots resetado para 0');
}

// ✅ NOVO: Obter contador atual de bots
public getBotCounter(): number {
  return this.botCounter;
}
```

#### 3. **Detecção de Bots Atualizada**

```typescript
private isPlayerBot(playerName: string): boolean {
  if (!playerName) return false;

  const nameCheck = playerName.toLowerCase();
  
  // ✅ ATUALIZADO: Padrões de identificação de bots
  const isBot = nameCheck.includes('bot') ||
    nameCheck.includes('ai') ||
    nameCheck.includes('computer') ||
    nameCheck.includes('cpu') ||
    playerName.includes('#BOT') || // Padrão antigo (compatibilidade)
    /^bot\d+$/i.test(playerName); // ✅ NOVO: Padrão sequencial (Bot1, Bot2, etc.)

  return isBot;
}
```

### Backend (MatchFoundService.ts)

#### Detecção de Bots Atualizada

```typescript
private isBot(playerName: string): boolean {
  if (!playerName) return false;
  
  const nameCheck = playerName.toLowerCase();
  return nameCheck.includes('bot') ||
    nameCheck.includes('ai') ||
    nameCheck.includes('computer') ||
    nameCheck.includes('cpu') ||
    playerName.includes('#BOT') || // Padrão antigo (compatibilidade)
    /^bot\d+$/i.test(playerName); // ✅ NOVO: Padrão sequencial (Bot1, Bot2, etc.)
}
```

### Frontend (BotService.ts)

#### Detecção de Bots Atualizadas

```typescript
isBot(player: any): boolean {
  if (!player) {
    console.log('🤖 [BotService] isBot: player é null/undefined');
    return false;
  }

  // Verificar se é um bot baseado no nome
  const playerName = player.name || player.summonerName || player.displayName || player.gameName || '';
  
  // ✅ ATUALIZADO: Padrões de identificação de bots
  const hasBot = playerName.toLowerCase().includes('bot');
  const hasAI = playerName.toLowerCase().includes('ai');
  const hasComputer = playerName.toLowerCase().includes('computer');
  const hasCPU = playerName.toLowerCase().includes('cpu');
  const hasBOTTag = playerName.includes('#BOT'); // Padrão antigo (compatibilidade)
  const hasSequentialBot = /^bot\d+$/i.test(playerName); // ✅ NOVO: Padrão sequencial (Bot1, Bot2, etc.)

  const isBotPlayer = hasBot || hasAI || hasComputer || hasCPU || hasBOTTag || hasSequentialBot;

  return isBotPlayer;
}
```

### Frontend (Componentes)

#### 1. **CustomPickBanComponent**

- Atualizada função `isBot()` para incluir novo padrão sequencial
- Mantida compatibilidade com padrões antigos

#### 2. **DraftConfirmationModalComponent**

- Atualizada função `isPlayerBot()` para incluir novo padrão sequencial
- Mantida compatibilidade com padrões antigos

#### 3. **DraftPickBanComponent**

- Usa BotService centralizado que já foi atualizado

### Novos Endpoints

#### 1. **Resetar Contador de Bots**

```typescript
// Backend
app.post('/api/queue/reset-bot-counter', async (req: Request, res: Response) => {
  try {
    console.log('🔄 [API] Resetando contador de bots...');
    matchmakingService.resetBotCounter();
    
    res.json({
      success: true,
      message: 'Contador de bots resetado com sucesso',
      currentCounter: matchmakingService.getBotCounter()
    });
  } catch (error: any) {
    console.error('❌ [API] Erro ao resetar contador de bots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Frontend
resetBotCounter(): Observable<any> {
  return this.http.post(`${this.baseUrl}/queue/reset-bot-counter`, {})
    .pipe(
      retry(1),
      catchError(this.handleError)
    );
}
```

#### 2. **Interface do Usuário**

- Adicionado botão "🔄 Resetar Contador de Bots" na seção de ferramentas de desenvolvimento
- Apenas visível para usuários especiais (`popcorn seller#coup`)

## 🔄 Compatibilidade

### Padrões Suportados

1. **Novo Padrão Sequencial**: `Bot1`, `Bot2`, `Bot3`, etc.
2. **Padrão Antigo**: `Bot123456#BOT` (mantido para compatibilidade)
3. **Outros Padrões**: `AI Bot`, `Computer`, `CPU`, etc.

### Migração

- **Bots existentes**: Continuam funcionando normalmente
- **Novos bots**: Usarão o padrão sequencial
- **Detecção**: Reconhece ambos os padrões automaticamente

## 🧪 Testes

### Como Testar

1. **Adicionar Bots**:

   ```bash
   # Via frontend
   Clicar em "🤖 Adicionar Bot à Fila"
   
   # Via API
   POST /api/queue/add-bot
   ```

2. **Resetar Contador**:

   ```bash
   # Via frontend
   Clicar em "🔄 Resetar Contador de Bots"
   
   # Via API
   POST /api/queue/reset-bot-counter
   ```

3. **Verificar Detecção**:
   - Bots devem aparecer como `Bot1`, `Bot2`, `Bot3`, etc.
   - Sistema deve reconhecer bots automaticamente
   - Ações de bot devem funcionar normalmente

### Logs Esperados

🤖 [Matchmaking] Bot Bot1 adicionado à fila local e tabela queue_players - Lane: mid, MMR: 1050, ID: -1
🤖 [BotService] === isBot check ===
  playerName: "Bot1"
  hasSequentialBot: true
  isBotPlayer: true

## 📊 Benefícios

- Nomes mais curtos e fáceis de ler
- Identificação rápida de bots na interface
- Melhor experiência do usuário

### 2. **Manutenibilidade**

- Lógica centralizada de detecção
- Código mais limpo e organizado
- Fácil de estender no futuro

### 3. **Compatibilidade**

- Suporte a padrões antigos
- Migração gradual sem quebrar funcionalidades
- Flexibilidade para diferentes cenários

### 4. **Debugging**

- Logs mais claros com nomes simples
- Fácil identificação de bots em logs
- Melhor rastreamento de problemas

## 🔮 Próximos Passos

1. **Monitoramento**: Acompanhar uso do novo sistema
2. **Otimização**: Ajustar padrões de detecção se necessário
3. **Documentação**: Atualizar documentação técnica
4. **Testes**: Expandir cobertura de testes

## ⚠️ Considerações

1. **Contador Persistente**: O contador é resetado quando o servidor reinicia
2. **IDs Negativos**: Bots continuam usando IDs negativos para identificação
3. **Especial User**: Apenas `popcorn seller#coup` pode executar ações de bot
4. **Compatibilidade**: Sistema suporta ambos os padrões simultaneamente

## 📝 Conclusão

A refatoração do sistema de nomenclatura de bots foi implementada com sucesso, proporcionando:

- ✅ Nomes mais simples e legíveis
- ✅ Detecção unificada e robusta
- ✅ Compatibilidade total com sistema existente
- ✅ Melhor experiência do usuário
- ✅ Código mais limpo e manutenível

O sistema agora usa nomes sequenciais simples (`Bot1`, `Bot2`, `Bot3`) mantendo total compatibilidade com o padrão anterior (`Bot123456#BOT`).
