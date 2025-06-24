# ☁️ DEPLOY AUTOMÁTICO - SERVIDOR P2P GRATUITO

## 🚀 **OPÇÃO 1: RAILWAY (Mais Fácil)**

### 1. Criar conta no Railway:
- Acesse: https://railway.app
- Login com GitHub
- **100% GRATUITO** (sem cartão)

### 2. Deploy em 2 cliques:
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy (na pasta do projeto)
railway up
```

### 3. Copiar URL:
Após deploy, Railway fornece uma URL tipo:
`https://seu-app-production.up.railway.app`

---

## 🌐 **OPÇÃO 2: RENDER (Alternativa)**

### 1. Criar conta: https://render.com
### 2. Conectar GitHub repository
### 3. Deploy automático!

---

## 🎯 **OPÇÃO 3: FLY.IO (Mais Avançada)**

```bash
# Instalar Fly CLI
# Deploy gratuito até 3 apps
fly launch
```

---

## ⚡ **ATUALIZAR APLICATIVO (CRUCIAL)**

Após o deploy, copie a URL e atualize o código:

```typescript
// src/frontend/src/app/services/p2p-manager.ts
private getSignalingServerUrl(): string {
  // URL DO SEU SERVIDOR NA NUVEM
  return 'https://seu-app-production.up.railway.app';
}
```

---

## 🔥 **RESULTADO FINAL:**

✅ **Usuários baixam o app**
✅ **Abrem e jogam instantaneamente**  
✅ **Zero configuração**
✅ **Funciona em qualquer rede**
✅ **Servidor 24/7 grátis**

**🎮 PLUG-AND-PLAY TOTAL!**

---

## 📊 **URLS GRATUITAS DISPONÍVEIS:**

- **Railway**: `https://[app-name].up.railway.app` 
- **Render**: `https://[app-name].onrender.com`
- **Fly.io**: `https://[app-name].fly.dev`
- **Vercel**: `https://[app-name].vercel.app` (só para frontend)

**Escolha qualquer uma e seu app funcionará globalmente! 🌍**
