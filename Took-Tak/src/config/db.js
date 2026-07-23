const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL 데이터베이스 연결 성공!');
  } catch (err) {
    console.error('PostgreSQL 연결 에러:', err);
  }
})();

module.exports = sequelize;