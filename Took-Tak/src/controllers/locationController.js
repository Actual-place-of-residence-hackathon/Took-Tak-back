const { Building, Floor, Zone } = require('../models');
const { parseId } = require('../utils/validators');

// 배치도 위치 선택(건물 → 층 → 구역)을 위한 조회 API.
// 신고 등록이 building_id / floor_id / zone_id 를 요구하므로
// 프론트가 그 id 를 알아내려면 이 엔드포인트가 필요합니다. (기능명세 6)

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// 1. 건물 목록
exports.getBuildings = async (req, res, next) => {
  try {
    const buildings = await Building.findAll({
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });
    return res.status(200).json({ buildings });
  } catch (error) {
    return next(error);
  }
};

// 2. 특정 건물의 층 목록
exports.getFloors = async (req, res, next) => {
  try {
    const buildingId = parseId(req.params.buildingId);
    if (!buildingId) throw badRequest('유효하지 않은 건물 id 입니다.');

    const floors = await Floor.findAll({
      where: { building_id: buildingId },
      attributes: ['id', 'name', 'building_id'],
      order: [['name', 'ASC']],
    });
    return res.status(200).json({ floors });
  } catch (error) {
    return next(error);
  }
};

// 3. 특정 층의 구역 목록
exports.getZones = async (req, res, next) => {
  try {
    const floorId = parseId(req.params.floorId);
    if (!floorId) throw badRequest('유효하지 않은 층 id 입니다.');

    const zones = await Zone.findAll({
      where: { floor_id: floorId },
      attributes: ['id', 'name', 'floor_id'],
      order: [['name', 'ASC']],
    });
    return res.status(200).json({ zones });
  } catch (error) {
    return next(error);
  }
};

// 4. 전체 트리 (건물 → 층 → 구역) — 배치도 초기 로딩용
exports.getTree = async (req, res, next) => {
  try {
    const buildings = await Building.findAll({
      attributes: ['id', 'name'],
      include: [{
        model: Floor,
        as: 'floors',
        attributes: ['id', 'name'],
        include: [{ model: Zone, as: 'zones', attributes: ['id', 'name'] }],
      }],
      order: [
        ['name', 'ASC'],
        [{ model: Floor, as: 'floors' }, 'name', 'ASC'],
        [{ model: Floor, as: 'floors' }, { model: Zone, as: 'zones' }, 'name', 'ASC'],
      ],
    });
    return res.status(200).json({ buildings });
  } catch (error) {
    return next(error);
  }
};
