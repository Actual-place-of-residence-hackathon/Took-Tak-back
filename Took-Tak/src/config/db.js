const { Sequelize } = require('sequelize');
const env = require('./env');

// 연결 확인은 server.js 의 기동 시퀀스에서 await 로 처리합니다.
// 여기서 IIFE 로 authenticate() 를 돌리면 실패해도 서버가 그대로 떠버립니다.
const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: 'postgres',
  logging: false,
  // 스키마는 db/schema.sql 이 정본입니다.
  // 모델이 createdAt/updatedAt 을 임의로 만들지 않도록 전역으로 꺼둡니다.
  define: { timestamps: false },
  pool: { max: 10, min: 0, idle: 10000 },
});

module.exports = sequelize;
