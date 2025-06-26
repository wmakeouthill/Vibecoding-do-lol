require('dotenv').config({ path: __dirname + '/.env' });
console.log('HOST:', process.env.MYSQL_HOST);
console.log('USER:', process.env.MYSQL_USER);
console.log('DB:', process.env.MYSQL_DATABASE);