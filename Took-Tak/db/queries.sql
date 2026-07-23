-- ============================================================================
--  뚝딱 — 기능명세 ↔ 쿼리 ↔ API 엔드포인트 매핑
--
--  ※ 이 파일은 참고용 카탈로그입니다. psql -f 로 실행하지 마세요.
--    $1 같은 파라미터가 들어있어 그대로 실행하면 에러가 납니다.
--    스키마 적용은 db/schema.sql 을 쓰세요.
--
--  ※ 백엔드는 성격에 따라 두 방식을 나눠 씁니다.
--    - 단순 CRUD / 연관 로딩  → Sequelize 모델
--    - 집계·다중 옵션 필터     → 아래 원시 SQL (sequelize.query + bind)
--
--  ※ 바인드는 반드시 $1 스타일을 씁니다.
--    Sequelize 의 :name replacements 는 PostgreSQL 캐스트(::type)의 콜론과
--    충돌해 $1::bigint 같은 표현을 깨뜨립니다.
-- ============================================================================


-- ============================================================
--  [CLIENT] 학생용
-- ============================================================

-- ----------------------------------------------------------------------------
-- C1. 배치도 뷰 · 구역 핀 표시          → GET /api/zones/pins
--     (관리자 A3 위험도 시각화와 동일 쿼리를 공유합니다)
--
--     ※ urgency_level 은 high→medium→low 순으로 선언돼 있어
--       MIN() 이 곧 "그 구역에서 가장 급한 건"입니다.
--       PostgreSQL 은 min(anyenum)/max(anyenum) 집계를 제공합니다.
-- ----------------------------------------------------------------------------
SELECT z.id   AS zone_id,     z.name AS zone,
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
 GROUP BY z.id, z.name, f.id, f.name, b.id, b.name
 ORDER BY MIN(r.urgency) ASC NULLS LAST, COUNT(*) DESC;


-- ----------------------------------------------------------------------------
-- C2. 중복 안내 표시 / A4. 핀 클릭 상세 → GET /api/zones/:zoneId/reports
--
--     $2 가 NULL 이면 완료 제외 전체(A4), 값이 있으면 해당 상태만(C2).
--     ※ description 컬럼은 관리자에게만 내보냅니다.
--       학생 요청이면 백엔드가 NULL::text 로 치환합니다. (기능명세 13)
-- ----------------------------------------------------------------------------
SELECT r.id, r.type, r.urgency, r.status, r.created_at,
       r.description                        -- 학생 요청 시 NULL::text
  FROM reports r
 WHERE r.zone_id = $1
   AND ($2::report_status IS NULL OR r.status = $2)
   AND ($2::report_status IS NOT NULL OR r.status <> 'done')
 ORDER BY r.urgency ASC NULLS LAST, r.created_at DESC;


-- ----------------------------------------------------------------------------
-- C3. 신고 등록                          → POST /api/reports
--
--     ※ 백엔드는 이 writable CTE 대신 sequelize.transaction() 안에서
--       Report.create → ReportPhoto.bulkCreate → History.create 를 실행합니다.
--       원자성은 동일하게 보장되며, AI 결과를 서버에서 만들어 넣어야 해서
--       절차적 코드가 더 맞습니다.
--
--     ※ ai_* 값은 절대 클라이언트 입력을 쓰지 않습니다. (기능명세 16-10)
--       서버가 aiService.analyzeReport() 로 생성합니다.
--
--     ※ 사진은 sort_order 0,1,2 만 허용됩니다. 4장째는 스키마가 막습니다.
-- ----------------------------------------------------------------------------
WITH new_report AS (
  INSERT INTO reports
    (reporter_id, building_id, floor_id, zone_id, part, description,
     type, urgency, ai_type, ai_urgency, ai_summary, ai_reasoning, ai_suggested_action)
  VALUES
    ($1, $2, $3, $4, $5, $6,
     $7, $8, $7, $8, $9, $10, $11)     -- 최종값 = AI값으로 초기화 (A6 으로 수정 가능)
  RETURNING id
),
ins_photos AS (
  INSERT INTO report_photos (report_id, url, kind, sort_order)
  SELECT nr.id, v.url, 'report', v.ord
    FROM new_report nr,
         (VALUES ($12::text, 0::smallint),
                 ($13::text, 1::smallint),
                 ($14::text, 2::smallint)) AS v(url, ord)
   WHERE v.url IS NOT NULL
)
INSERT INTO report_status_history (report_id, from_status, to_status, changed_by)
SELECT id, NULL, 'received', $1 FROM new_report;


-- ----------------------------------------------------------------------------
-- C4. AI 분석 결과 나중 입력 (재분석/지연 처리용)
--     ※ 현재 엔드포인트 없음. Bedrock 을 비동기로 돌릴 때 사용합니다.
--       기능명세 9.4(AI 실패 시 처리 방식)가 확정되면 붙일 자리입니다.
-- ----------------------------------------------------------------------------
UPDATE reports
   SET ai_type = $2, ai_urgency = $3, ai_summary = $4,
       ai_reasoning = $5, ai_suggested_action = $6,
       type    = COALESCE(type, $2),      -- 관리자가 아직 안 고쳤으면 AI값 반영
       urgency = COALESCE(urgency, $3)
 WHERE id = $1;
--  ※ updated_at 은 트리거가 자동 갱신하므로 SET 하지 않습니다.


-- ----------------------------------------------------------------------------
-- C5. 내 신고 목록 (카드형)              → GET /api/reports
-- A2. 리스트 뷰 · 우선순위 정렬 + 다중 필터
--
--     두 기능은 같은 쿼리입니다. 학생 토큰이면 $1 에 본인 id 가 강제로 들어가고,
--     관리자면 $1 이 NULL 이라 전체가 조회됩니다.
--
--     ※ ORDER BY 는 바인드할 수 없어 백엔드가 화이트리스트에서 고른
--       문자열만 끼워 넣습니다. (SORT_OPTIONS: urgency | latest | location)
-- ----------------------------------------------------------------------------
SELECT r.id, r.type, r.urgency, r.status, r.part, r.description,
       r.created_at, r.updated_at, r.group_id,
       b.id AS building_id, b.name AS building,
       f.id AS floor_id,    f.name AS floor,
       z.id AS zone_id,     z.name AS zone,
       (SELECT p.url FROM report_photos p
         WHERE p.report_id = r.id AND p.kind = 'report'
         ORDER BY p.sort_order LIMIT 1) AS thumbnail
  FROM reports r
  JOIN buildings b ON b.id = r.building_id
  JOIN floors    f ON f.id = r.floor_id
  JOIN zones     z ON z.id = r.zone_id
 WHERE ($1::bigint        IS NULL OR r.reporter_id = $1)   -- 학생이면 본인 고정
   AND ($2::text          IS NULL OR r.type        = $2)
   AND ($3::urgency_level IS NULL OR r.urgency     = $3)
   AND ($4::bigint        IS NULL OR r.building_id = $4)
   AND ($5::bigint        IS NULL OR r.floor_id    = $5)
   AND ($6::bigint        IS NULL OR r.zone_id     = $6)
   AND ($7::report_status IS NULL OR r.status      = $7)
   AND ($8::timestamptz   IS NULL OR r.created_at >= $8)
   AND ($9::timestamptz   IS NULL OR r.created_at <  $9)
 ORDER BY r.urgency ASC NULLS LAST, r.created_at DESC      -- ← 화이트리스트 치환부
 LIMIT $10 OFFSET $11;


-- ----------------------------------------------------------------------------
-- C6 / A5. 신고 상세                     → GET /api/reports/:id
--     백엔드는 Sequelize include 로 한 번에 로딩합니다.
--     아래는 같은 결과를 내는 원시 SQL 형태입니다.
-- ----------------------------------------------------------------------------

-- C6-a. 처리 타임라인
SELECT from_status, to_status, reason, changed_by, changed_at
  FROM report_status_history
 WHERE report_id = $1
 ORDER BY changed_at;

-- C6-b. AI 분석 근거 (원본과 최종값을 나란히)
SELECT type, urgency,
       ai_type, ai_urgency, ai_summary, ai_reasoning, ai_suggested_action
  FROM reports WHERE id = $1;

-- C6-c. 조치 결과 + 조치 후 사진
--     ※ 이전 버전은 report_photos 를 report_id 로만 조인해서, 조치가 2건 이상이면
--       같은 사진이 모든 조치에 중복으로 붙었습니다.
--       사진은 신고 단위라서 조치별로 나눌 수 없으므로 따로 조회합니다.
SELECT a.id, a.content, a.admin_id, a.created_at
  FROM report_actions a
 WHERE a.report_id = $1
 ORDER BY a.created_at;

SELECT url, sort_order
  FROM report_photos
 WHERE report_id = $1 AND kind = 'action'
 ORDER BY sort_order;

-- A5. 원본 데이터 (학생이 등록한 원본 사진/텍스트)
SELECT r.description, r.part, r.created_at,
       COALESCE(
         json_agg(json_build_object('url', p.url, 'order', p.sort_order)
                  ORDER BY p.sort_order) FILTER (WHERE p.id IS NOT NULL),
         '[]'
       ) AS photos
  FROM reports r
  LEFT JOIN report_photos p ON p.report_id = r.id AND p.kind = 'report'
 WHERE r.id = $1
 GROUP BY r.id, r.description, r.part, r.created_at;


-- ============================================================
--  [ADMIN] 관리자용
-- ============================================================

-- ----------------------------------------------------------------------------
-- A1. 통합 대시보드 요약 카운터          → GET /api/stats/summary
--     날짜 경계는 한국 시간 기준입니다.
--     ※ done_today 는 updated_at 에 의존합니다. schema.sql 의
--       reports_set_updated_at 트리거가 값을 보장합니다.
--     ※ COUNT() 는 bigint 라 드라이버가 문자열로 돌려줍니다. 백엔드에서 Number() 변환.
-- ----------------------------------------------------------------------------
SELECT
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
FROM reports;


-- ----------------------------------------------------------------------------
-- A3. 배치도 뷰 · 위험도 시각화          → GET /api/zones/pins   (C1 과 동일)
-- A4. 핀 클릭 상세                       → GET /api/zones/:zoneId/reports (C2 참고)
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- A6. 재분류 · 수동 오버라이드           → PATCH /api/reports/:id/classification
--     ai_* 컬럼은 건드리지 않습니다. AI 원본과 사람 수정본을 모두 보존합니다.
-- ----------------------------------------------------------------------------
UPDATE reports
   SET type = $2, urgency = $3
 WHERE id = $1;


-- ----------------------------------------------------------------------------
-- A7. 유사 신고 묶음 · 병합 처리         → POST /api/reports/merge
--     ※ 백엔드는 트랜잭션 안에서 먼저 모든 id 의 존재를 확인한 뒤 그룹을 만듭니다.
--       없는 id 가 섞이면 그룹 생성까지 통째로 롤백됩니다.
-- ----------------------------------------------------------------------------
WITH g AS (
  INSERT INTO report_groups (note, created_by)
  VALUES ($1, $2) RETURNING id
)
UPDATE reports
   SET group_id = (SELECT id FROM g)
 WHERE id = ANY($3::bigint[]);


-- ----------------------------------------------------------------------------
-- A8. 상태 변경 + 이력 기록              → PATCH /api/reports/:id/status
--
--     ※ 이전 버전은 from_status 를 클라이언트가 $3 로 넘겼습니다.
--       관리자 두 명이 동시에 바꾸면 이력이 어긋납니다.
--       백엔드는 SELECT ... FOR UPDATE 로 행을 잠그고 실제 이전 상태를 읽습니다.
--       아래는 같은 동작을 한 문장으로 표현한 형태입니다.
-- ----------------------------------------------------------------------------
WITH prev AS (
  SELECT id, status FROM reports WHERE id = $1 FOR UPDATE   -- 행을 잠그고 이전 상태를 읽음
),
upd AS (
  UPDATE reports r SET status = $2
    FROM prev
   WHERE r.id = prev.id
  RETURNING r.id, prev.status AS from_status
)
INSERT INTO report_status_history (report_id, from_status, to_status, reason, changed_by)
SELECT id, from_status, $2, $3, $4 FROM upd;


-- ----------------------------------------------------------------------------
-- A9. 조치 결과 등록 + 자동 완료         → POST /api/reports/:id/action
--     백엔드는 트랜잭션으로 처리합니다:
--       ReportAction.create → 조치사진 bulkCreate → status='done' → 이력 기록
--     ※ 조치 후 사진의 sort_order 는 기존 action 사진 개수부터 이어붙입니다.
--       (조치가 2회 이상 등록될 수 있어 0 고정이면 UNIQUE 제약에 걸립니다)
-- ----------------------------------------------------------------------------
WITH act AS (
  INSERT INTO report_actions (report_id, content, admin_id)
  VALUES ($1, $2, $3) RETURNING report_id
),
ph AS (
  INSERT INTO report_photos (report_id, url, kind, sort_order)
  SELECT $1, $4, 'action',
         COALESCE((SELECT MAX(sort_order) + 1 FROM report_photos
                    WHERE report_id = $1 AND kind = 'action'), 0)
   WHERE $4::text IS NOT NULL
),
hist AS (
  INSERT INTO report_status_history (report_id, from_status, to_status, reason, changed_by)
  VALUES ($1, $5, 'done', '조치 완료', $3)
)
UPDATE reports SET status = 'done' WHERE id = $1;


-- ----------------------------------------------------------------------------
-- A10-a. 통계 · 히트맵                   → GET /api/stats/heatmap
--        신고 0건 구역도 표시해야 하므로 reports 는 LEFT JOIN 입니다.
-- ----------------------------------------------------------------------------
SELECT z.id AS zone_id, z.name AS zone,
       f.id AS floor_id, f.name AS floor,
       b.id AS building_id, b.name AS building,
       COUNT(r.id) AS report_count
  FROM zones z
  JOIN floors    f ON f.id = z.floor_id
  JOIN buildings b ON b.id = f.building_id
  LEFT JOIN reports r ON r.zone_id = z.id
 WHERE ($1::bigint IS NULL OR b.id = $1)
   AND ($2::bigint IS NULL OR f.id = $2)
 GROUP BY z.id, z.name, f.id, f.name, b.id, b.name
 ORDER BY COUNT(r.id) DESC, b.name, f.name, z.name;


-- ----------------------------------------------------------------------------
-- A10-b. 통계 · 다발 이슈                → GET /api/stats/hotspots?threshold=3
--        기능명세 17에서 집계 단위가 미정이라 임계값을 파라미터로 열어뒀습니다.
-- ----------------------------------------------------------------------------
SELECT z.id AS zone_id, z.name AS zone,
       f.name AS floor, b.name AS building,
       COUNT(r.id) AS report_count
  FROM zones z
  JOIN floors    f ON f.id = z.floor_id
  JOIN buildings b ON b.id = f.building_id
  JOIN reports   r ON r.zone_id = z.id
 GROUP BY z.id, z.name, f.name, b.name
HAVING COUNT(r.id) >= $1
 ORDER BY COUNT(r.id) DESC;


-- ============================================================
--  [기타] 배치도 위치 조회  → GET /api/locations/*
--  기능명세 6(건물→층→구역 선택)에 필요합니다.
--  신고 등록이 building_id/floor_id/zone_id 를 요구하므로 필수입니다.
-- ============================================================
SELECT id, name FROM buildings ORDER BY name;
SELECT id, name, building_id FROM floors WHERE building_id = $1 ORDER BY name;
SELECT id, name, floor_id    FROM zones  WHERE floor_id    = $1 ORDER BY name;
