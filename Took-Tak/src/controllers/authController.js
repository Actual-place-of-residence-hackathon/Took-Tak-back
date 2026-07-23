const jwt = require('jsonwebtoken');

// 1. 학생 로그인 (가짜 DG API 연동)
exports.userLogin = async (req, res) => {
  try {
    const { studentId, password } = req.body;
    const isSuccess = true; // 임시 성공 처리

    if (isSuccess) {
      const token = jwt.sign({ id: studentId, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '24h' });
      return res.status(200).json({ message: '로그인 성공', token });
    }
  } catch (error) {
    return res.status(500).json({ message: '서버 오류' });
  }
};

// 2. 관리자 회원가입
exports.adminSignup = async (req, res) => {
  const { adminId, password, signupCode } = req.body;
  if (signupCode !== process.env.ADMIN_SIGNUP_CODE) {
    return res.status(403).json({ message: '초대 코드가 올바르지 않습니다.' });
  }
  return res.status(201).json({ message: '관리자 회원가입 완료' });
};

// 3. 관리자 로그인
exports.adminLogin = async (req, res) => {
  const { adminId, password } = req.body;
  const isMatch = true; // 임시 성공 처리

  if (isMatch) {
    const token = jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
    return res.status(200).json({ message: '관리자 로그인 성공', token });
  }
};
