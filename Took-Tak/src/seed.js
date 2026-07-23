// 배치도 기준 데이터(건물 → 층 → 구역) 초기 입력 스크립트
// 실행: node src/seed.js
//
// ※ 테이블 생성은 하지 않습니다. db/schema.sql 을 먼저 적용한 뒤 실행하세요.
//   findOrCreate 라 여러 번 돌려도 중복이 쌓이지 않습니다.
//
// ⚠ 층·구역 값은 임시입니다. 기능명세 6/17 에서 "상세 위치 입력 방식"이
//   아직 미정이라 실제 교실·시설 목록은 팀 확정 후 교체해야 합니다.

const { sequelize, Building, Floor, Zone } = require('./models');

// 기능명세 6 기준 건물 목록
const LAYOUT = {
  금남관: {
    '1F': ['로비', '행정실', '화장실'],
    '2F': ['복도', '강의실'],
  },
  대현관: {
    '1F': ['로비', '식당'],
    '2F': ['복도', '강의실', '화장실'],
  },
  본관: {
    '1F': ['로비', '행정실'],
    '2F': ['복도', '강의실'],
  },
};

async function seed() {
  await sequelize.authenticate();

  let zoneCount = 0;

  await sequelize.transaction(async (t) => {
    for (const [buildingName, floors] of Object.entries(LAYOUT)) {
      const [building] = await Building.findOrCreate({
        where: { name: buildingName },
        transaction: t,
      });

      for (const [floorName, zones] of Object.entries(floors)) {
        const [floor] = await Floor.findOrCreate({
          where: { building_id: building.id, name: floorName },
          transaction: t,
        });

        for (const zoneName of zones) {
          await Zone.findOrCreate({
            where: { floor_id: floor.id, name: zoneName },
            transaction: t,
          });
          zoneCount += 1;
        }
      }
    }
  });

  console.log(`시드 데이터 생성 완료 (건물 ${Object.keys(LAYOUT).length}개, 구역 ${zoneCount}개)`);
  await sequelize.close();
}

seed().catch(async (err) => {
  console.error('시드 실패:', err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
