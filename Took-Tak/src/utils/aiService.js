// AI 분석 로직을 붙이는 지점입니다.
// 실제로는 여기서 이미지+텍스트를 Claude API(Vision) 등에 보내서
// 유형/긴급도/요약/근거를 받아오면 됩니다.
//
// 지금은 개발 진행을 막지 않기 위한 더미(stub) 구현입니다.

const CATEGORIES = ['전기', '누수', '파손', '청소', '기타'];
const URGENCIES = ['상', '중', '하'];

async function analyzeReport({ imagePaths, description }) {
  // TODO: 실제 AI API 호출로 교체
  // 예시 응답 형태만 우선 맞춰둔 더미 로직
  const lowerDesc = description?.toLowerCase() || '';

  let category = '기타';
  if (lowerDesc.includes('누수') || lowerDesc.includes('물')) category = '누수';
  else if (lowerDesc.includes('전기') || lowerDesc.includes('콘센트')) category = '전기';
  else if (lowerDesc.includes('파손') || lowerDesc.includes('깨짐')) category = '파손';
  else if (lowerDesc.includes('청소') || lowerDesc.includes('쓰레기')) category = '청소';

  const urgency = category === '전기' || category === '누수' ? '상' : '중';

  return {
    predicted_category: category,
    predicted_urgency: urgency,
    confidence_score: 0.6,
    ai_summary: description ? description.slice(0, 50) : '신고 내용 요약 준비중',
    reasoning_text: `설명 텍스트 내 키워드를 기반으로 '${category}' 유형, '${urgency}' 긴급도로 분류했습니다. (더미 로직 - 추후 AI API로 교체 필요)`,
    suggested_action: '현장 확인 후 담당 부서 배정 필요',
  };
}

module.exports = { analyzeReport, CATEGORIES, URGENCIES };
