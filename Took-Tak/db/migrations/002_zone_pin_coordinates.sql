-- ============================================================================
-- 002. zones 테이블에 배치도 핀 좌표 추가
--
-- 배경: 프론트(Took-Tak-web)의 배치도 위치 선택 UX와 백엔드의 위치 계층
--   (building→floor→zone) 모델이 서로 다른 전제로 개발돼 있었습니다.
--   프론트는 이미지 위 임의 좌표 클릭(pinX/pinY), 백엔드는 관리자가 등록한
--   유한한 zone 목록. 팀 결정(2026-07-24)으로 zone 에 고정 좌표를 부여해
--   두 설계를 통일했습니다 — 학생은 이제 배치도의 zone 핀 중 하나를 탭해서
--   선택합니다.
--
-- 실행:
--   psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> \
--        -v ON_ERROR_STOP=1 -f db/migrations/002_zone_pin_coordinates.sql
-- ============================================================================

BEGIN;

ALTER TABLE zones ADD COLUMN IF NOT EXISTS pin_x NUMERIC(5,2);
ALTER TABLE zones ADD COLUMN IF NOT EXISTS pin_y NUMERIC(5,2);

DO $$ BEGIN
    ALTER TABLE zones ADD CONSTRAINT zones_pin_x_range
        CHECK (pin_x IS NULL OR (pin_x >= 0 AND pin_x <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE zones ADD CONSTRAINT zones_pin_y_range
        CHECK (pin_y IS NULL OR (pin_y >= 0 AND pin_y <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM zones WHERE pin_x IS NULL OR pin_y IS NULL;
    IF n > 0 THEN
        RAISE NOTICE '[확인] 좌표가 없는 zone %건. 프론트에서 해당 구역 핀이 안 보입니다. '
                     '관리자가 UPDATE zones SET pin_x=.., pin_y=.. WHERE id=.. 로 채워야 합니다.', n;
    END IF;
END $$;

COMMIT;
