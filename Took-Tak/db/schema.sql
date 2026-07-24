-- ============================================================================
--  뚝딱 — AI 기반 교내 불편·시설 고장 신고 서비스
--  PostgreSQL 스키마 (DDL)
--
--  적용:  psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f db/schema.sql
--
--  ※ 이 파일이 스키마의 유일한 정본입니다.
--    백엔드는 sequelize.sync() 를 쓰지 않습니다. sync 를 켜면 여기 없는 테이블과
--    enum_reports_status 같은 별도 ENUM 타입이 생겨 스키마가 갈라집니다.
--  ※ 조회/변경 쿼리는 db/queries.sql 에 따로 있습니다.
--    이 파일에 섞으면 psql -f 실행 시 $1 파라미터 때문에 에러가 납니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ENUM 타입
--    ※ ENUM 은 선언 순서가 곧 정렬 순서입니다.
--      urgency_level 을 high→medium→low 로 선언했으므로
--      ORDER BY urgency ASC 가 "긴급도 높은 순"이 되고,
--      MIN(urgency) 가 "그 구역에서 가장 급한 건"이 됩니다.
--      (PostgreSQL 은 min(anyenum)/max(anyenum) 집계를 제공합니다)
-- ----------------------------------------------------------------------------
CREATE TYPE report_status AS ENUM ('received','checking','processing','done','hold');
--        접수 / 확인중 / 처리중 / 완료 / 보류
CREATE TYPE urgency_level AS ENUM ('high','medium','low');
--        상(빨강) / 중(주황) / 하(초록)
CREATE TYPE user_role     AS ENUM ('student','admin');
CREATE TYPE photo_kind    AS ENUM ('report','action');
--        원본 사진 / 조치 후 사진


-- ----------------------------------------------------------------------------
-- 1. 사용자
--
--    ⚠ 팀 결정(2026-07-23): 로그인·비밀번호 인증은 구현하지 않습니다.
--      따라서 password_hash 컬럼이 없습니다.
--      login_id 는 "누가 신고했는지" 기록용 식별자이며 본인 확인 수단이 아닙니다.
--      인증 방식이 확정되면(기능명세 17) 컬럼 추가가 필요합니다.
--
--    ※ 이전 스키마는 학번을 email(NOT NULL UNIQUE)에 넣어 쓰고 있었습니다.
--      식별자와 이메일을 분리했습니다.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login_id   TEXT        NOT NULL UNIQUE,   -- 학번 또는 관리자 ID
    name       TEXT        NOT NULL,
    email      TEXT        UNIQUE,            -- 선택 입력
    role       user_role   NOT NULL DEFAULT 'student',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 2. 배치도 위치 계층: 건물 → 층 → 구역
--    부위는 reports.part 로 자유 입력합니다.
--
--    ※ UNIQUE (id, ...) 는 중복처럼 보이지만 reports 의 복합 외래키가
--      참조할 대상이라 반드시 필요합니다. (아래 4번 참고)
-- ----------------------------------------------------------------------------
CREATE TABLE buildings (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE              -- 예: 금남관, 대현관, 본관
);

CREATE TABLE floors (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    building_id BIGINT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name        TEXT   NOT NULL,           -- 예: 1F, 지하1층
    UNIQUE (building_id, name),
    UNIQUE (id, building_id)               -- 복합 FK 대상
);

-- ⚠ 팀 결정(2026-07-24): 학생이 배치도 위 임의 좌표를 찍는 방식(pinX/pinY 연속값)
--   대신, 관리자가 미리 지정해둔 zone 의 고정 좌표 중 하나를 선택하는 방식으로
--   통일했습니다. 프론트 PinMap 은 자유 클릭이 아니라 zone hotspot 선택 UI 로 동작합니다.
--   이 결정 덕분에 히트맵(A10)·핀(C1/A3)이 좌표 클러스터링 없이 zone_id 로 집계됩니다.
CREATE TABLE zones (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    floor_id BIGINT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    name     TEXT   NOT NULL,              -- 구획(배치도 핀·히트맵의 최소 단위)
    -- 배치도 이미지(public/floor-plans/*.png) 위 핀 위치. 0~100 사이 퍼센트값.
    -- NULL 이면 프론트가 해당 zone 의 핀을 표시하지 못하므로, 관리자가 등록 시
    -- 반드시 채워야 합니다.
    pin_x    NUMERIC(5,2) CHECK (pin_x IS NULL OR (pin_x >= 0 AND pin_x <= 100)),
    pin_y    NUMERIC(5,2) CHECK (pin_y IS NULL OR (pin_y >= 0 AND pin_y <= 100)),
    UNIQUE (floor_id, name),
    UNIQUE (id, floor_id)                  -- 복합 FK 대상
);


-- ----------------------------------------------------------------------------
-- 3. 유사 신고 묶음(병합 그룹) — 관리자 "병합 처리"
-- ----------------------------------------------------------------------------
CREATE TABLE report_groups (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    note       TEXT,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 4. 신고 (핵심 테이블)
--
--    ※ 위치 정합성:
--      building_id / floor_id / zone_id 를 모두 들고 있으면 조회는 빠르지만
--      서로 안 맞는 조합(다른 건물의 zone)이 들어갈 수 있습니다.
--      복합 외래키로 zone → floor → building 계층을 DB 가 직접 강제합니다.
--
--    ※ 팀 결정(2026-07-23): 익명 신고는 구현하지 않습니다.
--      따라서 reporter_id 는 NOT NULL 이며 모든 신고에 신고자가 붙습니다.
--      (기능명세 8.2 는 "가능하면 구현" 항목이었으며 범위에서 제외되었습니다)
-- ----------------------------------------------------------------------------
CREATE TABLE reports (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reporter_id  BIGINT NOT NULL REFERENCES users(id),

    building_id  BIGINT NOT NULL,
    floor_id     BIGINT NOT NULL,
    zone_id      BIGINT,                                -- 자유 클릭 좌표 모드에서는 NULL 허용
    pin_x        NUMERIC(5,2) CHECK (pin_x IS NULL OR (pin_x >= 0 AND pin_x <= 100)),
    pin_y        NUMERIC(5,2) CHECK (pin_y IS NULL OR (pin_y >= 0 AND pin_y <= 100)),
    part         TEXT,                                  -- 부위(자유 입력)
    description  VARCHAR(500),                          -- 상세 설명(최대 500자)

    status       report_status NOT NULL DEFAULT 'received',

    -- 최종 분류 (관리자 수정 가능) --------------------------------------------
    type         TEXT,                                  -- 유형(최종)
    urgency      urgency_level,                         -- 긴급도(최종)

    -- AI 원본 분류 (수정 전 근거 보존) ----------------------------------------
    ai_type              TEXT,
    ai_urgency           urgency_level,
    ai_summary           TEXT,                          -- 신고 내용 요약 (기능명세 8.1)
    ai_reasoning         TEXT,                          -- 판단 근거
    ai_suggested_action  TEXT,                          -- AI 제안 조치

    group_id     BIGINT REFERENCES report_groups(id) ON DELETE SET NULL,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    FOREIGN KEY (building_id)          REFERENCES buildings(id),
    FOREIGN KEY (floor_id, building_id) REFERENCES floors(id, building_id),
    FOREIGN KEY (zone_id, floor_id)     REFERENCES zones(id, floor_id)
);


-- ----------------------------------------------------------------------------
-- 5. 사진 (원본 최대 3장 + 조치 후 사진)
--
--    ※ 원본 3장 제한을 트리거가 아니라 제약으로 겁니다.
--      이전 스키마의 BEFORE INSERT 트리거는 SELECT COUNT(*) 로 세는 방식이었습니다.
--      한 문장 안에서는 정상 동작하지만(PL/pgSQL 이 쿼리 실행 전 command counter 를
--      올리므로 같은 문장이 넣은 행도 보입니다), 동시 트랜잭션에는 무력합니다.
--      각 트랜잭션이 상대가 아직 커밋하지 않은 행을 못 세기 때문입니다.
--      실측: 두 트랜잭션이 각각 2장씩 넣으면 제한을 넘겨 4장이 저장됩니다.
--
--      sort_order 를 0~2 로 제한하고 (report_id, kind, sort_order) 를 UNIQUE 로
--      잠그면 자리 자체가 3개뿐이라 동시성과 무관하게 4장째가 불가능합니다.
--      (UNIQUE 인덱스는 커밋 전 행도 충돌로 잡습니다)
-- ----------------------------------------------------------------------------
CREATE TABLE report_photos (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_id  BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    url        TEXT   NOT NULL,             -- S3 객체 URL 등
    kind       photo_kind NOT NULL DEFAULT 'report',
    sort_order SMALLINT   NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT report_photos_order_nonneg CHECK (sort_order >= 0),
    CONSTRAINT report_photos_max_3_report CHECK (kind <> 'report' OR sort_order <= 2),
    CONSTRAINT report_photos_slot_unique  UNIQUE (report_id, kind, sort_order)
);


-- ----------------------------------------------------------------------------
-- 6. 상태 변경 이력 → 신고 상세의 "처리 타임라인"
-- ----------------------------------------------------------------------------
CREATE TABLE report_status_history (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_id   BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    from_status report_status,              -- 최초 접수 시 NULL
    to_status   report_status NOT NULL,
    reason      TEXT,                       -- 상태 변경 사유
    changed_by  BIGINT REFERENCES users(id),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 7. 조치 결과
--    조치 후 사진은 report_photos(kind='action') 에 저장합니다.
--    UNIQUE 가 없으므로 한 신고에 조치가 여러 번 등록될 수 있습니다.
-- ----------------------------------------------------------------------------
CREATE TABLE report_actions (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_id  BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    content    TEXT   NOT NULL,             -- 조치 내용(필수)
    admin_id   BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 8. updated_at 자동 갱신
--    A1 대시보드의 "오늘 완료" 집계가 updated_at 에 의존합니다.
--    애플리케이션이 한 곳에서라도 빠뜨리면 통계가 틀어지므로 DB 가 보장합니다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reports_set_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ----------------------------------------------------------------------------
-- 9. 인덱스 (자주 필터/정렬/조인하는 컬럼)
--    ※ PRIMARY KEY / UNIQUE 는 인덱스를 자동 생성하므로 중복 정의하지 않습니다.
-- ----------------------------------------------------------------------------
CREATE INDEX idx_reports_status    ON reports(status);
CREATE INDEX idx_reports_urgency   ON reports(urgency);
CREATE INDEX idx_reports_zone      ON reports(zone_id);
CREATE INDEX idx_reports_created   ON reports(created_at DESC);
CREATE INDEX idx_reports_reporter  ON reports(reporter_id);
CREATE INDEX idx_reports_bld_floor ON reports(building_id, floor_id);
CREATE INDEX idx_reports_group     ON reports(group_id);          -- A7 병합 조회
CREATE INDEX idx_reports_type      ON reports(type);              -- A2 유형 필터

CREATE INDEX idx_history_report    ON report_status_history(report_id, changed_at);
CREATE INDEX idx_actions_report    ON report_actions(report_id);  -- C6-c 조치 조회
CREATE INDEX idx_photos_report     ON report_photos(report_id, kind, sort_order);


-- ----------------------------------------------------------------------------
-- 10. 개인정보 마스킹 뷰
--     권한 낮은 조회용. 신고자 식별 정보를 노출하지 않습니다.
--     ※ description 에는 신고자가 자신을 드러내는 내용을 쓸 수 있어
--       이 뷰에서도 제외했습니다. (이전 버전은 description 을 그대로 노출)
--     ※ 현재 백엔드는 zoneController 에서 역할별로 컬럼을 걸러내고 있어
--       이 뷰를 사용하지 않습니다. 별도 조회 권한이 생길 때를 위한 정의입니다.
-- ----------------------------------------------------------------------------
CREATE VIEW reports_masked AS
SELECT r.id,
       r.building_id, r.floor_id, r.zone_id, r.part,
       r.status, r.type, r.urgency,
       r.created_at, r.updated_at
FROM reports r;
