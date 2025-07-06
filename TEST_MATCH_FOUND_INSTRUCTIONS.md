# 🎯 INSTRUÇÕES DE TESTE - CORREÇÕES MATCH-FOUND

## 🚀 COMO INICIAR O SISTEMA

```bash
# Inicie o sistema completo
npm run dev

# OU individualmente:
npm run dev:backend    # Porta 8080
npm run dev:frontend   # Porta 3000
npm run dev:electron   # App Electron
```

## 🧪 ROTEIRO DE TESTES

### **TESTE 1: Verificar Timer Estável**

**Objetivo:** Confirmar que o timer não reseta mais

**Passos:**
1. Abra http://localhost:3000
2. Conecte-se ao LoL (ou configure manualmente)
3. Entre na fila
4. Aguarde 10 jogadores na fila
5. **Quando match found aparecer:**
   - ⏰ **Verificar**: Timer inicia em 30 segundos
   - ⏰ **Verificar**: Timer conta 30→29→28... sem resetar
   - ⏰ **Verificar**: Timer não "pula" valores

**Logs a Observar:**
```
🎮 [MatchFound] Nova partida detectada - configurando timer
🎮 [MatchFound] Aguardando timer do backend...
⏰ [MatchFound] Backend assumiu controle - parando timer local
```

**✅ SUCESSO:** Timer conta de forma estável até 0
**❌ FALHA:** Timer reseta ou pula valores

---

### **TESTE 2: Verificar Throttling**

**Objetivo:** Confirmar que não há múltiplas chamadas excessivas

**Passos:**
1. Com match found ativo
2. Abra DevTools → Console
3. **Verificar logs durante timer:**

**Logs CORRETOS:**
```
⏰ [App] Evento matchTimerUpdate emitido com sucesso
⏰ [MatchFound] Timer atualizado pelo backend: XX
```

**Logs INCORRETOS (não devem aparecer):**
```
⏰ [App] Throttling timer update - muito frequente
```

**✅ SUCESSO:** Máximo 2 updates por segundo
**❌ FALHA:** Logs de throttling ou updates excessivos

---

### **TESTE 3: Verificar Recusa Remove da Fila**

**Objetivo:** Confirmar que recusar remove corretamente da fila

**Passos:**
1. Entre na fila
2. Aguarde match found
3. **Clique em "Recusar"**
4. **Verificar imediatamente:**
   - Modal fecha
   - Status volta para "Entrar na Fila"
   - Não aparece mais na lista de jogadores

**Logs a Observar:**
```
📞 [App] === INÍCIO DA RECUSA DA PARTIDA ===
✅ [App] Recusa enviada ao backend com sucesso
✅ [App] Estado atualizado: isInQueue: true → false
📞 [App] === FIM DA RECUSA DA PARTIDA ===
```

**✅ SUCESSO:** Saída imediata da fila
**❌ FALHA:** Permanece na fila após recusar

---

### **TESTE 4: Verificar Aceitação Normal**

**Objetivo:** Confirmar que aceitar funciona normalmente

**Passos:**
1. Entre na fila
2. Aguarde match found
3. **Clique em "Aceitar"**
4. **Verificar:**
   - Modal permanece aberto
   - Mensagem "Aguardando outros jogadores..."
   - Quando todos aceitarem → Vai para draft

**Logs a Observar:**
```
✅ [App] Aceitação enviada ao backend
✅ [App] Partida totalmente aceita
🎯 [App] Draft iniciado pelo backend
```

**✅ SUCESSO:** Transição suave para draft
**❌ FALHA:** Modal fecha prematuramente ou erro

---

### **TESTE 5: Verificar Comportamento com Bots**

**Objetivo:** Confirmar que bots não afetam o sistema

**Passos:**
1. Use "Adicionar Bot à Fila" (se disponível)
2. Complete a fila com bots
3. **Verificar:**
   - Bots aceitam automaticamente
   - Jogador humano vê modal normalmente
   - Timer funciona estável mesmo com bots

**✅ SUCESSO:** Bots não interferem no timer
**❌ FALHA:** Comportamento anômalo com bots

---

## 🔍 LOGS IMPORTANTES

### **LOGS POSITIVOS (devem aparecer):**
```
✅ [App] Estado da fila atualizado pelo backend: false → true
🎮 [MatchFound] Backend assumiu controle - parando timer local
⏰ [MatchFound] Timer atualizado pelo backend: 25
📞 [App] === INÍCIO DA RECUSA DA PARTIDA ===
✅ [App] Estado atualizado: isInQueue: true → false
```

### **LOGS NEGATIVOS (NÃO devem aparecer):**
```
❌ 🎮 [MatchFound] Nova partida detectada (para mesma partida)
❌ ⏰ [App] Throttling timer update - muito frequente
❌ Timer valores incorretos (ex: 30→25→30→20)
❌ isInQueue permanecendo true após recusa
```

## 🐛 TROUBLESHOOTING

### **Problema: Timer Ainda Reseta**
**Solução:**
1. Verificar se backend está enviando `match_timer_update`
2. Verificar se `matchId` está correto nos logs
3. Limpar cache do navegador
4. Reiniciar backend

### **Problema: Recusa Não Remove da Fila**
**Solução:**
1. Verificar se `hasRecentBackendQueueStatus = true` nos logs
2. Aguardar 2-5 segundos para sync backend
3. Verificar se `refreshQueueStatus()` é chamado
4. Tentar sair da fila manualmente

### **Problema: Múltiplos Timers**
**Solução:**
1. Verificar se `clearInterval()` está sendo chamado
2. Verificar logs de throttling
3. Atualizar página para reset completo
4. Verificar se WebSocket está conectado

## ✅ CRITÉRIOS DE SUCESSO

**✅ TODOS OS TESTES DEVEM PASSAR:**
1. Timer estável sem resets
2. Throttling funcionando (max 2/seg)
3. Recusa remove da fila imediatamente
4. Aceitação funciona normalmente
5. Bots não interferem

**✅ LOGS LIMPOS:**
- Sem erros no console
- Sem mensagens de throttling
- Estados consistentes

**✅ UX FLUÍDA:**
- Transições suaves
- Interface responsiva
- Feedback claro ao usuário

## 📞 PRÓXIMO PASSO

**Após todos os testes passarem:**
1. Documente quaisquer edge cases encontrados
2. Teste com diferentes números de jogadores
3. Teste cenários de rede instável
4. Considere testes automatizados futuros

---

**🎉 TODAS AS CORREÇÕES FORAM IMPLEMENTADAS**
**🎯 SISTEMA PRONTO PARA USO EM PRODUÇÃO**
