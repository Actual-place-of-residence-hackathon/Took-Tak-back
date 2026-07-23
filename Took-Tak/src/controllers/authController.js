const { User } = require('../models');
const { generateToken } = require('../utils/jwt');

// 1. 학생 로그인 (가짜 DG API 연동)
exports.userLogin = async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ message: 'studentId가 필요합니다.' });
    }

    let user = await User.findOne({ where: { email: studentId } });
    if (!user) {
      user = await User.create({
        name: studentId,
        email: studentId,
        role: 'student',
      });
    }

    const token = generateToken(user);
    return res.status(200).json({ message: '로그인 성공', token });
  } catch (error) {
    return res.status(500).json({ message: '서버 오류', error: error.message });
  }
};

// 2. 관리자 회원가입
exports.adminSignup = async (req, res) => {
  const { adminId, signupCode } = req.body;
  if (signupCode !== process.env.ADMIN_SIGNUP_CODE) {
    return res.status(403).json({ message: '초대 코드가 올바르지 않습니다.' });
  }

  const existing = await User.findOne({ where: { email: adminId } });
  if (existing) {
    return res.status(409).json({ message: '이미 존재하는 관리자입니다.' });
  }

  await User.create({
    name: adminId,
    email: adminId,
    role: 'admin',
  });

  return res.status(201).json({ message: '관리자 회원가입 완료' });
};

// 3. 관리자 로그인
exports.adminLogin = async (req, res) => {
  const { adminId } = req.body;
  const user = await User.findOne({ where: { email: adminId, role: 'admin' } });
  if (!user) {
    return res.status(401).json({ message: '관리자 정보를 찾을 수 없습니다.' });
  }

  const token = generateToken(user);
  return res.status(200).json({ message: '관리자 로그인 성공', token });
};
