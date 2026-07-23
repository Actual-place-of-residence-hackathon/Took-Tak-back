# 뚝딱 백엔드 (Took-Tak-back)

AI 기반 교내 불편·시설 고장 신고 서비스의 백엔드입니다.
Node.js + Express + PostgreSQL(Sequelize) 구성입니다.

## 1. 스키마가 정본입니다

테이블 정의는 [`db/schema.sql`](db/schema.sql) 이 **유일한 정본**입니다.

`sequelize.sync()` 는 사용하지 않습니다. sync 를 켜면 SQL 파일에 없는 테이블과
`enum_reports_status` 같은 별도 ENUM 타입이 조용히 생겨 스키마가 갈라집니다.
서버는 기동 시 연결 확인(`authenticate()`)만 하고 스키마는 건드리지 않습니다.

## 2. 설치 및 실행

```bash
# 1) 스키마 적용 (최초 1회)
psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f db/schema.sql

# 2) 의존성 설치
npm ci

# 3) 환경변수 준비
cp .env.example .env      # 값 채우기

# 4) 배치도 기준 데이터 입력 (최초 1회)
node src/seed.js

# 5) 실행
npm run dev               # 개발 (nodemon)
npm start                 # 운영
```

기본 주소: `http://localhost:4000`

> `npm audit` 에 뜨는 `uuid` 경고 2건은 sequelize 하위 의존성입니다.
> v3/v5/v6 에 `buf` 를 넘길 때만 해당되어 이 프로젝트에는 영향이 없습니다.
> `npm audit fix --force` 는 sequelize 를 3.x 로 되돌리므로 **실행하지 마세요.**

### AWS 배포

위 내용은 로컬 실행 기준입니다. EC2 배포는 **[docs/AWS_DEPLOY.md](docs/AWS_DEPLOY.md)** 를 순서대로 따라가세요.

배포 전에 반드시 알아야 할 두 가지 (런북 1절):

1. **프론트엔드는 백엔드의 사설 IP 를 직접 못 부릅니다.** 백엔드가 private subnet 이라
   사용자 브라우저에서 닿지 않습니다. 프론트 EC2 의 nginx 가 `/api/*` 를 프록시해야 합니다.
   → [`deploy/nginx-frontend.conf`](deploy/nginx-frontend.conf)
2. **서울 리전에는 Bedrock Mantle 엔드포인트가 없습니다.** 도쿄(`ap-northeast-1`)를 쓰세요.

## 3. 환경변수

`.env.example` 참고. 아래 값이 하나라도 비면 서버가 기동을 거부합니다.

| 키 | 필수 | 설명 |
|---|---|---|
| `PORT` | | 기본 4000 |
| `DB_HOST` | ✅ | DB 전용 EC2 프라이빗 IP |
| `DB_PORT` | | 기본 5432 |
| `DB_NAME` | ✅ | |
| `DB_USER` | ✅ | |
| `DB_PASSWORD` | ✅ | |
| `JWT_SECRET` | ✅ | `openssl rand -hex 32` |
| `ADMIN_SIGNUP_CODE` | ✅ | 관리자 등록·로그인 초대 코드 |
| `AWS_REGION` | | Bedrock 리전. **서울(`ap-northeast-2`)은 안 됩니다** — 아래 참고 |
| `BEDROCK_MODEL_ID` | | 미설정 시 AI 분류만 건너뜁니다 (서버는 정상 기동) |
| `CORS_ORIGIN` | | 쉼표 구분. 비우면 전체 허용 |

> ⚠ **`AWS_REGION=ap-northeast-2` 는 동작하지 않습니다.**
> 서울·오사카에는 Bedrock Mantle 엔드포인트가 없어 `Connection error.` 만 뜹니다.
> 가장 가까운 곳은 도쿄(`ap-northeast-1`) 입니다. 상세: [docs/BEDROCK_HANDOFF.md](docs/BEDROCK_HANDOFF.md) 9절

## 4. ⚠ 인증에 대한 중요 안내

**팀 결정(2026-07-23)에 따라 로그인·비밀번호 인증은 구현하지 않았습니다.**

`/api/auth/*` 는 "누구로 동작할지" 식별만 하며 본인 확인을 하지 않습니다.
`reports.reporter_id`, `report_actions.admin_id` 등을 서버가 채우기 위한 최소 장치입니다.

그 결과 현재 상태에서는:

- 학번을 아는 사람은 누구나 그 학번으로 신고할 수 있습니다.
- 관리자 권한은 `ADMIN_SIGNUP_CODE` 하나로만 막혀 있습니다.

공개 인터넷에 노출하기 전에 팀 재확인이 필요합니다. (기능명세 17: 인증 방식 미정)

## 5. API

모든 `/api/*` 요청에 `Authorization: Bearer <token>` 이 필요합니다 (`/api/auth/*` 제외).

### 인증 `/api/auth`

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/login` | - | 학생 식별. `{ studentId, name? }` — 없으면 자동 생성 |
| POST | `/admin/signup` | - | 관리자 등록. `{ adminId, signupCode, name? }` |
| POST | `/admin/login` | - | 관리자 식별. `{ adminId, signupCode }` |

### 배치도 위치 `/api/locations`

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/tree` | 공통 | 건물→층→구역 전체 트리 |
| GET | `/buildings` | 공통 | 건물 목록 |
| GET | `/buildings/:buildingId/floors` | 공통 | 층 목록 |
| GET | `/floors/:floorId/zones` | 공통 | 구역 목록 |

### 신고 `/api/reports`

| 메서드 | 경로 | 권한 | 명세 | 설명 |
|---|---|---|---|---|
| POST | `/` | 공통 | C3 | 신고 등록. AI 분류는 **서버가 생성**하며 요청의 `ai_*` 는 무시 |
| GET | `/` | 공통 | A2/C5 | 목록. 학생은 본인 것만 |
| GET | `/:id` | 공통 | A5/C6 | 상세 + 타임라인 + AI 근거 + 조치 결과 |
| PATCH | `/:id/status` | 관리자 | A8 | 상태 변경 + 이력 기록 |
| PATCH | `/:id/classification` | 관리자 | A6 | 재분류. `ai_*` 원본은 보존 |
| POST | `/:id/action` | 관리자 | A9 | 조치 등록 + 자동 완료 |
| POST | `/merge` | 관리자 | A7 | 유사 신고 병합 |

`GET /api/reports` 쿼리 파라미터:

```
status      received | checking | processing | done | hold
urgency     high | medium | low
type        문자열
building_id / floor_id / zone_id
from / to   ISO 날짜 (created_at 범위)
sort        urgency(기본, 관리자) | latest(기본, 학생) | location
limit       기본 50, 최대 200
offset      기본 0
```

### 구역 `/api/zones`

| 메서드 | 경로 | 권한 | 명세 | 설명 |
|---|---|---|---|---|
| GET | `/pins` | 공통 | C1/A3 | 구역별 핀. 최고 긴급도 + 열린 건수 |
| GET | `/:zoneId/reports` | 공통 | C2/A4 | 구역 신고 목록. 학생에게는 `description` 미노출 |

### 통계 `/api/stats` (관리자 전용)

| 메서드 | 경로 | 명세 | 설명 |
|---|---|---|---|
| GET | `/summary` | A1 | 오늘 접수 / 긴급 미처리 / 처리중 / 오늘 완료 |
| GET | `/heatmap` | A10-a | 구역별 누적 신고 수 |
| GET | `/hotspots` | A10-b | `?threshold=3` 이상 몰린 구역 |

### 기타

- `GET /` — 동작 확인
- `GET /health` — DB 연결 포함 헬스체크 (EC2/로드밸런서용)

## 6. 폴더 구조

```text
Took-Tak/
├── db/
│   ├── schema.sql             # 스키마 정본
│   ├── queries.sql            # 기능명세 ↔ 쿼리 ↔ 엔드포인트 매핑 (참고용, 실행 대상 아님)
│   └── migrations/            # 기존 DB를 schema.sql 에 맞추는 마이그레이션
├── docs/AWS_DEPLOY.md         # AWS 배포 런북
├── docs/BEDROCK_HANDOFF.md    # Bedrock 연동 인수인계
├── deploy/                    # 배포 산출물 (systemd · nginx · IAM · 셋업 스크립트)
├── server.js                  # 진입점 (src/server.js 로딩)
└── src/
    ├── config/env.js          # 환경변수 검증 (누락 시 종료)
    ├── config/db.js           # Sequelize 인스턴스
    ├── models/                # 테이블 매핑 (schema.sql 과 1:1)
    ├── controllers/
    ├── routes/
    ├── middleware/
    │   ├── auth.middleware.js
    │   └── upload.middleware.js  # 로컬 디스크 저장. 아직 어떤 라우트에도 미연결
    └── utils/
        ├── aiService.js       # Bedrock 신고 분류 (텍스트만, 이미지는 8절 참고)
        ├── jwt.js
        └── validators.js
```

## 7. 남은 작업

- [x] Amazon Bedrock 연동 → [docs/BEDROCK_HANDOFF.md](docs/BEDROCK_HANDOFF.md)
- [x] **Bedrock 실제 호출 검증 완료** (2026-07-23, 2회) — `eu-west-1` 4케이스 + 도쿄 실제 신고 등록 API 2케이스, 전부 정상
- [x] **도쿄(`ap-northeast-1`) 모델 액세스 승인 확인** — `anthropic.claude-opus-4-8` 이미 `AUTHORIZED`
- [x] AWS 배포 산출물 (systemd / nginx / IAM / 셋업 스크립트) → [docs/AWS_DEPLOY.md](docs/AWS_DEPLOY.md)
- [x] 백엔드 전체 최종 검수 완료 (2026-07-23) — 구문·배선·E2E 69건 재검증, 민감정보 미노출 확인
- [ ] 백엔드 EC2 인스턴스 프로파일에 Bedrock IAM 권한 부착 — 배포 시 작업, [`deploy/iam-bedrock-policy.json`](deploy/iam-bedrock-policy.json) 참고
- [ ] 인증 방식 확정 (기능명세 17)
- [ ] HTTPS 적용 — 현재 nginx 는 80 포트만 받아 토큰이 평문으로 오갑니다
- [ ] 신고 유형 목록 / 긴급도 판단 기준 확정
- [ ] 이미지 업로드 라우트 연결 — `upload.middleware.js` 는 준비돼 있으나 미연결

범위에서 제외된 항목:

- 익명 신고 — 팀 결정(2026-07-23)으로 미구현. `reports.reporter_id` 는 NOT NULL 입니다.
- 로그인·비밀번호 인증 — 위 4번 참고.
