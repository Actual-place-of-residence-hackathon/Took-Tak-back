// 배치도 기준 데이터(건물 → 층 → 구역) 초기 입력 스크립트
// 실행: node src/seed.js
//
// ※ 테이블 생성은 하지 않습니다. db/schema.sql 을 먼저 적용한 뒤 실행하세요.
//   findOrCreate 라 여러 번 돌려도 중복이 쌓이지 않습니다.
//
// ※ 건물명은 프론트(Took-Tak-web)의 public/floor-plans/ 실제 이미지 파일명과
//   맞춰야 합니다 (donghaeng-1.png ~ donghaeng-5.png, geumbong-1~4.png,
//   bongwan-1~4.png). 프론트는 건물명(한글) → 이미지 슬러그 매핑을 별도로
//   가지고 있으니, 여기서 건물명을 바꾸면 그 매핑도 같이 바꿔야 합니다.
//
// ⚠ pin_x/pin_y 는 배치도 이미지를 직접 보고 관리자가 잡아야 하는 값입니다.
//   여기 넣은 값은 겹치지 않게 임의로 분산한 placeholder 이며, 실제 배치도
//   이미지 위 정확한 위치가 아닙니다. 운영 전에 관리자가
//     UPDATE zones SET pin_x = .., pin_y = .. WHERE id = ..
//   로 재조정해야 합니다.
//
// ⚠ 신고 유형 목록은 팀 결정(2026-07-24)에 따라 아래 5개로 확정했습니다.
//   (aiService.js 의 PLACEHOLDER_TYPES 와 동일해야 합니다)

const { sequelize, Building, Floor, Zone } = require('./models');

// 프론트 배치도 이미지와 매칭되는 건물 목록 (층 수도 실제 이미지 개수와 동일)
const LAYOUT = {
  동행관: {
    floors: 5,
    zonesPerFloor: ['로비', '강의실', '화장실'],
  },
  금봉관: {
    floors: 4,
    zonesPerFloor: ['복도', '실습실', '휴게실'],
  },
  '본관·실습동': {
    floors: 4,
    zonesPerFloor: ['행정실', '복도'],
  },
};

// 겹치지 않게 분산한 placeholder 좌표(퍼센트). zonesPerFloor 순서대로 사용.
const PLACEHOLDER_PIN_COORDS = [
  { pin_x: 25, pin_y: 30 },
  { pin_x: 50, pin_y: 55 },
  { pin_x: 75, pin_y: 40 },
];

async function seed() {
  await sequelize.authenticate();

  let zoneCount = 0;

  await sequelize.transaction(async (t) => {
    for (const [buildingName, { floors, zonesPerFloor }] of Object.entries(LAYOUT)) {
      const [building] = await Building.findOrCreate({
        where: { name: buildingName },
        transaction: t,
      });

      for (let floorNum = 1; floorNum <= floors; floorNum += 1) {
        const [floor] = await Floor.findOrCreate({
          where: { building_id: building.id, name: `${floorNum}F` },
          transaction: t,
        });

        for (let i = 0; i < zonesPerFloor.length; i += 1) {
          const zoneName = zonesPerFloor[i];
          const coord = PLACEHOLDER_PIN_COORDS[i % PLACEHOLDER_PIN_COORDS.length];

          const [zone, created] = await Zone.findOrCreate({
            where: { floor_id: floor.id, name: zoneName },
            defaults: coord,
            transaction: t,
          });

          // findOrCreate 는 이미 있으면 defaults 를 무시하므로,
          // 좌표가 비어있는 기존 행은 이번에 채워 넣습니다.
          if (!created && (zone.pin_x === null || zone.pin_y === null)) {
            await zone.update(coord, { transaction: t });
          }

          zoneCount += 1;
        }
      }
    }
  });

  console.log(`시드 데이터 생성 완료 (건물 ${Object.keys(LAYOUT).length}개, 구역 ${zoneCount}개)`);
  console.log('⚠ zones.pin_x/pin_y 는 placeholder 입니다. 실제 배치도에 맞게 재조정하세요.');
  await sequelize.close();
}

seed().catch(async (err) => {
  console.error('시드 실패:', err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
