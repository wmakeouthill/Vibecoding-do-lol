#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Iniciando build completo do LoL Matchmaking...');

const startTime = Date.now();

// Função para executar comandos com log
function execCommand(command, description) {
  console.log(`\n📋 ${description}...`);
  console.log(`💻 Executando: ${command}`);
  
  try {
    execSync(command, { 
      stdio: 'inherit', 
      cwd: process.cwd() 
    });
    console.log(`✅ ${description} - Concluído`);
  } catch (error) {
    console.error(`❌ ${description} - Falhou`);
    console.error(error.message);
    process.exit(1);
  }
}

// Função para verificar se arquivo/pasta existe
function checkExists(filepath, name) {
  const exists = fs.existsSync(filepath);
  console.log(`${exists ? '✅' : '❌'} ${name}: ${filepath}`);
  return exists;
}

// Limpar builds anteriores
console.log('\n🧹 Limpando builds anteriores...');
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
  console.log('✅ Pasta dist removida');
}
if (fs.existsSync('release')) {
  fs.rmSync('release', { recursive: true, force: true });
  console.log('✅ Pasta release removida');
}

// Instalar dependências de todas as partes
console.log('\n📦 Instalando dependências...');

// Instalar dependências do root (Electron)
execCommand('npm install', 'Instalando dependências do root (Electron)');

// Instalar dependências do backend
execCommand('cd src/backend && npm install --omit=dev', 'Instalando dependências do backend');

// Instalar dependências do frontend
execCommand('cd src/frontend && npm install', 'Instalando dependências do frontend');

// Build de todos os componentes
console.log('\n🔨 Compilando código...');

// Build do backend
execCommand('npm run build:backend', 'Compilando backend TypeScript');

// Build do frontend
execCommand('npm run build:frontend', 'Compilando frontend Angular');

// Build do electron
execCommand('npm run build:electron', 'Compilando Electron TypeScript');

// Copiar arquivos necessários
console.log('\n📁 Copiando arquivos...');

// Criar estrutura de diretórios
const dirs = [
  'dist/backend',
  'dist/backend/database',
  'dist/frontend',
  'dist/electron'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Diretório criado: ${dir}`);
  }
});

// Copiar dependências do backend
console.log('🔄 Copiando node_modules do backend...');
if (fs.existsSync('src/backend/node_modules')) {
  console.log('Copiando node_modules do backend (isso pode demorar...)');
  fs.cpSync('src/backend/node_modules', 'dist/backend/node_modules', {
    recursive: true,
    force: true
  });
  console.log('✅ node_modules do backend copiado');
} else {
  console.error('❌ src/backend/node_modules não encontrado!');
  process.exit(1);
}

// Copiar build do frontend
console.log('🔄 Copiando build do frontend...');
if (fs.existsSync('src/frontend/dist')) {
  fs.cpSync('src/frontend/dist', 'dist/frontend/dist', {
    recursive: true,
    force: true
  });
  console.log('✅ Build do frontend copiado');
} else {
  console.error('❌ src/frontend/dist não encontrado!');
  process.exit(1);
}

// Copiar bancos de dados se existirem
console.log('🔄 Copiando bancos de dados...');
if (fs.existsSync('database.sqlite')) {
  fs.copyFileSync('database.sqlite', 'dist/backend/database/database.sqlite');
  console.log('✅ database.sqlite copiado');
}
if (fs.existsSync('matchmaking.db')) {
  fs.copyFileSync('matchmaking.db', 'dist/backend/database/matchmaking.db');
  console.log('✅ matchmaking.db copiado');
}

// Verificar se tudo foi copiado corretamente
console.log('\n🔍 Verificando build...');
const checks = [
  { path: 'dist/backend/server.js', name: 'Backend JS' },
  { path: 'dist/backend/node_modules', name: 'Backend dependencies' },
  { path: 'dist/frontend/dist/lol-matchmaking/browser', name: 'Frontend build' },
  { path: 'dist/frontend/dist/lol-matchmaking/browser/index.html', name: 'Frontend index.html' },
  { path: 'dist/electron/main.js', name: 'Electron main' }
];

let allOk = true;
checks.forEach(check => {
  if (!checkExists(check.path, check.name)) {
    allOk = false;
  }
});

if (!allOk) {
  console.error('\n❌ Alguns arquivos estão faltando no build!');
  process.exit(1);
}

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(1);

console.log(`\n🎉 Build completo concluído em ${duration}s!`);
console.log('\n📋 Próximos passos:');
console.log('  - Para gerar instalador: npm run dist:win');
console.log('  - Para testar: npm run electron');
