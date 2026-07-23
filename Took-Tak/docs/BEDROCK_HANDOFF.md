# Amazon Bedrock 연동 인수인계

> 작성일: 2026-07-23 · 대상: AI 기능 담당 (이수빈, 임재중)
> 이 문서만 읽고 바로 작업을 시작할 수 있게 정리했습니다.

## 1. 한 줄 요약

**[`src/utils/aiService.js`](../src/utils/aiService.js)의 `analyzeReport()` 함수 내부만 교체하면 됩니다.**
컨트롤러·DB·라우트는 손대지 않아도 됩니다.

## 2. 현재 상태

| 항목 | 상태 |
|---|---|
| 통합 지점 | ✅ 준비됨 — `analyzeReport()` 호출부가 이미 연결되어 있음 |
| 반환 계약 | ✅ 확정 — DB 컬럼과 1:1 매핑 |
| 실패 처리 | ✅ 준비됨 — AI 실패해도 신고 접수는 성공 |
| 실제 Bedrock 호출 | ✅ **검증 완료** (2026-07-23) — 실제 응답 확인 |
| 이미지 분석 | ❌ 미구현 — 텍스트만 분석 중 (8절) |
| 프롬프트 / 출력 스키마 | ⚠ 임시안 구현됨 — 11절 확정 후 조정 필요 |
| 모델 ID | ⚠ `.env`의 `BEDROCK_MODEL_ID` — 팀 확정 대기 |
| 도쿄(`ap-northeast-1`) 모델 액세스 | ✅ **승인 확인됨** (2026-07-23) — `anthropic.claude-opus-4-8`, `AUTHORIZED`/`AVAILABLE` |
| IAM 최소 권한 | ⚠ **좁히기 전 상태** — 12절 참고 |

> **2026-07-23 실제 호출로 두 번 검증했습니다.**
> - 1차: `eu-west-1` 에서 `anthropic.claude-opus-4-8`, 4개 케이스 정상 분류(6~9초). 이 과정에서 **두 가지 문제를 발견해 고쳤습니다.** 아래 2-1 참고.
> - 2차: 도쿄(`ap-northeast-1`) 기준으로 실제 신고 등록 API 를 통해 재검증. 누수/전기 2건 모두 유형·긴급도·요약·근거·제안조치가 정확했고, `aws bedrock get-foundation-model-availability` 로 도쿄 모델 액세스가 이미 `AUTHORIZED` 상태임을 확인했습니다. **콘솔에서 따로 승인할 필요가 없습니다.**

## 2-1. 검증하면서 고친 것 (중요)

### (1) `output_config.format` 은 Bedrock 에서 못 씁니다 → 도구 호출로 교체

기존 코드는 구조화 출력(json_schema)으로 형식을 강제했는데, Bedrock Mantle 엔드포인트가
이를 거부합니다.

```text
400 invalid_request_error
  output_config.format: Extra inputs are not permitted
```

도구 정의의 `strict: true` 도 같은 이유로 거부됩니다.

```text
400 invalid_request_error
  tools.0.custom.strict: Extra inputs are not permitted
```

`structured-outputs-2025-11-13` 베타 헤더를 붙여도 결과는 같았고,
`@anthropic-ai/bedrock-sdk` 는 이미 최신(0.32.0)이라 업그레이드로 해결되지 않습니다.

**대신 일반 도구 호출(tool use)로 바꿨습니다.** `submit_classification` 도구의
`input_schema` 가 출력 형태를 잡아주고, SDK 가 파싱한 객체를 그대로 씁니다.
반환 계약(4절)은 그대로입니다.

| 항목 | Bedrock 지원 |
|---|---|
| `output_config.effort` | ✅ |
| `thinking: { type: 'adaptive' }` | ✅ |
| 일반 도구 호출 (`tools` + `input_schema`) | ✅ |
| `output_config.format` (구조화 출력) | ❌ 400 |
| 도구의 `strict: true` | ❌ 400 |

`strict` 를 못 쓰므로 스키마는 "강제"가 아니라 "유도"입니다.
따라서 `normalizeUrgency()` 에 더해 **`normalizeType()` 을 새로 넣어** 유형 목록 밖의
값은 `기타` 로 접습니다. 이게 실제 방어선입니다.

### (2) 서울 리전에는 Bedrock Mantle 엔드포인트가 없습니다

`.env.example` 의 기본값이 `ap-northeast-2` 였는데, 이 리전에는 엔드포인트가 없습니다.

```text
bedrock-mantle.ap-northeast-2.api.aws  →  DNS 조회 실패 (서울 없음)
bedrock-mantle.ap-northeast-3.api.aws  →  DNS 조회 실패 (오사카 없음)
bedrock-mantle.ap-northeast-1.api.aws  →  정상 (도쿄)
```

확인된 리전: `us-east-1`, `us-east-2`, `us-west-2`, `eu-west-1`, `eu-central-1`,
`ap-northeast-1`, `ap-southeast-1`, `ap-southeast-2`, `ap-south-1`

서울로 두면 `Connection error.` 만 뜨고 원인이 전혀 드러나지 않습니다.
기본값을 **도쿄(`ap-northeast-1`)** 로 바꿔뒀습니다.

### (3) 도구 호출을 강제하지 않은 이유

Bedrock 은 `tool_choice` 를 강제할 때 `thinking: { type: 'disabled' }` 를 함께 요구합니다.
긴급도 판단은 사고를 켜두는 편이 정확해서, 강제 대신 시스템 프롬프트로 지시하고
도구 미호출을 검사하는 쪽을 택했습니다. 4개 케이스 모두 정상 호출했습니다.

미호출 시에는 예외를 던지고, 컨트롤러가 분류 없이 저장합니다(텍스트 억지 파싱 안 함).
운영에서 미호출이 잦으면 `tool_choice` 강제 + `thinking: disabled` 로 바꾸면 됩니다.

## 3. 호출 흐름

```
POST /api/reports
  └─ reportController.createReport()
       ├─ 위치 계층 검증 (건물/층/구역)
       ├─ analyzeReport({ description, photoUrls })   ← 여기만 교체
       │    └─ try/catch 로 감싸져 있음
       │       실패 시 ai = null 로 두고 계속 진행
       └─ transaction {
            Report.create({ ...ai 결과 })
            ReportPhoto.bulkCreate()
            ReportStatusHistory.create()
          }
```

`analyzeReport()`는 **트랜잭션 밖에서** 호출됩니다. 외부 API 호출이 DB 커넥션을 붙잡고 있으면 안 되기 때문입니다. 이 구조를 유지해주세요.

## 4. 반환 계약 (반드시 지킬 것)

```js
{
  type:             string | null,   // 신고 유형        → reports.type, reports.ai_type
  urgency:          'high' | 'medium' | 'low' | null,
                                     // 긴급도          → reports.urgency, reports.ai_urgency
  summary:          string | null,   // 신고 내용 요약   → reports.ai_summary
  reasoning:        string | null,   // 판단 근거        → reports.ai_reasoning
  suggested_action: string | null,   // 제안 조치        → reports.ai_suggested_action
}
```

### ⚠ 반드시 지켜야 할 제약

1. **`urgency`는 `'high' | 'medium' | 'low'` 뿐입니다.**
   `'상'/'중'/'하'`나 `'HIGH'`를 넣으면 PostgreSQL `urgency_level` enum 에러로 500이 납니다.
   Bedrock 응답을 그대로 넘기지 말고 **반드시 화이트리스트로 검증**하세요.

2. **`type`은 TEXT라 자유롭지만, 신고 유형 목록이 확정되면 enum 검증을 추가해야 합니다.**
   현재 더미는 `전기/누수/파손/청소/기타`를 placeholder로 씁니다. (기능명세 17: 유형 목록 미정)

3. **`summary`는 필수 기능입니다** (기능명세 8.1 "AI 기반 신고 내용 요약").
   `ai_summary` 컬럼을 새로 추가해뒀으니 반드시 채워주세요.

4. **예외는 던져도 됩니다.** 컨트롤러가 잡아서 분류 없이 저장합니다.
   단, 던지기 전에 `console.error`로 원인을 남겨주세요.

## 5. DB 컬럼 매핑

`reports` 테이블에 **최종값과 AI 원본이 따로** 저장됩니다.

| 컬럼 | 채우는 주체 | 설명 |
|---|---|---|
| `type`, `urgency` | 최초엔 AI값, 이후 관리자가 덮어씀 | 화면에 보이는 **최종** 분류 |
| `ai_type`, `ai_urgency` | AI만 | 관리자가 수정해도 **절대 안 바뀜** |
| `ai_summary` | AI만 | 요약 |
| `ai_reasoning` | AI만 | 판단 근거 |
| `ai_suggested_action` | AI만 | 제안 조치 |

관리자가 `PATCH /api/reports/:id/classification`으로 재분류해도 `ai_*`는 보존됩니다. AI 정확도를 나중에 측정하려면 이 원본이 필요합니다.

## 6. 인프라 준비

### 6-1. 모델 액세스 활성화

Bedrock은 **콘솔에서 모델 액세스를 신청·승인**해야 호출됩니다. 리전별로 따로 승인해야 합니다.

✅ **도쿄(`ap-northeast-1`)의 `anthropic.claude-opus-4-8`은 이미 승인 완료 상태입니다** (2026-07-23 `aws bedrock get-foundation-model-availability` 로 확인: `authorizationStatus: AUTHORIZED`). 이 조합을 그대로 쓰면 추가 콘솔 작업이 필요 없습니다.

다른 모델·리전으로 바꾸려면 Bedrock 콘솔 → *Model access* 에서 별도로 승인하세요. 서울(`ap-northeast-2`)에는 애초에 Mantle 엔드포인트가 없어 승인 여부와 무관하게 호출이 안 됩니다 (9절).

### 6-2. IAM (액세스 키 금지)

백엔드 EC2의 **인스턴스 프로파일(IAM 역할)** 에 Bedrock 호출 권한을 붙입니다.
코드나 `.env`에 AWS 액세스 키를 넣지 마세요. (기능명세 13, 16-11)

역할에 필요한 권한은 Bedrock 문서의 IAM 액션 목록을 확인해 최소 권한으로 붙이면 됩니다. SDK는 EC2 인스턴스 메타데이터에서 자격증명을 자동으로 가져오므로 코드에 자격증명 설정이 필요 없습니다.

### 6-3. 네트워크

백엔드 EC2는 private subnet이지만 **NAT Gateway가 있어 Bedrock 엔드포인트에 도달합니다.** 추가 설정 없이 동작합니다.

NAT 데이터 요금을 줄이려면 Bedrock용 VPC 인터페이스 엔드포인트를 검토할 수 있지만, 사용하는 엔드포인트 경로에 맞는 서비스 이름을 먼저 확인해야 합니다. **해커톤 일정이면 NAT 그대로 쓰는 걸 권합니다.**

### 6-4. 환경변수 추가

`src/config/env.js`의 `REQUIRED` 배열에 추가할지, 선택값으로 둘지 정해주세요.
AI 없이도 서버가 떠야 하면 **선택값**으로 두는 게 맞습니다.

```env
# .env / .env.example 에 추가
AWS_REGION=ap-northeast-2
BEDROCK_MODEL_ID=
```

## 7. 구현 내용

> 아래는 실제로 [`src/utils/aiService.js`](../src/utils/aiService.js)에 들어간 코드입니다.
> 패키지는 이미 설치돼 있습니다(`npm install` 하면 같이 받습니다).

```bash
npm install @anthropic-ai/bedrock-sdk   # 이미 package.json 에 있음
```

Bedrock에서는 **Mantle 클라이언트**를 쓰고, 모델 ID에 `anthropic.` 접두사가 붙습니다.
(1st-party API의 `claude-opus-4-8` → Bedrock에서는 `anthropic.claude-opus-4-8`)

핵심 호출부는 이렇게 생겼습니다. 전체 코드는 파일을 직접 보세요.

```js
const response = await client.messages.create({
  model: env.bedrock.modelId,          // .env 의 BEDROCK_MODEL_ID
  max_tokens: 4096,
  system: SYSTEM_PROMPT,
  thinking: { type: 'adaptive' },
  output_config: { effort: 'medium' },
  tools: [CLASSIFY_TOOL],              // input_schema 가 출력 형태를 잡아줍니다
  messages: [{ role: 'user', content }],
});

// SDK 가 이미 파싱한 객체입니다. JSON.parse 를 다시 하면 안 됩니다.
const parsed = response.content.find((b) => b.type === 'tool_use')?.input;
```

> 구조화 출력(`output_config.format`)이 아니라 도구 호출을 쓰는 이유는 2-1절에 있습니다.
> Bedrock 이 `output_config.format` 과 `strict: true` 를 모두 400 으로 거부합니다.

### 구현하면서 정한 것

- **`type` 도 enum 으로 묶었습니다.** 도구 `input_schema` 의 `type` 에 `전기/누수/파손/청소/기타`를 `enum` 으로 넣었습니다. `reports.type` 은 TEXT 라 DB 는 뭐든 받지만, 모델이 매번 다른 유형명을 지어내면 A2 필터와 A10 통계가 무의미해집니다. 유형 목록이 확정되면 `PLACEHOLDER_TYPES` 배열만 교체하면 스키마와 `normalizeType()` 이 같이 따라갑니다.
- **`strict` 를 못 쓰므로 `normalizeType()` 이 실제 방어선입니다.** 목록 밖 값은 `기타` 로 접습니다. `normalizeUrgency()` 는 ENUM 밖이면 `null` 로 두어 Postgres 500 을 막습니다.
- **`max_tokens` 는 2048 → 4096.** 사고 토큰이 이 한도를 같이 씁니다. 모자라면 도구 호출이 잘리므로 넉넉히 잡았습니다.
- **타임아웃 25초, `maxRetries: 1`.** SDK 기본 타임아웃은 10분인데, 이 호출은 `POST /api/reports` 응답 경로 안에 있어서 그만큼 매달리면 사용자가 등록 버튼을 누른 채 기다립니다. 끊고 분류 없이 저장하는 편이 낫습니다.
- **`BEDROCK_MODEL_ID` 가 없으면 예외를 던집니다.** 더미 분류로 조용히 대체하지 않습니다. 가짜 값이 `ai_*` 에 들어가면 나중에 AI 정확도를 측정할 때 진짜와 구분할 수 없습니다. 서버 기동 시 `[env] BEDROCK_MODEL_ID 미설정` 경고가 뜹니다.
- **실패 시 `console.error` 에 원인을 남깁니다.** 컨트롤러는 `err.message` 만 찍어서, HTTP 상태·모델 ID·리전은 `aiService` 안에서 따로 남깁니다.

### 참고

- `thinking: { type: 'adaptive' }` — 모델이 필요한 만큼 알아서 사고합니다. 토큰 예산을 직접 지정하는 `budget_tokens`는 최신 모델에서 제거됐습니다.
- `output_config.effort` — `low`/`medium`/`high`/`xhigh`/`max`. 분류 작업이라 `medium`으로 두었습니다. 응답이 느리면 `low` 로 내려보세요.
- **모델 ID는 `.env`로 빼두었습니다.** 성능/비용을 비교하며 바꿀 수 있게 하기 위함입니다.

## 8. 이미지 전달

**Bedrock에서는 Files API를 쓸 수 없습니다.** 이미지를 base64로 인라인해야 합니다.

이미지 저장소는 **EC2 로컬 디스크**(`src/uploads/`, [`upload.middleware.js`](../src/middleware/upload.middleware.js))로 유지합니다. 오브젝트 스토리지로 옮기지 않습니다. `report_photos.url`에는 로컬 파일명(또는 상대 경로)이 들어가므로, 분석 시 그 경로에서 바로 읽어 base64로 변환하면 됩니다.

```js
const fs = require('fs/promises');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

async function loadImages(filenames) {
  const out = [];
  for (const name of filenames.slice(0, 3)) {   // 원본은 최대 3장
    const bytes = await fs.readFile(path.join(UPLOAD_DIR, name));
    const ext = path.extname(name).toLowerCase();
    out.push({
      base64: bytes.toString('base64'),
      mediaType: ext === '.png' ? 'image/png' : 'image/jpeg',
    });
  }
  return out;
}
```

**현재 구현은 텍스트만 넘깁니다.** `analyzeReport()` 는 `photoUrls` 를 받기만 하고 모델에 넣지 않습니다(호출부 계약을 안 바꾸려고 인자는 유지했습니다). 위 `loadImages()` 를 추가하고 `content` 배열 **앞쪽**에 image 블록을 넣으면 됩니다. 해당 위치에 주석을 남겨뒀습니다.

> ⚠ `upload.middleware.js`는 아직 어떤 라우트에도 연결돼 있지 않습니다. 지금은 클라이언트가 `photoUrls` 문자열 배열을 그대로 보내는 구조입니다. 실제 파일 업로드 라우트(`uploadReportImages` 미들웨어를 어디에 연결할지)는 별도로 정해야 합니다.

## 9. Bedrock 제약 (1st-party API와 다른 점)

✅/❌ 중 **실측**으로 확인한 항목은 표시해 뒀습니다 (2026-07-23, `eu-west-1`).

| 기능 | Bedrock | 비고 |
|---|---|---|
| Messages / 스트리밍 / tool use | ✅ | 실측 — 현재 구현이 tool use 사용 |
| 적응형 사고(adaptive thinking) / effort | ✅ | 실측 |
| **구조화 출력 (`output_config.format`)** | ❌ | **실측 400** — 2-1절. 도구 호출로 대체 |
| **도구의 `strict: true`** | ❌ | **실측 400** — 2-1절 |
| PDF 입력 | ✅ | |
| **Files API** | ❌ | 이미지는 base64 인라인만 |
| 웹 검색 / 웹 페치 | ❌ | |
| 코드 실행 | ❌ | |
| Message Batches | ❌ | |
| Models API | ❌ | 모델 목록 조회 불가 — 콘솔에서 확인 |
| Task Budgets | ❌ | |

또 한 가지: **Bedrock에서 `tool_choice`를 강제할 때는 `thinking: { type: 'disabled' }`를 같이 넘겨야 합니다.**
현재 구현은 도구를 쓰지만 `tool_choice` 를 강제하지 않아 사고를 켜둔 채로 돌아갑니다. (2-1절 (3))

### 리전 가용성 (실측)

`bedrock-mantle.{region}.api.aws` 가 존재하는 리전만 쓸 수 있습니다.

| 리전 | Mantle |
|---|---|
| `ap-northeast-1` (도쿄) | ✅ |
| `ap-northeast-2` (서울) | ❌ DNS 조회 실패 |
| `ap-northeast-3` (오사카) | ❌ DNS 조회 실패 |
| `ap-southeast-1/2`, `ap-south-1` | ✅ |
| `us-east-1/2`, `us-west-2` | ✅ |
| `eu-west-1`, `eu-central-1` | ✅ |

## 10. 테스트 방법

DB 연결 없이 `analyzeReport()`만 단독으로 돌려볼 수 있습니다.
다만 `src/config/env.js` 를 거치므로 **`.env` 는 채워져 있어야 합니다**(DB 값은 아무 값이나 있으면 됩니다. 접속하지는 않습니다).

```bash
cd Took-Tak
node -e "
  require('./src/utils/aiService').analyzeReport({
    description: '3층 남자화장실 천장에서 물이 계속 떨어집니다'
  }).then(console.log).catch(console.error);
"
```

실제 출력 (2026-07-23, `eu-west-1`, 7.5초):

```js
{
  type: '누수',
  urgency: 'high',
  summary: '3층 남자화장실 천장에서 물이 계속 떨어지는 누수 발생',
  reasoning: '...',
  suggested_action: '...'
}
```

검증한 4개 케이스 (모두 정상, 6~9초):

| 입력 | type | urgency |
|---|---|---|
| 3층 남자화장실 천장에서 물이 계속 떨어집니다 | 누수 | high |
| 복도 형광등이 하나 깜빡거려요 | 전기 | medium |
| (빈 신고) | 기타 | low |
| 강의실 콘센트에서 탄 냄새가 나고 스파크가 튀었어요 | 전기 | high |

전체 흐름 테스트는 서버를 띄우고:

```bash
curl -X POST localhost:4000/api/reports \
  -H "Authorization: Bearer <토큰>" -H "Content-Type: application/json" \
  -d '{"building_id":1,"floor_id":1,"zone_id":1,"description":"천장 누수"}'

curl localhost:4000/api/reports/1 -H "Authorization: Bearer <토큰>"
# → report.ai_type / ai_urgency / ai_summary / ai_reasoning 확인
```

## 11. 팀 확정이 필요한 항목 (기능명세 9.4 / 17)

임의로 정하지 말고 먼저 합의해주세요.

- [ ] **신고 유형 목록** — 임시로 `전기/누수/파손/청소/기타`를 도구 스키마 enum 에 넣어뒀습니다. 확정되면 `aiService.js` 의 `PLACEHOLDER_TYPES` 교체
- [ ] **긴급도 판단 기준** — 위 시스템 프롬프트의 기준은 임시안입니다
- [ ] **Bedrock 리전** — 서울에는 Mantle 엔드포인트가 없습니다. 도쿄(`ap-northeast-1`)를 기본값으로 넣어뒀으니 팀 확정 필요 (9절 리전 표)
- [ ] **Bedrock 세부 모델** — 정확도/비용/리전 가용성 비교 후 결정
- [ ] **AI 실패 시 재시도 정책** — 현재는 재시도 없이 분류를 비우고 저장
- [ ] **낮은 신뢰도 결과를 별도 검토 대상으로 표시할지** — 현재 스키마에 `confidence` 컬럼 없음. 필요하면 스키마 변경 필요
- [ ] **요약 길이 제한** — `ai_summary`는 TEXT라 제한 없음

## 12. 체크리스트

코드 쪽은 검증까지 끝났습니다. 남은 것은 **팀 AWS 계정에서의 콘솔 작업**입니다.

- [x] `npm install @anthropic-ai/bedrock-sdk`
- [x] `.env.example`에 `AWS_REGION`, `BEDROCK_MODEL_ID` 추가
- [x] `analyzeReport()` 교체 (텍스트만 먼저)
- [x] `urgency` 화이트리스트 검증 — 도구 스키마 enum + `normalizeUrgency()` 2중
- [x] `type` 화이트리스트 검증 — `normalizeType()` 추가 (`strict` 를 못 쓰므로 필수)
- [x] **실제 Bedrock 호출 검증 (1차)** — `eu-west-1` / `anthropic.claude-opus-4-8` / 4개 케이스 정상
- [x] 리전 가용성 조사 — 서울·오사카 불가, 도쿄 가능 (9절)
- [x] **실제 Bedrock 호출 검증 (2차, 도쿄 기준)** — 신고 등록 API 로 재검증. 누수/전기 2건 모두 유형·긴급도·요약·근거·제안조치 정확
- [x] **도쿄 모델 액세스 승인 확인** — `anthropic.claude-opus-4-8` 이미 `AUTHORIZED` (콘솔 작업 불필요)
- [ ] 백엔드 EC2 인스턴스 프로파일에 Bedrock 권한 추가 ← 여기부터
      → [`deploy/iam-bedrock-policy.json`](../deploy/iam-bedrock-policy.json)
      ※ Mantle 은 SigV4 서비스명이 `bedrock-mantle` 입니다. 정확한 IAM 액션명은
        미검증이라 CloudTrail 로 확인 후 좁혀야 합니다 (정책 파일 주석)
- [ ] 각자 `.env` 에 `AWS_REGION`, `BEDROCK_MODEL_ID` 채우기
- [ ] 단독 실행 테스트 → 전체 API 테스트 (10절)
- [ ] `ai_summary` 채워지는지 확인
- [ ] 이미지 업로드 라우트 연결 후 이미지 블록 추가 (8절)

## 13. 건드리면 안 되는 것

- `reportController.createReport()`의 **트랜잭션 구조** — AI 호출은 트랜잭션 밖이어야 합니다
- **`ai_*` 컬럼을 관리자 수정과 공유하지 않기** — 원본 보존이 설계 의도입니다
- **클라이언트가 보낸 `ai_*` 값 신뢰하기** — 현재 무시하고 있습니다. 되살리지 마세요 (기능명세 16-10)
- `db/schema.sql` — 컬럼 추가가 필요하면 `db/migrations/`에 새 파일로 추가하세요
