const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando configuração de produção...\n');

// Verificar se o arquivo .env existe
const envPath = '.env';
const envExists = fs.existsSync(envPath);

if (envExists) {
  console.log('✅ Arquivo .env encontrado');
  
  // Carregar variáveis de ambiente
  require('dotenv').config({ path: envPath });
  
  // Variáveis obrigatórias para MySQL
  const requiredEnvVars = [
    'DB_HOST',
    'DB_USER', 
    'DB_PASSWORD',
    'DB_NAME'
  ];
  
  // Variáveis opcionais
  const optionalEnvVars = [
    'DISCORD_BOT_TOKEN',
    'RIOT_API_KEY',
    'DB_PORT',
    'PORT',
    'NODE_ENV'
  ];
  
  console.log('\n📋 Variáveis obrigatórias:');
  let allRequiredOk = true;
  requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅ Configurada' : '❌ Não configurada';
    console.log(`  ${status} ${varName}`);
    if (!value) allRequiredOk = false;
  });
  
  console.log('\n📋 Variáveis opcionais:');
  optionalEnvVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅ Configurada' : '⚠️ Não configurada (opcional)';
    console.log(`  ${status} ${varName}`);
  });
  
  console.log('\n📊 Resumo:');
  if (allRequiredOk) {
    console.log('✅ Todas as variáveis obrigatórias estão configuradas!');
    console.log('🚀 O aplicativo deve funcionar corretamente em produção.');
  } else {
    console.log('❌ Algumas variáveis obrigatórias estão faltando.');
    console.log('🔧 Configure as variáveis faltantes no arquivo .env');
  }
  
  // Verificar se o .env está sendo copiado para dist
  const distEnvPath = 'dist/.env';
  if (fs.existsSync(distEnvPath)) {
    console.log('\n✅ Arquivo .env copiado para dist/');
  } else {
    console.log('\n⚠️ Arquivo .env não encontrado em dist/');
    console.log('💡 Execute: npm run copy:all-assets');
  }
  
} else {
  console.log('❌ Arquivo .env não encontrado');
  console.log('\n📝 Crie um arquivo .env na raiz do projeto com as seguintes variáveis:');
  console.log('\n# Configurações do MySQL (OBRIGATÓRIAS)');
  console.log('DB_HOST=localhost');
  console.log('DB_USER=seu_usuario');
  console.log('DB_PASSWORD=sua_senha');
  console.log('DB_NAME=nome_do_banco');
  console.log('DB_PORT=3306');
  console.log('\n# Configurações opcionais');
  console.log('DISCORD_BOT_TOKEN=seu_token_do_discord');
  console.log('RIOT_API_KEY=sua_chave_da_riot_api');
  console.log('PORT=3000');
  console.log('NODE_ENV=production');
}

console.log('\n💡 Dicas:');
console.log('- O arquivo .env é necessário para produção');
console.log('- As variáveis MySQL são obrigatórias para o banco de dados');
console.log('- O Discord Bot Token é opcional (funciona sem Discord)');
console.log('- A Riot API Key é opcional (funciona apenas com LCU)');
console.log('- Execute: npm run copy:all-assets para copiar o .env para dist/');

console.log('\n�� Verificando dependências do backend...');
const backendPackagePath = path.resolve(process.cwd(), 'src/backend/package.json');
const backendPackageExists = fs.existsSync(backendPackagePath);

if (backendPackageExists) {
  const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
  const requiredDeps = ['mysql2', 'discord.js', 'express', 'dotenv'];
  
  console.log('\n📦 Dependências necessárias:');
  requiredDeps.forEach(dep => {
    const hasDep = backendPackage.dependencies && backendPackage.dependencies[dep];
    const status = hasDep ? '✅ Instalada' : '❌ Não instalada';
    console.log(`  ${dep}: ${status}`);
  });
}

console.log('\n🎯 Próximos passos:');
console.log('1. Configure o arquivo .env com suas credenciais');
console.log('2. Instale as dependências: cd src/backend && npm install');
console.log('3. Rode o build: npm run build:complete');
console.log('4. Teste o executável na pasta release/'); 