# 🔧 Solução para Problemas de Conexão

## ❌ Problema: `ERR_CONNECTION_REFUSED` ou Backend Não Inicia

Se você está enfrentando o erro `net::ERR_CONNECTION_REFUSED` ou o backend não inicia em algumas máquinas, siga este guia:

## 🚀 Solução Rápida (Recomendada)

**1. Execute o corretor automático:**
```bash
# No Windows - clique duas vezes no arquivo:
fix-connection-issues.bat

# OU execute via terminal:
npm run diagnose
```

## 🔍 Diagnóstico Manual

### Pré-requisitos Obrigatórios

#### 1. **Node.js DEVE estar instalado**
- **Download:** https://nodejs.org/
- **Versão:** LTS (18.x ou superior)
- **Verificar:** Execute `node --version` no terminal

> ⚠️ **IMPORTANTE:** O executável Electron precisa do Node.js instalado na máquina para rodar o backend!

#### 2. **Porta 3000 deve estar livre**
```bash
# Verificar se algo está usando a porta:
netstat -ano | findstr :3000

# Se houver processo, finalize:
taskkill /F /PID [número_do_pid]
```

#### 3. **Firewall/Antivírus configurado**
- Adicionar exceção para `node.exe`
- Permitir comunicação local na porta 3000
- Temporariamente desabilitar para teste

## 🛠️ Soluções por Problema

### Node.js não encontrado
```bash
# Sintomas: Backend não inicia, erro de "command not found"
# Solução:
1. Baixe Node.js LTS de https://nodejs.org/
2. Execute o instalador
3. Reinicie o terminal/aplicação
4. Teste: node --version
```

### Porta 3000 ocupada
```bash
# Sintomas: "EADDRINUSE" ou "Port already in use"
# Solução:
1. Finalize processos Node.js antigos:
   taskkill /F /IM node.exe
2. Ou reinicie o computador
3. Verifique: netstat -ano | findstr :3000
```

### Firewall bloqueando
```bash
# Sintomas: Backend inicia mas frontend não conecta
# Solução:
1. Abra Windows Firewall
2. Adicione exceção para Node.js
3. Ou execute como Administrador
```

### Dependências faltando
```bash
# Sintomas: "Cannot find module" ou crashes
# Solução:
npm run build:complete
```

## 🔄 Procedimento Completo de Recuperação

1. **Verificar Node.js:**
   ```bash
   node --version
   npm --version
   ```

2. **Rebuild completo:**
   ```bash
   npm run clean
   npm run build:complete
   ```

3. **Teste isolado do backend:**
   ```bash
   cd dist/backend
   node server.js
   ```

4. **Se backend funcionar, teste o Electron:**
   ```bash
   npm run electron:prod
   ```

## 📊 Scripts de Diagnóstico

### Diagnóstico completo:
```bash
npm run diagnose
```

### Teste de conectividade:
```bash
npm run test:connectivity
```

### Corretor automático (Windows):
```bash
fix-connection-issues.bat
```

## 🚨 Problemas Comuns por SO

### Windows
- **Node.js não no PATH:** Reinstalar Node.js marcando "Add to PATH"
- **Permissões:** Executar como Administrador
- **Antivírus:** Adicionar exceção ou desabilitar temporariamente
- **PowerShell:** Executar `Set-ExecutionPolicy RemoteSigned`

### Outros Sistemas
- **Linux/Mac:** Backend geralmente funciona melhor
- **WSL:** Pode causar problemas de rede - use Windows nativo

## 📄 Arquivos de Log

Se o problema persistir, verifique estes arquivos:
- `error-report.txt` - Relatório de erro detalhado
- `test-connectivity.bat` - Script de teste gerado
- Console do Electron (F12) - Erros do frontend

## 🆘 Suporte

Se nenhuma solução funcionar:

1. **Execute:**
   ```bash
   npm run diagnose > diagnostico.txt
   ```

2. **Colete os arquivos:**
   - `diagnostico.txt`
   - `error-report.txt` (se existir)
   - Screenshot do erro

3. **Envie para suporte com:**
   - Sistema operacional
   - Versão do Node.js
   - Antivírus usado
   - Se executa como administrador

## ✅ Checklist de Verificação

- [ ] Node.js LTS instalado
- [ ] Porta 3000 livre
- [ ] Firewall configurado
- [ ] Executando como administrador
- [ ] Antivírus não bloqueando
- [ ] Build completo executado
- [ ] Arquivos em `dist/` existem

---

**💡 Dica:** Na maioria dos casos, instalar o Node.js resolve o problema!
