const http = require('http');

function testDiscordEndpoint() {
  console.log('🔍 Testando endpoint /api/config/discord-token...');
  
  const postData = JSON.stringify({
    token: 'test-token-123'
  });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/config/discord-token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    console.log(`📡 Status: ${res.statusCode}`);
    console.log(`📋 Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('📦 Response Body:', data);
      try {
        const jsonResponse = JSON.parse(data);
        console.log('✅ Response JSON:', jsonResponse);
      } catch (error) {
        console.log('❌ Response não é JSON válido');
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('❌ Erro na requisição:', error.message);
  });
  
  req.write(postData);
  req.end();
}

testDiscordEndpoint(); 