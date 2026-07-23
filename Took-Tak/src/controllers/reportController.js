// 임시 가짜 데이터 저장소
let mockReports = [
  { id: 1, title: '도서관 히터 고장', content: '너무 추워요', location: '중앙도서관 3층', status: '접수', author: '학생1', anonymous: false },
];

// 1. 신고 등록
exports.createReport = async (req, res) => {
  const { title, content, location, anonymous } = req.body;
  const newReport = {
    id: mockReports.length + 1,
    title,
    content,
    location,
    anonymous,
    status: '접수',
    author: anonymous ? '익명' : '학생'
  };
  mockReports.push(newReport);
  return res.status(201).json({ message: '신고가 접수되었습니다.', reportId: newReport.id });
};

// 2. 신고 목록 조회
exports.getReports = async (req, res) => {
  return res.status(200).json(mockReports);
};

// 3. 신고 상세 조회
exports.getReportById = async (req, res) => {
  const report = mockReports.find(r => r.id === parseInt(req.params.id));
  if (!report) return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
  return res.status(200).json(report);
};

// 4. 상태 변경 (관리자 전용)
exports.updateStatus = async (req, res) => {
  const { status } = req.body;
  const report = mockReports.find(r => r.id === parseInt(req.params.id));
  if (!report) return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });

  report.status = status;
  return res.status(200).json({ message: '상태가 변경되었습니다.', report });
};

// 5. 조치 결과 등록 및 자동 완료 처리 (관리자 전용)
exports.addAction = async (req, res) => {
  const { actionResult } = req.body;
  const report = mockReports.find(r => r.id === parseInt(req.params.id));
  if (!report) return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });

  report.actionResult = actionResult;
  report.status = '완료';
  return res.status(200).json({ message: '조치 결과가 등록되고 완료 처리되었습니다.', report });
};
