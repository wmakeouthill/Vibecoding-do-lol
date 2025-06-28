// Script para testar os novos valores balanceados do sistema MMR
// Simula o método calculateLPChange com os novos valores

function calculateLPChange(playerMMR, opponentMMR, isWin) {
  // LP base: +15 para vitória, -18 para derrota (mais balanceado)
  const baseLpWin = 15;
  const baseLpLoss = -18;
  
  // Calcular diferença de MMR
  const mmrDifference = opponentMMR - playerMMR;
  
  // Ajuste por diferença de MMR: ±6 LP para cada 100 pontos de diferença (reduzido de 8)
  const mmrAdjustment = (mmrDifference / 100) * 6;
  
  // LP inicial baseado no resultado
  let lpChange = isWin ? baseLpWin : baseLpLoss;
  
  // Aplicar ajuste por diferença de MMR
  lpChange += mmrAdjustment;
  
  // Ajustes por MMR atual do jogador (reduzidos)
  if (playerMMR < 1200) {
    // Jogadores com MMR baixo (< 1200)
    const mmrBelow1200 = 1200 - playerMMR;
    if (isWin) {
      // Vitórias: +0.5 LP adicional para cada 100 MMR abaixo de 1200 (reduzido)
      lpChange += Math.floor(mmrBelow1200 / 100) * 0.5;
    } else {
      // Derrotas: Perdas reduzidas: +0.5 LP para cada 200 MMR abaixo de 1200 (reduzido)
      lpChange += Math.floor(mmrBelow1200 / 200) * 0.5;
    }
  } else if (playerMMR > 1800) {
    // Jogadores com MMR alto (> 1800)
    const mmrAbove1800 = playerMMR - 1800;
    if (isWin) {
      // Vitórias: -0.5 LP para cada 100 MMR acima de 1800 (reduzido)
      lpChange -= Math.floor(mmrAbove1800 / 100) * 0.5;
    } else {
      // Derrotas: Perdas aumentadas: -0.5 LP adicional para cada 100 MMR acima de 1800 (reduzido)
      lpChange -= Math.floor(mmrAbove1800 / 100) * 0.5;
    }
  }
  
  // Aplicar limites mais restritivos
  if (isWin) {
    lpChange = Math.max(5, Math.min(25, lpChange)); // Reduzido de 8-35 para 5-25
  } else {
    lpChange = Math.max(-30, Math.min(-5, lpChange)); // Aumentado de -25 a -8 para -30 a -5
  }
  
  return Math.round(lpChange);
}

console.log('🧪 Testando novo sistema de MMR balanceado...\n');

// Teste 1: Jogador iniciante (MMR 0)
console.log('1️⃣ Jogador Iniciante (MMR 0):');
console.log(`   vs MMR 0: Vitória +${calculateLPChange(0, 0, true)} LP, Derrota ${calculateLPChange(0, 0, false)} LP`);
console.log(`   vs MMR 200: Vitória +${calculateLPChange(0, 200, true)} LP, Derrota ${calculateLPChange(0, 200, false)} LP`);
console.log(`   vs MMR 500: Vitória +${calculateLPChange(0, 500, true)} LP, Derrota ${calculateLPChange(0, 500, false)} LP`);

// Teste 2: Jogador intermediário (MMR 500)
console.log('\n2️⃣ Jogador Intermediário (MMR 500):');
console.log(`   vs MMR 300: Vitória +${calculateLPChange(500, 300, true)} LP, Derrota ${calculateLPChange(500, 300, false)} LP`);
console.log(`   vs MMR 500: Vitória +${calculateLPChange(500, 500, true)} LP, Derrota ${calculateLPChange(500, 500, false)} LP`);
console.log(`   vs MMR 700: Vitória +${calculateLPChange(500, 700, true)} LP, Derrota ${calculateLPChange(500, 700, false)} LP`);

// Teste 3: Jogador avançado (MMR 1000)
console.log('\n3️⃣ Jogador Avançado (MMR 1000):');
console.log(`   vs MMR 800: Vitória +${calculateLPChange(1000, 800, true)} LP, Derrota ${calculateLPChange(1000, 800, false)} LP`);
console.log(`   vs MMR 1000: Vitória +${calculateLPChange(1000, 1000, true)} LP, Derrota ${calculateLPChange(1000, 1000, false)} LP`);
console.log(`   vs MMR 1200: Vitória +${calculateLPChange(1000, 1200, true)} LP, Derrota ${calculateLPChange(1000, 1200, false)} LP`);

// Teste 4: Jogador muito avançado (MMR 2000)
console.log('\n4️⃣ Jogador Muito Avançado (MMR 2000):');
console.log(`   vs MMR 1800: Vitória +${calculateLPChange(2000, 1800, true)} LP, Derrota ${calculateLPChange(2000, 1800, false)} LP`);
console.log(`   vs MMR 2000: Vitória +${calculateLPChange(2000, 2000, true)} LP, Derrota ${calculateLPChange(2000, 2000, false)} LP`);
console.log(`   vs MMR 2200: Vitória +${calculateLPChange(2000, 2200, true)} LP, Derrota ${calculateLPChange(2000, 2200, false)} LP`);

// Análise de balanceamento
console.log('\n📊 Análise de Balanceamento:');
console.log('✅ Vitórias: Base +15 LP (reduzido de +18)');
console.log('✅ Derrotas: Base -18 LP (aumentado de -15)');
console.log('✅ Ajuste por diferença: ±6 LP/100 MMR (reduzido de ±8)');
console.log('✅ Limites vitória: 5-25 LP (reduzido de 8-35)');
console.log('✅ Limites derrota: -30 a -5 LP (aumentado de -25 a -8)');
console.log('✅ Bônus iniciantes: +0.5 LP/100 MMR (reduzido de +1)');
console.log('✅ Penalidade avançados: -0.5 LP/100 MMR (reduzido de -1)');

console.log('\n🎯 Sistema agora está mais balanceado:');
console.log('   • Ganhos menores para evitar inflação');
console.log('   • Perdas maiores para manter competitividade');
console.log('   • Progressão mais lenta e realista');
console.log('   • Menor diferença entre vitórias e derrotas'); 