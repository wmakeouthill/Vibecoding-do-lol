const fs = require('fs');
const path = require('path');

console.log('Current directory:', process.cwd());
console.log('Files in current directory:');
fs.readdirSync('.').forEach(file => {
  if (file.includes('env')) {
    console.log('-', file);
  }
});

console.log('\nTrying to read .env file:');
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  console.log('Content:', envContent);
} catch (error) {
  console.log('Error reading .env:', error.message);
}

console.log('\nTrying dotenv:');
require('dotenv').config();
console.log('MYSQL_HOST:', process.env.MYSQL_HOST);
console.log('MYSQL_USER:', process.env.MYSQL_USER);
console.log('MYSQL_PASSWORD:', process.env.MYSQL_PASSWORD ? '***' : 'undefined'); 