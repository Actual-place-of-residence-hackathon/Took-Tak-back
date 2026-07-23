// AI 분석 — Amazon Bedrock (Claude)
//
// 호출 위치: reportController.createReport() 의 트랜잭션 **밖**.
// 외부 API 호출이 DB 커넥션을 붙잡으면 안 되므로 이 구조를 유지해야 합니다.
//
// 여기서 던지는 예외는 컨트롤러가 잡아서 분류를 비운 채 신고를 저장합니다.
// 즉 Bedrock 이 죽어도 신고 접수 자체는 실패하지 않습니다.
//
// 반환 키는 reports 테이블 컬럼명과 1:1로 맞춰져 있습니다. (docs/BEDROCK_HANDOFF.md 4절)

const fs = require('fs/promises');
const path = require('path');
const { AnthropicBedrockMantle } = require('@anthropic-ai/bedrock-sdk');
const env = require('../config/env');

// 업로드된 원본 사진이 저장되는 로컬 디렉터리.
// report_photos.url 에는 이 디렉터리 기준 파일명(또는 경로)이 들어갑니다.
// (docs/BEDROCK_HANDOFF.md 8절)
const UPLOAD_DIR = path.join(__dirname, '../uploads');

// AI 분석에 넘길 이미지는 최대 3장 (원본 사진 제한과 동일).
const MAX_IMAGES = 3;

// Bedrock(Anthropic)이 지원하는 이미지 media type. 그 외 확장자는 건너뜁니다.
const MEDIA_TYPE_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// urgency_level ENUM 과 동일한 값만 반환해야 합니다. (한글 '상/중/하' 아님)
const URGENCY_VALUES = ['high', 'medium', 'low'];

// TODO: 신고 유형 목록 확정 후 교체 (기능명세 17)
// 확정 전까지는 이 목록을 출력 스키마의 enum 으로 넘겨 모델이 매번 다른 유형명을
// 지어내는 것을 막습니다. reports.type 은 TEXT 라 DB 는 뭐든 받지만,
// 유형이 제각각이면 A2 필터·A10 통계가 의미를 잃습니다.
const PLACEHOLDER_TYPES = ['전기', '누수', '파손', '청소', '기타'];

// 자격증명은 EC2 인스턴스 프로파일(IAM 역할)에서 자동으로 가져옵니다.
// 코드나 .env 에 액세스 키를 넣지 않습니다. (기능명세 13, 16-11)
const client = new AnthropicBedrockMantle({
  awsRegion: env.bedrock.region,
  // SDK 기본 타임아웃은 10분입니다. 이 호출은 POST /api/reports 응답 경로 안에
  // 있으므로, 오래 매달리느니 끊고 분류 없이 저장하는 편이 낫습니다.
  timeout: 25000,
  // 429/5xx 순간 오류만 한 번 더 시도합니다.
  // 업무적인 재시도 정책(실패한 신고를 나중에 다시 분류)은 아직 미정입니다. (기능명세 9.4)
  maxRetries: 1,
});

const SYSTEM_PROMPT = `
당신은 학교 시설 고장·불편 신고를 분류하는 도우미입니다.
첨부된 사진이 있으면 사진과 신고 내용을 함께 확인해 판단하세요.
사진과 글의 내용이 서로 다르면 더 확실한 쪽을 기준으로 판단하고, 그 사실을 reasoning 에 적으세요.
반드시 submit_classification 도구를 호출해 결과를 제출하세요.
도구를 호출하지 않고 일반 텍스트로만 답하면 안 됩니다.

긴급도 기준:
  high   - 안전사고 위험이 있거나 즉시 조치가 필요함 (누전, 감전, 누수, 유리 파손, 붕괴 위험 등)
  medium - 사용에 지장이 있으나 당장 위험하지는 않음
  low    - 미관이나 편의 수준

summary 는 목록 화면에 그대로 노출되므로 100자 이내 한 문장으로 씁니다.
reasoning 은 그렇게 판단한 근거를, suggested_action 은 담당 부서가 취할 첫 조치를 씁니다.
신고 내용이 비어 있거나 판단할 정보가 부족하면 유형은 '기타', 긴급도는 'low' 로 두고
그 사실을 reasoning 에 적으세요.
`.trim();

// 출력 형식을 도구(tool) 입력 스키마로 강제합니다.
//
// ※ 왜 output_config.format(구조화 출력)이 아닌 도구인가 (2026-07-23 실측):
//   Bedrock Mantle 엔드포인트는 output_config.format 을 아직 받지 않습니다.
//     400 invalid_request_error: "output_config.format: Extra inputs are not permitted"
//   도구 정의의 strict: true 도 같은 이유로 거부됩니다.
//     400 invalid_request_error: "tools.0.custom.strict: Extra inputs are not permitted"
//   반면 일반 도구 호출은 정상 동작하며, input_schema 가 출력 형태를 잡아줍니다.
//   (structured-outputs 베타 헤더를 붙여도 결과는 동일했습니다)
//
//   strict 를 못 쓰므로 스키마는 "강제"가 아니라 "유도"입니다.
//   아래 normalizeUrgency / normalizeType 검증이 실제 방어선입니다.
const CLASSIFY_TOOL = {
  name: 'submit_classification',
  description: '신고 내용을 분류한 결과를 제출합니다.',
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: PLACEHOLDER_TYPES, description: '신고 유형' },
      urgency: { type: 'string', enum: URGENCY_VALUES, description: '긴급도' },
      summary: { type: 'string', description: '목록 화면에 노출할 100자 이내 한 문장 요약' },
      reasoning: { type: 'string', description: '그렇게 판단한 근거' },
      suggested_action: { type: 'string', description: '담당 부서가 취할 첫 조치' },
    },
    required: ['type', 'urgency', 'summary', 'reasoning', 'suggested_action'],
  },
};

// 스키마로 유도했더라도 DB 로 내려보내기 전에 한 번 더 막습니다.
// urgency ENUM 위반은 Postgres 에서 500 으로 튑니다.
function normalizeUrgency(value) {
  return URGENCY_VALUES.includes(value) ? value : null;
}

// reports.type 은 TEXT 라 DB 는 뭐든 받지만, 모델이 매번 다른 유형명을 지어내면
// A2 유형 필터와 A10 통계가 무의미해집니다. 목록 밖 값은 '기타'로 접습니다.
function normalizeType(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return PLACEHOLDER_TYPES.includes(text) ? text : '기타';
}

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

/**
 * photoUrls(파일명/경로 문자열 배열)를 읽어 base64 이미지 블록으로 변환합니다.
 *
 * Bedrock 은 Files API·이미지 URL 을 못 쓰고 base64 인라인만 됩니다. (8절)
 * 이미지 로딩 실패는 분류 전체를 막지 않습니다. 읽은 것만 넘기고 나머지는 건너뜁니다.
 * (사진이 없거나 다 실패해도 텍스트만으로 분류가 진행됩니다.)
 *
 * @param {string[]} photoUrls
 * @returns {Promise<Array<{ base64: string, mediaType: string }>>}
 */
async function loadImages(photoUrls = []) {
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) return [];

  const images = [];
  for (const raw of photoUrls.slice(0, MAX_IMAGES)) {
    if (typeof raw !== 'string' || !raw.trim()) continue;

    // report_photos.url 에 상대 경로나 URL 이 들어와도 파일명만 취해
    // UPLOAD_DIR 밖으로 벗어나지 못하게 합니다(경로 순회 방지).
    const filename = path.basename(raw.trim());
    const ext = path.extname(filename).toLowerCase();
    const mediaType = MEDIA_TYPE_BY_EXT[ext];

    if (!mediaType) {
      console.warn('[ai] 지원하지 않는 이미지 형식이라 건너뜁니다:', filename);
      continue;
    }

    try {
      const bytes = await fs.readFile(path.join(UPLOAD_DIR, filename));
      images.push({ base64: bytes.toString('base64'), mediaType });
    } catch (err) {
      // 파일이 없거나 읽기 실패 — 해당 이미지만 건너뛰고 계속 진행합니다.
      console.warn('[ai] 이미지 로딩 실패, 건너뜁니다:', filename, '-', err.message);
    }
  }
  return images;
}

/**
 * 신고 1건을 분류합니다.
 *
 * @param {object}   input
 * @param {string}   input.description  신고 상세 설명
 * @param {string[]} input.photoUrls    첨부 사진 파일명/경로. 로컬에서 읽어 모델에 함께 전달합니다.
 * @returns {Promise<{type: string|null, urgency: 'high'|'medium'|'low'|null,
 *                    summary: string|null, reasoning: string|null,
 *                    suggested_action: string|null}>}
 * @throws Bedrock 호출·파싱 실패 시. 컨트롤러가 잡아서 분류 없이 저장합니다.
 */
async function analyzeReport({ description = '', photoUrls = [] }) {
  if (!env.bedrock.modelId) {
    // 더미 분류로 조용히 대체하지 않습니다.
    // 가짜 값이 ai_* 컬럼에 들어가면 나중에 AI 정확도를 측정할 때 구분할 수 없습니다.
    throw new Error('BEDROCK_MODEL_ID 가 설정되지 않았습니다. AI 분류를 건너뜁니다.');
  }

  // 첨부 사진을 로컬에서 읽어 base64 이미지 블록으로 만듭니다. (8절)
  // 이미지 블록을 텍스트 앞쪽에 두어 모델이 사진을 먼저 보고 내용을 읽게 합니다.
  const images = await loadImages(photoUrls);
  const content = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.base64,
      },
    });
  }
  content.push({
    type: 'text',
    text: images.length > 0
      ? `첨부된 사진 ${images.length}장과 아래 신고 내용을 함께 확인해 분류하세요.\n신고 내용: ${description || '(내용 없음)'}`
      : `신고 내용: ${description || '(내용 없음)'}`,
  });

  let response;
  try {
    response = await client.messages.create({
      model: env.bedrock.modelId,
      // 사고 토큰도 이 한도를 함께 씁니다. 모자라면 도구 호출이 잘리므로
      // 출력 자체는 짧아도 넉넉히 잡아둡니다.
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      tools: [CLASSIFY_TOOL],
      // ※ tool_choice 로 도구 호출을 강제하지 않습니다.
      //   Bedrock 은 tool_choice 강제 시 thinking: { type: 'disabled' } 를 함께
      //   요구하는데, 긴급도 판단은 사고를 켜두는 편이 정확합니다.
      //   대신 시스템 프롬프트에서 도구 호출을 지시하고, 아래에서 미호출을 검사합니다.
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    // 컨트롤러는 err.message 만 찍습니다. 원인 파악에 필요한 것은 여기서 남깁니다.
    console.error('[ai] Bedrock 호출 실패:', {
      name: err.name,
      status: err.status,
      message: err.message,
      model: env.bedrock.modelId,
      region: env.bedrock.region,
    });
    throw err;
  }

  // 도구를 강제하지 않으므로 모델이 그냥 텍스트로 답할 가능성이 남아 있습니다.
  // 그 경우 분류 없이 저장하는 편이, 텍스트를 억지로 파싱하는 것보다 안전합니다.
  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    const text = response.content.find((block) => block.type === 'text')?.text || '';
    console.error('[ai] 모델이 도구를 호출하지 않았습니다. stop_reason:', response.stop_reason,
      '| 응답 앞부분:', text.slice(0, 200));
    throw new Error('Bedrock 응답에 tool_use 블록이 없습니다.');
  }

  // input 은 SDK 가 파싱해서 객체로 줍니다. JSON.parse 를 다시 하면 안 됩니다.
  const parsed = toolUse.input || {};

  const urgency = normalizeUrgency(parsed.urgency);
  if (!urgency) {
    console.error('[ai] urgency 값이 ENUM 밖입니다:', parsed.urgency);
  }

  return {
    type: normalizeType(parsed.type),
    urgency,
    summary: normalizeText(parsed.summary),
    reasoning: normalizeText(parsed.reasoning),
    suggested_action: normalizeText(parsed.suggested_action),
  };
}

module.exports = { analyzeReport, URGENCY_VALUES, PLACEHOLDER_TYPES };
