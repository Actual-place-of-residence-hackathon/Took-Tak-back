// 환경변수 로딩 + 필수값 검증
// 값이 undefined 인 채로 서버가 뜨면 비교문이 조용히 통과해버리는 사고가 나므로
// (예: signupCode !== process.env.ADMIN_SIGNUP_CODE 가 둘 다 undefined 라 통과)
// 여기서 먼저 막고 즉시 종료합니다.
require('dotenv').config();

const REQUIRED = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'ADMIN_SIGNUP_CODE',
];

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`[env] 필수 환경변수가 비어 있습니다: ${missing.join(', ')}`);
  console.error('[env] .env.example 을 참고해 .env 를 채운 뒤 다시 실행하세요.');
  process.exit(1);
}

// Bedrock 은 선택값입니다. REQUIRED 에 넣으면 AI 없이 로컬 개발을 못 하게 됩니다.
// 미설정이면 신고 접수는 그대로 되고 분류 컬럼만 비어서 저장됩니다.
if (!process.env.BEDROCK_MODEL_ID) {
  console.warn('[env] BEDROCK_MODEL_ID 미설정 — AI 분류 없이 신고만 접수됩니다.');
}

module.exports = {
  port: Number(process.env.PORT) || 4000,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwtSecret: process.env.JWT_SECRET,
  adminSignupCode: process.env.ADMIN_SIGNUP_CODE,
  bedrock: {
    // ⚠ 기본값을 서울(ap-northeast-2)로 두면 안 됩니다.
    // 서울·오사카에는 Bedrock Mantle 엔드포인트가 없어 실측 결과 "Connection error."만
    // 뜨고 원인이 드러나지 않습니다. (docs/BEDROCK_HANDOFF.md 9절)
    // AWS_REGION 을 빠뜨려도 최소한 동작하는 도쿄로 떨어지게 기본값을 맞춥니다.
    region: process.env.AWS_REGION || 'ap-northeast-1',
    // 자격증명은 EC2 인스턴스 프로파일에서 자동 해결됩니다. 액세스 키는 두지 않습니다.
    modelId: process.env.BEDROCK_MODEL_ID || null,
  },
  // 쉼표로 여러 오리진 지정 가능. 미설정 시 전체 허용(로컬 개발용)
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : '*',
};
