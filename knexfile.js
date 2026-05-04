// knexfile.js
require('dotenv').config();

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'bots',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bots',
      port: process.env.DB_PORT || 3306,
      charset: 'utf8mb4',
    },
    migrations: {
      directory: './src/migrations',
    },
    pool: { min: 0, max: 10 },
  },
  // You can add production config here
};
