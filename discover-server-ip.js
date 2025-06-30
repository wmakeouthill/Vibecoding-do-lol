const os = require('os');
const { networkInterfaces } = require('os');

console.log('🔍 Descobrindo IP do Servidor');
console.log('==============================\n');

function getLocalIPs() {
  const nets = networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Pular interfaces não IPv4 e loopback
      if (net.family === 'IPv4' && !net.internal) {
        results.push({
          name: name,
          address: net.address,
          netmask: net.netmask,
          cidr: net.cidr
        });
      }
    }
  }

  return results;
}

const localIPs = getLocalIPs();

console.log('📋 IPs disponíveis no servidor:');
console.log('');

if (localIPs.length === 0) {
  console.log('❌ Nenhum IP local encontrado');
  process.exit(1);
}

localIPs.forEach((ip, index) => {
  console.log(`${index + 1}. ${ip.name}: ${ip.address}`);
  console.log(`   Máscara: ${ip.netmask}`);
  console.log(`   CIDR: ${ip.cidr}`);
  console.log('');
});

// Identificar o IP mais provável para ser usado
const preferredIPs = localIPs.filter(ip => {
  // Priorizar IPs que começam com 192.168, 10.0, ou 172.16-31
  return ip.address.startsWith('192.168.') || 
         ip.address.startsWith('10.') || 
         ip.address.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
});

if (preferredIPs.length > 0) {
  console.log('🎯 IP recomendado para configuração:');
  console.log(`   ${preferredIPs[0].address}`);
  console.log('');
  console.log('📝 Para configurar nos clientes, execute:');
  console.log(`   node configure-server-ip.js ${preferredIPs[0].address}`);
} else {
  console.log('⚠️ Nenhum IP privado encontrado. Use um dos IPs listados acima.');
  console.log('');
  console.log('📝 Para configurar nos clientes, execute:');
  console.log(`   node configure-server-ip.js <IP_ESCOLHIDO>`);
}

console.log('');
console.log('🔧 Informações adicionais:');
console.log(`   Hostname: ${os.hostname()}`);
console.log(`   Plataforma: ${os.platform()}`);
console.log(`   Arquitetura: ${os.arch()}`);
console.log('');

console.log('📋 Passos para configurar:');
console.log('1. Execute o servidor no PC principal: npm start');
console.log('2. Use o IP recomendado acima para configurar os clientes');
console.log('3. Execute o script de configuração em cada PC cliente');
console.log('4. Teste a conexão entre os PCs'); 