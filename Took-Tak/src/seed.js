// 건물/배치도 위치 초기 데이터 넣는 스크립트
// 실행: node src/seed.js
require('dotenv').config();
const { sequelize, Building, Floor, Zone } = require('./models');

async function seed() {
  await sequelize.authenticate();
  await sequelize.sync();

  const dongHaeng = await Building.create({ name: '동행관' });
  const bonGwan = await Building.create({ name: '본관' });

  const dongHaeng1 = await Floor.create({ building_id: dongHaeng.id, name: '1F' });
  const dongHaeng2 = await Floor.create({ building_id: dongHaeng.id, name: '2F' });
  const bonGwan1 = await Floor.create({ building_id: bonGwan.id, name: '1F' });

  await Zone.bulkCreate([
    { floor_id: dongHaeng1.id, name: '로비' },
    { floor_id: dongHaeng1.id, name: '강의실' },
    { floor_id: dongHaeng2.id, name: '화장실' },
    { floor_id: bonGwan1.id, name: '행정실' },
    { floor_id: bonGwan1.id, name: '복도' },
  ]);

  console.log('시드 데이터 생성 완료');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
