# Guia de Teste P2P - LoL Matchmaking

## 🔧 Configuração para Teste

### Pré-requisitos
- Node.js instalado
- Angular CLI instalado globalmente: `npm install -g @angular/cli`
- TypeScript instalado globalmente: `npm install -g typescript`

### Instalação de Dependências
```bash
npm install
cd src/frontend && npm install
```

## 🚀 Como Testar o Sistema P2P

### Opção 1: Comando Automatizado (Recomendado)
```bash
npm run test:p2p
```
Este comando irá:
1. Iniciar o servidor Angular
2. Abrir 3 instâncias do Electron automaticamente
3. Cada instância simulará um peer diferente

### Opção 2: Manual
1. **Terminal 1 - Iniciar Angular:**
   ```bash
   cd src/frontend
   ng serve
   ```

2. **Terminal 2, 3, 4 - Abrir múltiplas instâncias:**
   ```bash
   # Em cada terminal separado
   npm run dev:electron
   ```

## 🧪 Testando a Funcionalidade P2P

### 1. Verificar Inicialização
- Abra cada instância do aplicativo
- Vá para a seção P2P
- Clique em "Conectar à Rede P2P" em cada instância
- Aguarde alguns segundos para a descoberta de peers

### 2. Verificar Conexões
- **Status esperado:** "Aguardando peers" → "Conectado"
- **Peers conectados:** Deve mostrar as outras instâncias
- **Peer ID:** Cada instância deve ter um ID único

### 3. Testar Fila P2P
1. Em pelo menos 2 instâncias conectadas:
   - Clique em "Entrar na Fila P2P"
   - Verifique se o status muda para "Na fila (P2P)"
2. Observe as estatísticas da fila se atualizando
3. Com 10 jogadores, deveria propor uma partida

### 4. Indicadores de Sucesso
✅ **P2P Funcionando:**
- Status: "Conectado"
- Peers conectados: > 0
- IDs únicos para cada instância
- Estatísticas da fila sendo compartilhadas

❌ **Problemas Comuns:**
- Status permanece em "Aguardando peers"
- Peers conectados: 0
- Erro no console sobre WebRTC

## 🐛 Debugging

### Logs Importantes
Abra o DevTools (F12) em cada instância e observe:
```
🔗 P2P inicializado via componente
🔍 Peer local descoberto: [ID]
✅ Conectado ao peer: [ID]
```

### LocalStorage Debug
No DevTools → Application → LocalStorage:
- Chave: `p2p_local_peers`
- Deve conter os peers ativos

### Problemas e Soluções

1. **"Aguardando peers" permanente:**
   - Verifique se múltiplas instâncias estão rodando
   - Limpe o localStorage e reinicie

2. **Erro WebRTC:**
   - Verifique as configurações do Electron main.ts
   - Certifique-se que webSecurity está false em dev

3. **Peers não se conectam:**
   - Aguarde até 10 segundos para descoberta
   - Verifique se o localStorage está sendo compartilhado

## 🔄 Reiniciar Teste
Para limpar e começar novamente:
1. Feche todas as instâncias
2. Limpe o localStorage:
   ```javascript
   localStorage.removeItem('p2p_local_peers');
   ```
3. Reinicie o teste

## 📊 Métricas Esperadas
- **Tempo de descoberta:** 1-5 segundos
- **Conexão entre peers:** 2-10 segundos
- **Sincronização da fila:** Imediata após conexão
- **Memória por instância:** ~50-100MB

## 🎯 Próximos Passos
Após validar o P2P local:
1. Implementar signaling server real
2. Testar em rede local (LAN)
3. Testar com peers remotos
4. Implementar NAT traversal com STUN/TURN

## 🆘 Suporte
Se encontrar problemas:
1. Verifique os logs no console
2. Confirme que todas as dependências estão instaladas
3. Tente reiniciar o processo de teste
4. Verifique se não há firewall bloqueando
