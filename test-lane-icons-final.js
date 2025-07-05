// Teste da lógica dos ícones com os dados exatos do usuário
console.log('🧪 Testando lógica corrigida dos ícones...');

function getLaneIcon(lane) {
    console.log('🔍 getLaneIcon chamado com:', lane, 'tipo:', typeof lane);

    const icons = {
      // Minúsculas
      'top': '⚔️',
      'jungle': '🌲',
      'mid': '⚡',
      'bot': '🏹',
      'adc': '🏹',
      'support': '🛡️',
      'fill': '🎲',
      // Maiúsculas (direto do backend)
      'TOP': '⚔️',
      'JUNGLE': '🌲',
      'MID': '⚡',
      'BOT': '🏹',
      'ADC': '🏹',
      'SUPPORT': '🛡️',
      'FILL': '🎲'
    };

    if (!lane) {
      console.log('🔍 Lane é null/undefined, retornando ❓');
      return '❓';
    }

    // Tentar buscar diretamente primeiro
    let icon = icons[lane];
    console.log('🔍 Busca direta para', lane, ':', icon);

    // Se não encontrar, tentar normalizar
    if (!icon) {
      const normalizedLane = lane.toLowerCase();
      const mappedLane = normalizedLane === 'adc' ? 'bot' : normalizedLane;
      icon = icons[mappedLane];
      console.log('🔍 Busca normalizada:', lane, '→', normalizedLane, '→', mappedLane, '→', icon);
    }

    if (!icon) {
      console.log('🔍 Ícone não encontrado para:', lane);
      return '❓';
    }

    console.log('🔍 Resultado final - Lane:', lane, '→ Ícone:', icon);
    return icon;
}

function getLaneName(lane) {
    console.log('🔍 getLaneName chamado com:', lane, 'tipo:', typeof lane);

    const names = {
      // Minúsculas
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'adc': 'Atirador',
      'support': 'Suporte',
      'fill': 'Preenchimento',
      // Maiúsculas (direto do backend)
      'TOP': 'Topo',
      'JUNGLE': 'Selva',
      'MID': 'Meio',
      'BOT': 'Atirador',
      'ADC': 'Atirador',
      'SUPPORT': 'Suporte',
      'FILL': 'Preenchimento'
    };

    if (!lane) {
      console.log('🔍 Lane é null/undefined, retornando lane original');
      return lane || 'Desconhecido';
    }

    // Tentar buscar diretamente primeiro
    let name = names[lane];
    console.log('🔍 Busca direta para', lane, ':', name);

    // Se não encontrar, tentar normalizar
    if (!name) {
      const normalizedLane = lane.toLowerCase();
      const mappedLane = normalizedLane === 'adc' ? 'bot' : normalizedLane;
      name = names[mappedLane];
      console.log('🔍 Busca normalizada:', lane, '→', normalizedLane, '→', mappedLane, '→', name);
    }

    if (!name) {
      console.log('🔍 Nome não encontrado para:', lane);
      return lane;
    }

    console.log('🔍 Resultado final - Lane:', lane, '→ Nome:', name);
    return name;
}

// Testar com as lanes exatas que o usuário está vendo
const testLanes = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

console.log('\n=== TESTANDO COM LANES DO USUÁRIO ===');
testLanes.forEach(lane => {
    console.log(`\n--- Testando ${lane} ---`);
    const icon = getLaneIcon(lane);
    const name = getLaneName(lane);
    console.log(`✅ Resultado: ${lane} → ${icon} ${name}`);
});

console.log('\n=== RESULTADO ESPERADO ===');
console.log('TOP → ⚔️ Topo');
console.log('JUNGLE → 🌲 Selva');
console.log('MID → ⚡ Meio');
console.log('ADC → 🏹 Atirador');
console.log('SUPPORT → 🛡️ Suporte');
