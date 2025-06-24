# 🎮 GUIA COMPLETO: DISCORD INTEGRATION SETUP

## 🚀 **O QUE É:**
Sistema revolucionário que usa Discord para matchmaking automático:
- **Detecta** quem está no canal com app aberto
- **Cria fila automática** entre essas pessoas  
- **Move automaticamente** para canais Blue/Red após match
- **Zero configuração** do usuário!

---

## 📋 **SETUP COMPLETO (30 minutos):**

### **1. Criar Bot Discord:**

1. **Acesse:** https://discord.com/developers/applications
2. **Clique:** "New Application" → Nome: "LoL Matchmaking Bot"
3. **Vá para:** "Bot" → "Add Bot"
4. **Copie o Token** (mantenha secreto!)
5. **Ative:** "Message Content Intent" e "Server Members Intent"

### **2. Convitar Bot para Servidor:**

1. **Vá para:** "OAuth2" → "URL Generator"
2. **Selecione:** `bot` e `applications.commands`
3. **Permissões:** 
   - Manage Channels
   - Move Members  
   - Send Messages
   - Use Slash Commands
4. **Copie a URL** e abra no navegador
5. **Convide** para seu servidor Discord

### **3. Configurar Servidor Discord:**

1. **Crie canal de voz:** `#lol-matchmaking`
2. **Certifique-se** que o bot tem permissões no canal
3. **Configure** permissões para usuários entrarem

### **4. Instalar Dependências:**

```bash
# Na pasta do projeto
npm install discord.js@14.14.1 ws@8.16.0

# Para desenvolvimento
npm install --save-dev nodemon@3.0.2
```

### **5. Configurar Bot:**

```bash
# Editar discord-bot.js linha final:
# bot.start('SEU_TOKEN_AQUI'); 
```

### **6. Iniciar Bot:**

```bash
node discord-bot.js
```

**Resultado esperado:**
```
🤖 Bot LoL Matchmaking Bot#1234 está online!
✅ Comandos slash registrados
🤖 LoL Matchmaking Bot totalmente inicializado!
```

---

## 🎯 **COMO FUNCIONA:**

### **Para Usuários (Zero Config):**
1. Entrar no canal `#lol-matchmaking`
2. Abrir o aplicativo LoL Matchmaking
3. Clicar "Entrar na Fila Discord"
4. Aguardar match automático!

### **Sistema Automático:**
1. Bot detecta quem tem app aberto (Rich Presence)
2. Monitora quem está no canal de voz
3. Cria fila automática entre essas pessoas
4. Forma teams balanceados (5v5)
5. Cria canais Blue/Red automaticamente
6. Move players para canais corretos
7. Deleta canais após 2 horas

---

## 🛠️ **CONFIGURAÇÕES AVANÇADAS:**

### **Rich Presence (App):**
```bash
# Instalar no frontend:
npm install discord-rpc

# Configurar Client ID no discord-integration.service.ts
const clientId = 'SEU_APPLICATION_ID_AQUI';
```

### **Comandos Slash:**
- `/queue` - Ver fila atual
- `/clear_queue` - Limpar fila (moderadores)

### **Personalização:**
- **Nome dos canais:** Editar `discord-bot.js` linha 150+
- **Tempo de limpeza:** Editar timeout linha 200+
- **Regras da fila:** Editar `tryCreateMatch()` método

---

## 🎮 **FLUXO COMPLETO:**

```
1. 👤 Player entra no #lol-matchmaking
2. 📱 Abre app LoL Matchmaking
3. 🎯 App detecta canal automaticamente
4. ⚡ Mostra opção "Fila Discord"
5. 🎮 Player clica "Entrar na Fila Discord"
6. 🤖 Bot adiciona à fila automática
7. ⏳ Aguarda 10 players (2 de cada role)
8. ✅ Match encontrado!
9. 🔵 Bot cria canal Blue Team
10. 🔴 Bot cria canal Red Team
11. 📢 Move 5 players para cada canal
12. 🎮 Match começar!
```

---

## 🔧 **TROUBLESHOOTING:**

### **Bot não conecta:**
- Verificar token correto
- Verificar intents ativadas
- Verificar permissões no servidor

### **Players não são detectados:**
- Verificar Rich Presence funcionando
- Verificar WebSocket conectado (porta 8081)
- Verificar usuário no canal correto

### **Não consegue mover players:**
- Verificar permissão "Move Members"
- Verificar bot tem acesso aos canais
- Verificar hierarchy do bot

---

## 🚀 **PRÓXIMOS PASSOS:**

1. **Testar** com 2 usuários diferentes
2. **Validar** criação automática de canais
3. **Implementar** sistema de resultado de partidas
4. **Adicionar** estatísticas de matchmaking
5. **Deploy** bot em servidor 24/7

**Resultado: Sistema plug-and-play perfeito! 🎮**
