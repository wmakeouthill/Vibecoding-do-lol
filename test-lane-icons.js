// Teste rápido da lógica dos ícones das lanes
console.log('🧪 Testando lógica dos ícones das lanes...');

function getLaneIcon(lane) {
    const icons = {
      'top': '⚔️',
      'jungle': '🌲',
      'mid': '⚡',
      'bot': '🏹',
      'adc': '🏹',
      'support': '🛡️',
      'fill': '🎲'
    };

    // Sempre normalizar para minúsculas e mapear ADC -> bot
    const normalizedLane = lane?.toLowerCase() || '';
    const mappedLane = normalizedLane === 'adc' ? 'bot' : normalizedLane;
    
    const icon = icons[mappedLane] || '❓';

    console.log('Lane:', lane, '-> normalizada:', normalizedLane, '-> mapeada:', mappedLane, '-> ícone:', icon);

    return icon;
}

function getLaneName(lane) {
    const names = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'adc': 'Atirador',
      'support': 'Suporte',
      'fill': 'Preenchimento'
    };

    // Sempre normalizar para minúsculas e mapear ADC -> bot
    const normalizedLane = lane?.toLowerCase() || '';
    const mappedLane = normalizedLane === 'adc' ? 'bot' : normalizedLane;
    
    const name = names[mappedLane] || lane;

    console.log('Lane:', lane, '-> normalizada:', normalizedLane, '-> mapeada:', mappedLane, '-> nome:', name);

    return name;
}

// Testar com lanes em maiúsculas (como vem do backend)
const testLanes = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT', 'FILL'];

console.log('\n=== TESTANDO ÍCONES ===');
testLanes.forEach(lane => {
    const icon = getLaneIcon(lane);
    const name = getLaneName(lane);
    console.log(`${lane}: ${icon} ${name}`);
});

console.log('\n=== RESULTADO ESPERADO ===');
console.log('TOP: ⚔️ Topo');
console.log('JUNGLE: 🌲 Selva');
console.log('MID: ⚡ Meio');
console.log('ADC: 🏹 Atirador');
console.log('SUPPORT: 🛡️ Suporte');
console.log('FILL: 🎲 Preenchimento');
