const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
console.log('HOST:', process.env.MYSQL_HOST);
console.log('USER:', process.env.MYSQL_USER);
console.log('DB:', process.env.MYSQL_DATABASE);
console.log('PASSWORD:', process.env.MYSQL_PASSWORD ? '***' : 'undefined');
console.log('PORT:', process.env.MYSQL_PORT);