// 건물/구역 초기 데이터 넣는 스크립트
// 실행: node src/seed.js
require('dotenv').config();
const { sequelize, Building, Location } = require('./models');

async function seed() {
  await sequelize.authenticate();
  await sequelize.sync();

  const dongHaeng = await Building.create({ name: '동행관' });
  const bonGwan = await Building.create({ name: '본관' });

  await Location.bulkCreate([
    { buildingId: dongHaeng.id, floor: '1층', zone: '로비' },
    { buildingId: dongHaeng.id, floor: '2층', zone: '강의실' },
    { buildingId: dongHaeng.id, floor: '3층', zone: '화장실' },
    { buildingId: bonGwan.id, floor: '1층', zone: '행정실' },
    { buildingId: bonGwan.id, floor: '2층', zone: '복도' },
  ]);

  console.log('시드 데이터 생성 완료');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
