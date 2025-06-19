// Teste rápido para comparar mapeamentos
const dashboardMapping = {
  950: 'Briar',
  145: 'Kai\'Sa',
  55: 'Katarina'
};

const matchHistoryMapping = {
  950: 'Naafiri',
  145: 'Kaisa',
  55: 'Katarina'
};

console.log('Dashboard mapping:');
console.log(dashboardMapping);
console.log('\nMatch history mapping:');
console.log(matchHistoryMapping);
console.log('\nDiferenças encontradas:');

for (let id in dashboardMapping) {
  if (dashboardMapping[id] !== matchHistoryMapping[id]) {
    console.log(`ID ${id}: Dashboard="${dashboardMapping[id]}", Match-History="${matchHistoryMapping[id]}"`);
  }
}
