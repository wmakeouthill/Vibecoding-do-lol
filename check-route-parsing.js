const express = require('express');
const path = require('path');

console.log('🔍 TESTE DE PARSING DE ROTAS');
console.log('================================');

// Simular o app Express
const app = express();

// Monitorar a criação de rotas para identificar onde falha
const originalGet = app.get;
const originalPost = app.post;
const originalPut = app.put;
const originalDelete = app.delete;

let routeCount = 0;

app.get = function(path, ...handlers) {
  routeCount++;
  console.log(`📍 [${routeCount}] Testando rota GET: "${path}"`);
  try {
    return originalGet.call(this, path, ...handlers);
  } catch (error) {
    console.error(`❌ [${routeCount}] ERRO na rota GET "${path}":`, error.message);
    throw error;
  }
};

app.post = function(path, ...handlers) {
  routeCount++;
  console.log(`📍 [${routeCount}] Testando rota POST: "${path}"`);
  try {
    return originalPost.call(this, path, ...handlers);
  } catch (error) {
    console.error(`❌ [${routeCount}] ERRO na rota POST "${path}":`, error.message);
    throw error;
  }
};

app.put = function(path, ...handlers) {
  routeCount++;
  console.log(`📍 [${routeCount}] Testando rota PUT: "${path}"`);
  try {
    return originalPut.call(this, path, ...handlers);
  } catch (error) {
    console.error(`❌ [${routeCount}] ERRO na rota PUT "${path}":`, error.message);
    throw error;
  }
};

app.delete = function(path, ...handlers) {
  routeCount++;
  console.log(`📍 [${routeCount}] Testando rota DELETE: "${path}"`);
  try {
    return originalDelete.call(this, path, ...handlers);
  } catch (error) {
    console.error(`❌ [${routeCount}] ERRO na rota DELETE "${path}":`, error.message);
    throw error;
  }
};

// Dummy handler para testar
const dummyHandler = (req, res) => res.json({ ok: true });

console.log('\n🧪 Testando rotas específicas que podem causar problema...');

// Testar rotas específicas que podem ser problemáticas
const testRoutes = [
  { method: 'get', path: '/api/champions' },
  { method: 'get', path: '/api/champions/role/:role' },
  { method: 'post', path: '/api/matches/:matchId/draft-completed' },
  { method: 'post', path: '/api/matches/:matchId/game-completed' },
  { method: 'put', path: '/api/matches/custom/:matchId' },
  { method: 'get', path: '/api/riot/summoner/:region/:summonerName' },
  { method: 'get', path: '/api/riot/summoner-by-riot-id/:region/:gameName/:tagLine' },
  { method: 'get', path: '/api/riot/account-by-riot-id/:region/:gameName/:tagLine' },
];

try {
  for (const route of testRoutes) {
    console.log(`\n🔍 Testando: ${route.method.toUpperCase()} ${route.path}`);
    app[route.method](route.path, dummyHandler);
    console.log(`✅ OK: ${route.method.toUpperCase()} ${route.path}`);
  }

  console.log('\n✅ Todas as rotas foram testadas com sucesso!');
  console.log('⚠️ O problema pode estar em outro lugar...');

} catch (error) {
  console.error('\n💥 ERRO ENCONTRADO!');
  console.error('Tipo:', error.constructor.name);
  console.error('Mensagem:', error.message);
  console.error('Stack:', error.stack);

  if (error.message.includes('pathToRegexpError')) {
    console.log('\n🔍 ANÁLISE DO ERRO PATH-TO-REGEXP:');
    console.log('Este erro indica problema na definição de um parâmetro de rota.');
    console.log('Possíveis causas:');
    console.log('1. Parâmetro com nome vazio: /api/:/ em vez de /api/:param');
    console.log('2. Parâmetros duplos: /api/::param');
    console.log('3. Caracteres especiais no nome do parâmetro');
    console.log('4. Rota malformada ou incompleta');
  }
}

// Testar também rotas que podem estar vazias ou malformadas
console.log('\n🔍 Testando rotas potencialmente problemáticas...');

const problematicRoutes = [
  '', // rota vazia
  '/', 
  '/api/',
  '/api/:', // parâmetro sem nome
  '/api/::', // parâmetros duplos
  '/api/test:', // parâmetro sem nome no final
  '/api/:param:', // parâmetro mal terminado
];

for (const route of problematicRoutes) {
  try {
    console.log(`🧪 Testando rota problemática: "${route}"`);
    app.get(route, dummyHandler);
    console.log(`✅ Rota "${route}" aceita`);
  } catch (error) {
    console.error(`❌ Rota "${route}" rejeitada:`, error.message);
  }
}

console.log('\n🏁 Teste concluído.'); 