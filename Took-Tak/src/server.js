const express = require('express');
const cors = require('cors');
require('dotenv').config();

const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// 라우터 연결
app.use('/api/reports', reportRoutes);

app.get('/', (req, res) => {
  res.send('뚝딱 백엔드 서버가 정상적으로 동작중입니다.');
});

app.listen(PORT, () => {
  console.log(`서버 실행중: http://localhost:${PORT}`);
});
