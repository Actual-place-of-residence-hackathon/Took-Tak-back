// 요청 입력값 검증 헬퍼
// 잘못된 값이 그대로 Postgres 까지 내려가면 enum/길이 위반이 500 으로 튀므로
// 컨트롤러 진입부에서 400 으로 걸러냅니다. (기능명세 16-10: 서버에서 검증)

const REPORT_STATUSES = ['received', 'checking', 'processing', 'done', 'hold'];
const URGENCY_LEVELS = ['high', 'medium', 'low'];
const DESCRIPTION_MAX = 500;
const MAX_REPORT_PHOTOS = 3;

// pg 드라이버는 BIGINT 를 문자열로 돌려줍니다.
// id 비교는 반드시 이 함수를 거쳐 문자열끼리 비교해야 합니다.
// (String(3) === String('3') → true, 3 === '3' → false)
function sameId(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

// 양의 정수 id 로 해석되면 Number, 아니면 null
function parseId(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// 허용 목록에 있으면 그 값, 없으면 undefined (필터 미지정과 구분하려면 호출측에서 체크)
function parseEnumValue(value, allowed) {
  if (value === null || value === undefined || value === '') return null;
  return allowed.includes(value) ? value : undefined;
}

// ISO 문자열 → Date, 파싱 실패 시 undefined
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// 사진 URL 배열 정규화. 문자열이 아니거나 빈 값은 버리고 max 장까지 자릅니다.
function parsePhotoUrls(value, max) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((url) => typeof url === 'string' && url.trim())
    .map((url) => url.trim())
    .slice(0, max);
}

// 신고 상세 설명 검증. { ok, value } 또는 { ok: false, message }
function parseDescription(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: 'description은 문자열이어야 합니다.' };
  }
  const text = value.trim();
  if (text.length > DESCRIPTION_MAX) {
    return { ok: false, message: `description은 최대 ${DESCRIPTION_MAX}자입니다.` };
  }
  return { ok: true, value: text || null };
}

module.exports = {
  REPORT_STATUSES,
  URGENCY_LEVELS,
  DESCRIPTION_MAX,
  MAX_REPORT_PHOTOS,
  sameId,
  parseId,
  parseEnumValue,
  parseDate,
  parsePhotoUrls,
  parseDescription,
};
