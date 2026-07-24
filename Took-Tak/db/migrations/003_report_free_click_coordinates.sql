-- ============================================================================
--  003. reports: 자유 클릭 좌표 지원
--
--  기존 구조는 zone_id 기준 고정 구역 선택만 허용합니다.
--  자유 클릭 복귀를 위해 reports 에 좌표 컬럼을 추가하고,
--  zone_id 는 선택적(null 허용)으로 완화합니다.
--
--  실행:
--    psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> \
--         -v ON_ERROR_STOP=1 -f db/migrations/003_report_free_click_coordinates.sql
-- ============================================================================

BEGIN;

ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS pin_x NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS pin_y NUMERIC(5,2);

ALTER TABLE reports
    ALTER COLUMN zone_id DROP NOT NULL;

DO $$ BEGIN
    ALTER TABLE reports
        ADD CONSTRAINT reports_pin_x_range
        CHECK (pin_x IS NULL OR (pin_x >= 0 AND pin_x <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE reports
        ADD CONSTRAINT reports_pin_y_range
        CHECK (pin_y IS NULL OR (pin_y >= 0 AND pin_y <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
