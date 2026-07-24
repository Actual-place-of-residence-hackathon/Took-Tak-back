const express = require('express');
const path = require('path');
const cors = require('cors');

const env = require('./config/env');
const { sequelize } = require('./models');

const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const statsRoutes = require('./routes/statsRoutes');
const locationRoutes = require('./routes/locationRoutes');

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 라우터 연결
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/locations', locationRoutes);

app.get('/', (req, res) => {
  res.send('뚝딱 백엔드 서버가 정상적으로 동작중입니다.');
});

// EC2 / 로드밸런서 헬스체크용
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    return res.status(200).json({ status: 'ok', db: 'up' });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: '존재하지 않는 경로입니다.' });
});

// 공통 에러 핸들러.
// 5xx 에서는 err.message 를 그대로 내보내지 않습니다.
// Sequelize 예외 메시지에 테이블/컬럼명과 쿼리가 그대로 들어있습니다.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: '이미 존재하는 데이터입니다.' });
  }
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ message: '요청 값이 올바르지 않습니다.' });
  }

  const status = err.status || 500;
  if (status >= 500) {
    console.error('[error]', err);
    return res.status(status).json({ message: '서버 오류가 발생했습니다.' });
  }
  return res.status(status).json({ message: err.message });
});

async function start() {
  // 스키마는 db/schema.sql 이 정본입니다.
  // sequelize.sync() 를 쓰면 SQL 파일과 다른 테이블/ENUM 타입이 조용히 생기므로
  // 연결 확인만 하고 스키마는 건드리지 않습니다.
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL 데이터베이스 연결 성공');
  } catch (err) {
    console.error('PostgreSQL 연결 실패:', err.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`서버 실행중: http://localhost:${env.port}`);
  });
}

start();

module.exports = app;
