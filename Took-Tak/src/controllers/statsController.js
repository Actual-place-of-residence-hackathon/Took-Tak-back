const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { parseId } = require('../utils/validators');

// COUNT() 는 bigint 라 pg 드라이버가 문자열로 돌려줍니다.
// 프론트에서 그대로 쓰면 "3" + 1 = "31" 같은 사고가 나므로 숫자로 바꿉니다.
function toNumber(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

// ---------------------------------------------------------------------------
// 1. 통합 대시보드 요약 카운터 (A1) — 관리자 전용
//    날짜 경계는 한국 시간 기준입니다. created_at 은 timestamptz 라
//    AT TIME ZONE 으로 변환한 뒤 날짜만 비교합니다.
// ---------------------------------------------------------------------------
exports.getSummary = async (req, res, next) => {
  try {
    const [row] = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date
               = (now()      AT TIME ZONE 'Asia/Seoul')::date
         ) AS today_received,
         COUNT(*) FILTER (
           WHERE urgency = 'high' AND status NOT IN ('done','hold')
         ) AS urgent_open,
         COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
         COUNT(*) FILTER (
           WHERE status = 'done'
             AND (updated_at AT TIME ZONE 'Asia/Seoul')::date
               = (now()      AT TIME ZONE 'Asia/Seoul')::date
         ) AS done_today
       FROM reports`,
      { type: QueryTypes.SELECT },
    );

    return res.status(200).json({
      today_received: toNumber(row.today_received),
      urgent_open: toNumber(row.urgent_open),
      processing_count: toNumber(row.processing_count),
      done_today: toNumber(row.done_today),
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 2. 통계 · 히트맵 (A10-a) — 관리자 전용
//    신고가 한 건도 없는 구역까지 0 으로 포함해야 히트맵이 비지 않으므로
//    reports 는 LEFT JOIN 입니다.
// ---------------------------------------------------------------------------
exports.getHeatmap = async (req, res, next) => {
  try {
    const rows = await sequelize.query(
      `SELECT z.id AS zone_id, z.name AS zone,
              z.pin_x, z.pin_y,
              f.id AS floor_id, f.name AS floor,
              b.id AS building_id, b.name AS building,
              COUNT(r.id) AS report_count
         FROM zones z
         JOIN floors    f ON f.id = z.floor_id
         JOIN buildings b ON b.id = f.building_id
    LEFT JOIN reports   r ON r.zone_id = z.id
        WHERE ($1::bigint IS NULL OR b.id = $1)
          AND ($2::bigint IS NULL OR f.id = $2)
        GROUP BY z.id, z.name, z.pin_x, z.pin_y, f.id, f.name, b.id, b.name
        ORDER BY COUNT(r.id) DESC, b.name, f.name, z.name`,
      {
        bind: [parseId(req.query.building_id), parseId(req.query.floor_id)],
        type: QueryTypes.SELECT,
      },
    );

    return res.status(200).json({
      zones: rows.map((row) => ({ ...row, report_count: toNumber(row.report_count) })),
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 3. 통계 · 다발 이슈 (A10-b) — 관리자 전용
//    동일 구역에 threshold 건 이상 쌓이면 별도 아이콘 표시 대상입니다.
//    기능명세 17에서 집계 단위가 미정이라 threshold 를 쿼리로 열어뒀습니다.
// ---------------------------------------------------------------------------
exports.getHotspots = async (req, res, next) => {
  try {
    const threshold = parseId(req.query.threshold) || 3;

    const rows = await sequelize.query(
      `SELECT z.id AS zone_id, z.name AS zone,
              f.name AS floor, b.name AS building,
              COUNT(r.id) AS report_count
         FROM zones z
         JOIN floors    f ON f.id = z.floor_id
         JOIN buildings b ON b.id = f.building_id
         JOIN reports   r ON r.zone_id = z.id
        GROUP BY z.id, z.name, f.name, b.name
       HAVING COUNT(r.id) >= $1
        ORDER BY COUNT(r.id) DESC`,
      { bind: [threshold], type: QueryTypes.SELECT },
    );

    return res.status(200).json({
      threshold,
      zones: rows.map((row) => ({ ...row, report_count: toNumber(row.report_count) })),
    });
  } catch (error) {
    return next(error);
  }
};
