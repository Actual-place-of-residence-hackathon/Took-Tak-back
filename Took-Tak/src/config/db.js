const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('PostgreSQL 연결 에러:', err.stack);
  } else {
    console.log('PostgreSQL 데이터베이스 연결 성공!');
    release();
  }
});

module.exports = pool;