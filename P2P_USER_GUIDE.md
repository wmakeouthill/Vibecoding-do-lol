# Como Usar o Sistema P2P - Guia do Usuário

## 🎯 O que é o Sistema P2P?

O sistema **Peer-to-Peer (P2P)** permite que jogadores se conectem diretamente uns aos outros, criando uma rede descentralizada para matchmaking. Isso significa que vocês não dependem de um servidor central - os próprios jogadores formam a rede!

## 🚀 Como Começar

### 1. Ativar a Rede P2P

1. Abra o aplicativo LoL Matchmaking
2. Vá para a aba **🔗 Rede P2P**
3. Clique em **"Conectar à Rede P2P"**
4. Aguarde a descoberta automática de outros jogadores

### 2. Entrar na Fila Distribuída

1. Com a rede P2P ativa, clique em **"Entrar na Fila P2P"**
2. O sistema irá:
   - Notificar outros jogadores conectados sobre sua entrada
   - Sincronizar sua posição na fila
   - Começar a buscar por partidas automaticamente

### 3. Encontrar uma Partida

- Quando 10 jogadores estiverem na fila, o sistema automaticamente:
  - Balanceia as equipes por MMR
  - Propõe a partida para todos os jogadores
  - Aguarda aprovação da maioria
  - Cria o lobby no League of Legends

## 📊 Interface da Rede P2P

### Status da Conexão
- **🟢 Conectado**: Rede P2P ativa com peers conectados
- **🔴 Desconectado**: Sem conexões P2P ativas

### Informações Exibidas
- **Peer ID**: Seu identificador único na rede
- **Peers Conectados**: Número de jogadores conectados diretamente
- **Status da Fila**: Se você está na fila ou não
- **Posição na Fila**: Sua posição atual (#1, #2, etc.)
- **Tempo de Espera**: Quanto tempo você está aguardando

### Estatísticas da Rede
- **Total Jogadores**: Todos os jogadores na fila distribuída
- **MMR Médio**: MMR médio de todos na fila
- **Tempo Médio**: Tempo médio de espera
- **Distribuição por Lane**: Quantos jogadores por posição

## 🔧 Como Funciona Tecnicamente

### Descoberta de Peers
1. **Descoberta Local**: Encontra jogadores na sua rede local (mesma casa/escritório)
2. **Descoberta via Internet**: Conecta com jogadores pela internet usando servidor de sinalização

### Conexão WebRTC
- Usa **WebRTC** para conexões diretas peer-to-peer
- **Data Channels** para troca de mensagens de jogo
- **NAT Traversal** usando servidores STUN/TURN

### Fila Distribuída
- Cada jogador mantém uma cópia da fila
- **Sincronização** automática entre todos os peers
- **Algoritmo de consenso** para decisões de matchmaking
- **Eleição de líder** para coordenar criação de partidas

## 🎮 Fluxo Completo de uma Partida

```
1. Jogadores abrem o app → Conectam à rede P2P
2. Entram na fila distribuída → Sincronização automática
3. Sistema balanceia equipes → Proposta enviada para todos
4. Jogadores aprovam/rejeitam → Consenso necessário
5. Partida aprovada → Lobby criado automaticamente no LoL
6. Jogadores entram no lobby → Partida inicia
7. Pós-jogo → MMR atualizado e sincronizado
```

## ⚡ Vantagens do Sistema P2P

### 🏆 Para os Jogadores
- **Latência Reduzida**: Conexões diretas entre jogadores
- **Sem Dependência de Servidor**: Funciona mesmo se servidores centrais caírem
- **Matchmaking Personalizado**: Algoritmos ajustáveis pela comunidade
- **Transparência**: Todos podem ver como o matchmaking funciona

### 🌐 Para a Rede
- **Escalabilidade**: Quanto mais jogadores, mais robusta fica a rede
- **Resistência a Falhas**: Se alguns peers saem, outros continuam funcionando
- **Distribuição de Carga**: Processamento distribuído entre todos os peers
- **Sem Custos de Servidor**: Não precisa manter servidores caros

## 🛠️ Solução de Problemas

### "Não Consigo Conectar à Rede P2P"
1. Verifique sua conexão com a internet
2. Tente desativar temporariamente firewall/antivírus
3. Certifique-se que as portas WebRTC não estão bloqueadas
4. Reinicie o aplicativo

### "Não Encontro Outros Jogadores"
1. Aguarde alguns minutos para descoberta automática
2. Certifique-se que outros jogadores também estão com P2P ativo
3. Tente em horários de pico (noite/fim de semana)
4. Verifique se está na mesma região

### "Fila P2P Não Funciona"
1. Confirme que está conectado a pelo menos 1 peer
2. Verifique se pelo menos 10 jogadores estão na rede
3. Aguarde o tempo de sincronização (30-60 segundos)
4. Saia e entre na fila novamente

### "Partidas Não São Criadas"
1. Certifique-se que o League of Legends está aberto
2. Verifique se o LCU está conectado (🎮 LoL Cliente)
3. Confirme que você tem permissões para criar lobbies customizados
4. Reinicie o League of Legends se necessário

## 📋 Requisitos do Sistema

### Mínimos
- **Conexão com Internet**: Estável com pelo menos 1 Mbps
- **League of Legends**: Instalado e atualizado
- **Firewall**: Configurado para permitir conexões WebRTC
- **Navegador/Electron**: Suporte a WebRTC (Chrome/Edge/Firefox)

### Recomendados
- **Conexão**: 5+ Mbps para melhor experiência
- **NAT**: Tipo 1 ou 2 (evitar NAT tipo 3/strict)
- **Latência**: <100ms para outros jogadores da região
- **Hardware**: CPU dual-core, 4GB RAM

## 🔐 Segurança e Privacidade

### Dados Compartilhados
- **Nome do Invocador**: Visível para outros jogadores
- **MMR**: Usado para balanceamento de equipes
- **Preferências de Lane**: Para formar equipes balanceadas
- **Status de Conexão**: Para manter rede estável

### Dados NÃO Compartilhados
- **IP Privado**: Apenas conexões WebRTC são estabelecidas
- **Dados Pessoais**: Nenhuma informação pessoal é transmitida
- **Histórico**: Apenas dados necessários para matchmaking
- **Chat**: Nenhuma conversa é armazenada ou transmitida

### Medidas de Segurança
- **Criptografia**: Todas as conexões P2P são criptografadas
- **Validação**: Dados são validados antes de serem aceitos
- **Rate Limiting**: Prevenção contra spam de mensagens
- **Blacklist**: Peers maliciosos podem ser bloqueados

## 🤝 Comunidade P2P

### Participação
- Quanto mais jogadores usarem P2P, melhor será para todos
- Compartilhe com seus amigos para expandir a rede
- Reporte bugs e sugestões para melhorar o sistema

### Código Aberto
- Todo o código P2P é open source
- Comunidade pode propor melhorias
- Transparência total no funcionamento

---

## 📞 Suporte

Se tiver problemas ou dúvidas:
1. Consulte este guia primeiro
2. Verifique os logs do aplicativo
3. Reporte issues no GitHub
4. Entre em contato com a comunidade

**Divirta-se jogando com matchmaking P2P! 🎮**
