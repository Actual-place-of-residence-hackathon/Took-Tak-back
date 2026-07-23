const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { REPORT_STATUSES, parseId, parseEnumValue } = require('../utils/validators');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// ---------------------------------------------------------------------------
// 1. 배치도 구역 핀 (C1 학생 뷰 / A3 관리자 위험도 시각화)
//    구역별 최고 긴급도로 핀 색을 정합니다.
//    urgency_level ENUM 은 선언 순서(high→medium→low)를 따르므로
//    MIN() 이 곧 "가장 급한 건"입니다.
// ---------------------------------------------------------------------------
exports.getZonePins = async (req, res, next) => {
  try {
    const rows = await sequelize.query(
      `SELECT z.id   AS zone_id,     z.name AS zone,
              z.pin_x, z.pin_y,
              f.id   AS floor_id,    f.name AS floor,
              b.id   AS building_id, b.name AS building,
              MIN(r.urgency)                                     AS pin_urgency,
              COUNT(*)                                           AS open_count,
              (ARRAY_AGG(r.status ORDER BY r.created_at DESC))[1] AS latest_status
         FROM zones z
         JOIN floors    f ON f.id = z.floor_id
         JOIN buildings b ON b.id = f.building_id
         JOIN reports   r ON r.zone_id = z.id
        WHERE r.status <> 'done'
          AND ($1::bigint IS NULL OR b.id = $1)
          AND ($2::bigint IS NULL OR f.id = $2)
        GROUP BY z.id, z.name, z.pin_x, z.pin_y, f.id, f.name, b.id, b.name
        ORDER BY MIN(r.urgency) ASC NULLS LAST, COUNT(*) DESC`,
      {
        bind: [parseId(req.query.building_id), parseId(req.query.floor_id)],
        type: QueryTypes.SELECT,
      },
    );

    return res.status(200).json({
      zones: rows.map((row) => ({ ...row, open_count: Number(row.open_count) })),
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 2. 구역별 신고 목록
//    - C2 중복 안내(학생): ?status=processing → "현재 N건 처리 중"
//    - A4 핀 클릭 상세(관리자): 기본값은 완료를 제외한 열린 신고 전체
//
//    학생에게는 description 을 내보내지 않습니다.
//    남의 신고 본문이 노출되면 안 되고, 원본 C2 쿼리도 반환하지 않습니다.
// ---------------------------------------------------------------------------
exports.getZoneReports = async (req, res, next) => {
  try {
    const zoneId = parseId(req.params.zoneId);
    if (!zoneId) throw badRequest('유효하지 않은 구역 id 입니다.');

    const status = parseEnumValue(req.query.status, REPORT_STATUSES);
    if (status === undefined) {
      throw badRequest(`status는 ${REPORT_STATUSES.join(', ')} 중 하나여야 합니다.`);
    }

    const isAdmin = req.user.role === 'admin';
    const descriptionColumn = isAdmin ? 'r.description' : 'NULL::text';

    const rows = await sequelize.query(
      `SELECT r.id, r.type, r.urgency, r.status, r.created_at,
              ${descriptionColumn} AS description
         FROM reports r
        WHERE r.zone_id = $1
          AND ($2::report_status IS NULL OR r.status = $2)
          AND ($2::report_status IS NOT NULL OR r.status <> 'done')
        ORDER BY r.urgency ASC NULLS LAST, r.created_at DESC`,
      {
        bind: [zoneId, status],
        type: QueryTypes.SELECT,
      },
    );

    return res.status(200).json({ zoneId, count: rows.length, reports: rows });
  } catch (error) {
    return next(error);
  }
};
