# 🚀 Guia de Distribuição Standalone

Este guia explica como criar uma versão standalone do LoL Matchmaking que **NÃO requer Node.js instalado** no computador do usuário.

## 📋 Pré-requisitos

- Node.js 18+ instalado no seu computador de desenvolvimento
- Windows 10/11 para build Windows
- Electron Builder configurado

## 🎯 Opções de Distribuição

### 1. **Instalador Windows (.exe)**

- Instala o aplicativo no sistema
- Cria atalhos no desktop e menu iniciar
- Requer permissões de administrador
- Tamanho: ~150-200MB

### 2. **Versão Portable (.exe)**

- Executável único que pode ser copiado para qualquer lugar
- Não requer instalação
- Ideal para pendrives ou uso temporário
- Tamanho: ~150-200MB

## 🔧 Comandos de Build

### Build Completo (Recomendado)

```bash
npm run build:complete-standalone
```

Gera tanto o instalador quanto a versão portable.

### Build Individual

```bash
# Apenas instalador
npm run build:installer

# Apenas versão portable
npm run build:portable

# Build otimizado com script personalizado
npm run build:standalone
```

## 📁 Arquivos Gerados

Após o build, você encontrará na pasta `release/`:

```
release/
├── LoL Matchmaking Setup 1.0.0.exe    # Instalador Windows
├── LoL Matchmaking Portable 1.0.0.exe # Versão portable
└── win-unpacked/                      # Arquivos desempacotados (para debug)
    ├── LoL Matchmaking.exe
    ├── resources/
    │   ├── backend/                   # Backend Node.js empacotado
    │   ├── frontend/                  # Frontend Angular empacotado
    │   └── .env                       # Configurações
    └── ...
```

## 🎮 Como Funciona

### Node.js Embedded

- O Node.js é **empacotado dentro do executável**
- Todas as dependências do backend são incluídas
- O usuário não precisa instalar Node.js

### Backend Integrado

- O servidor Express roda localmente
- Banco SQLite incluído
- Todas as funcionalidades funcionam offline

### Frontend Otimizado

- Angular build de produção
- Assets otimizados e minificados
- Interface responsiva

## 🔍 Verificação do Build

Após o build, verifique se todos os arquivos estão presentes:

```bash
npm run verify:build
```

### Checklist de Verificação

- [ ] `dist/backend/server.js` - Servidor backend compilado
- [ ] `dist/backend/node_modules/` - Dependências do backend
- [ ] `dist/frontend/browser/index.html` - Frontend compilado
- [ ] `dist/electron/main.js` - Main process do Electron
- [ ] Arquivo `.env` copiado
- [ ] Banco de dados SQLite (se existir)

## 🚀 Distribuição

### Para Usuários Finais

1. **Instalador**: Execute `LoL Matchmaking Setup 1.0.0.exe`
2. **Portable**: Execute diretamente `LoL Matchmaking Portable 1.0.0.exe`

### Requisitos do Sistema

- Windows 10/11 (64-bit)
- 4GB RAM mínimo
- 500MB espaço em disco
- League of Legends instalado (opcional, mas recomendado)

## 🔧 Personalização

### Ícone do Aplicativo

Coloque seu ícone em:

- `build/icon.ico` (Windows)
- `build/icon.icns` (macOS)
- `build/icon.png` (Linux)

### Configurações do Instalador

Edite `build/installer.nsh` para personalizar:

- Atalhos criados
- Associações de arquivo
- Verificações do sistema

## 🐛 Troubleshooting

### Build Falha

```bash
# Limpar cache e tentar novamente
npm run clean:cache
npm run build:standalone
```

### Aplicativo Não Inicia

1. Verifique se o League of Legends está instalado
2. Execute como administrador
3. Verifique logs em `%APPDATA%/LoL Matchmaking/logs/`

### Problemas de Rede

- O aplicativo usa portas locais (3000, 4200)
- Verifique se não há conflitos de porta
- Firewall pode bloquear conexões locais

## 📊 Otimizações

### Reduzir Tamanho

- Use `npm prune --production` antes do build
- Remova dependências desnecessárias
- Otimize imagens e assets

### Melhorar Performance

- Habilite compressão no build
- Use cache para assets estáticos
- Otimize queries do banco de dados

## 🔄 Atualizações

### Auto-Update (Futuro)

Para implementar atualizações automáticas:

1. Configure um servidor de atualizações
2. Use `electron-updater`
3. Implemente verificação de versão

### Distribuição Manual

1. Gere nova versão com `npm version patch`
2. Execute build completo
3. Distribua novos executáveis

## 📞 Suporte

Para problemas específicos:

1. Verifique logs do aplicativo
2. Teste em ambiente limpo
3. Consulte documentação do Electron Builder
4. Abra issue no repositório

---

**Nota**: Este build standalone inclui todas as dependências necessárias e não requer instalação de Node.js no computador do usuário final.
