-- ============================================================================
--  001. 기존 DB → db/schema.sql 정합
--
--  이미 구 스키마를 적용해 운영 중인 DB 를 새 스키마와 맞춥니다.
--  데이터를 보존하지 않아도 된다면 이 파일 대신 아래가 훨씬 간단합니다:
--
--      DROP SCHEMA public CASCADE; CREATE SCHEMA public;
--      psql ... -f db/schema.sql
--      node src/seed.js
--
--  실행:
--      psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> \
--           -v ON_ERROR_STOP=1 -f db/migrations/001_align_with_schema.sql
--
--  전체가 하나의 트랜잭션입니다. 중간에 실패하면 아무것도 반영되지 않습니다.
--  실행 전 백업을 권합니다:
--      pg_dump -h <DB_HOST> -U <DB_USER> <DB_NAME> > backup_$(date +%F).sql
--
--  ⚠ 데이터 변경이 두 군데 있습니다. 로그(NOTICE)로 건수가 출력됩니다.
--    1) 위치 계층이 깨진 신고 → zone_id 기준으로 building_id/floor_id 재계산
--    2) 원본 사진 4장 이상 → sort_order 재부여 후 3장 초과분 삭제
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. users: 로그인 식별자 분리
--    구 스키마는 학번을 email(NOT NULL UNIQUE)에 넣어 쓰고 있었습니다.
--    login_id 로 옮기고 email 은 선택 입력으로 완화합니다.
-- ----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id TEXT;

UPDATE users SET login_id = email WHERE login_id IS NULL;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM users WHERE login_id IS NULL OR login_id = '';
    IF n > 0 THEN
        RAISE EXCEPTION 'login_id 를 채울 수 없는 사용자 % 명. email 이 비어 있습니다.', n;
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN login_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN email   DROP NOT NULL;

DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT users_login_id_key UNIQUE (login_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 2. reports: AI 요약 컬럼 추가 (기능명세 8.1)
-- ----------------------------------------------------------------------------
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_summary TEXT;


-- ----------------------------------------------------------------------------
-- 3. floors / zones: 복합 외래키가 참조할 UNIQUE 추가
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    ALTER TABLE floors ADD CONSTRAINT floors_id_building_id_key UNIQUE (id, building_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE zones ADD CONSTRAINT zones_id_floor_id_key UNIQUE (id, floor_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 4. reports: 위치 계층 정합성
--
--    구 스키마는 building/floor/zone 을 각각 따로만 검사해서
--    "금남관 + 본관의 행정실" 같은 조합이 들어갈 수 있었습니다.
--    zone_id 가 가장 구체적인 값이므로 그것을 기준으로 나머지를 재계산합니다.
--    (배치도 핀·히트맵이 모두 zone_id 를 씁니다)
-- ----------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    WITH fixed AS (
        UPDATE reports r
           SET floor_id    = z.floor_id,
               building_id = f.building_id
          FROM zones z
          JOIN floors f ON f.id = z.floor_id
         WHERE z.id = r.zone_id
           AND (r.floor_id <> z.floor_id OR r.building_id <> f.building_id)
        RETURNING r.id
    )
    SELECT count(*) INTO n FROM fixed;

    IF n > 0 THEN
        RAISE NOTICE '[수정] 위치 계층이 깨진 신고 %건을 zone_id 기준으로 재계산했습니다.', n;
    END IF;
END $$;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_floor_id_fkey;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_zone_id_fkey;

DO $$ BEGIN
    ALTER TABLE reports ADD CONSTRAINT reports_floor_id_building_id_fkey
        FOREIGN KEY (floor_id, building_id) REFERENCES floors(id, building_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE reports ADD CONSTRAINT reports_zone_id_floor_id_fkey
        FOREIGN KEY (zone_id, floor_id) REFERENCES zones(id, floor_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 5. report_photos: 트리거 → 제약으로 교체
--
--    구 트리거(COUNT 기반)는 한 문장 안에서는 동작하지만 동시 트랜잭션에는
--    무력합니다. 서로 커밋 전 행을 못 세기 때문에 각각 2장씩 넣으면 4장이 됩니다.
--    자리 자체를 3개(sort_order 0~2)로 제한하면 동시성과 무관하게 막힙니다.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS limit_report_photos ON report_photos;
DROP FUNCTION IF EXISTS trg_limit_report_photos();

-- 5-1. sort_order 재부여 (중복·구멍 정리)
WITH renumbered AS (
    SELECT id,
           (ROW_NUMBER() OVER (PARTITION BY report_id, kind
                                   ORDER BY sort_order, id) - 1)::smallint AS new_order
      FROM report_photos
)
UPDATE report_photos p
   SET sort_order = r.new_order
  FROM renumbered r
 WHERE p.id = r.id AND p.sort_order IS DISTINCT FROM r.new_order;

-- 5-2. 원본 사진 3장 초과분 삭제 (재부여 후 sort_order 3 이상)
DO $$
DECLARE n int;
BEGIN
    WITH removed AS (
        DELETE FROM report_photos
         WHERE kind = 'report' AND sort_order > 2
        RETURNING id
    )
    SELECT count(*) INTO n FROM removed;

    IF n > 0 THEN
        RAISE NOTICE '[삭제] 3장 제한을 초과한 원본 사진 %건을 제거했습니다.', n;
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE report_photos ADD CONSTRAINT report_photos_order_nonneg
        CHECK (sort_order >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE report_photos ADD CONSTRAINT report_photos_max_3_report
        CHECK (kind <> 'report' OR sort_order <= 2);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE report_photos ADD CONSTRAINT report_photos_slot_unique
        UNIQUE (report_id, kind, sort_order);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 6. updated_at 자동 갱신 트리거
--    A1 대시보드의 "오늘 완료" 집계가 여기 의존합니다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reports_set_updated_at ON reports;
CREATE TRIGGER reports_set_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ----------------------------------------------------------------------------
-- 7. 인덱스 정비
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reports_group  ON reports(group_id);
CREATE INDEX IF NOT EXISTS idx_reports_type   ON reports(type);
CREATE INDEX IF NOT EXISTS idx_actions_report ON report_actions(report_id);

-- 정렬 컬럼을 포함하도록 교체
DROP INDEX IF EXISTS idx_history_report;
CREATE INDEX idx_history_report ON report_status_history(report_id, changed_at);

DROP INDEX IF EXISTS idx_photos_report;
CREATE INDEX idx_photos_report ON report_photos(report_id, kind, sort_order);


-- ----------------------------------------------------------------------------
-- 8. 마스킹 뷰 교체
--    구 뷰는 description 을 그대로 노출했습니다.
--    신고자가 본문에 자신을 드러낼 수 있어 마스킹 목적에 어긋납니다.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS reports_masked;
CREATE VIEW reports_masked AS
SELECT r.id,
       r.building_id, r.floor_id, r.zone_id, r.part,
       r.status, r.type, r.urgency,
       r.created_at, r.updated_at
FROM reports r;


COMMIT;
