# Took-Tak Backend (Local Mock API)

이 저장소는 현재 기능명세서 기준으로 남은 신고 기능만 동작시키는 로컬 mock 백엔드입니다.

- 실제 DB 연결은 아직 안 붙어 있고, 로컬에서 프론트 연동을 확인하기 위한 임시 데이터 구조로 동작합니다.
- 인증/회원가입 계열 기능은 현재 기능 범위에서 제외되어 있습니다.
- 나중에 DB와 프론트가 준비되면, 이 구조를 그대로 유지한 채 데이터 저장소만 실제 DB로 교체하면 됩니다.

## 1. 설치

프로젝트 루트에서 아래 명령을 실행합니다.

```bash
npm install
```

## 2. 실행 방법

현재 루트 경로에서 아래 명령으로 서버를 실행할 수 있습니다.

```bash
npm run dev
```

실행 후 로컬 주소는 아래와 같습니다.

- http://localhost:4001

## 3. 환경변수

현재 사용 중인 .env 예시는 아래 형태입니다.

```env
PORT=4001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Took-Tak
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=super_secret_jwt_key_for_took_tak
ADMIN_SIGNUP_CODE=admin1234
DG_API_KEY=b7b8b0c6-a601-4ddc-8c5f-5c9e3f814256
```

> 현재는 mock 데이터 기반으로 동작하므로 DB 연결은 예비 상태입니다.

## 4. 현재 활성화된 API

### 루트

- GET /

### 신고 관련

- GET /api/reports
- POST /api/reports
- GET /api/reports/:id
- PATCH /api/reports/:id/status
- POST /api/reports/:id/action

## 5. 현재 폴더 구조

```text
Took-Tak/
├── src/
│   ├── server.js
│   ├── config/db.js
│   ├── middlewares/authMiddleware.js
│   ├── routes/authRoutes.js
│   ├── routes/reportRoutes.js
│   └── controllers/authController.js
│   └── controllers/reportController.js
└── README.md
```

## 6. 개발 메모

- 현재 구현은 `mockReports` 인메모리 배열 기반입니다.
- 프론트와 실제 DB가 준비되면, `reportController.js`의 저장/조회 로직만 실제 DB 쿼리로 교체하면 됩니다.
- 프론트가 붙을 때는 현재 응답 형식을 유지하는 방향이 가장 안전합니다.

## 7. 다음 단계

- [ ] PostgreSQL 연결용 DB 구조로 전환
- [ ] 프론트 연동용 응답 JSON 표준화
- [ ] 실제 배포 환경용 `.env` 분리
