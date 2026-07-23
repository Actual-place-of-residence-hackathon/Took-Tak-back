const { User } = require('../models');
const { generateToken } = require('../utils/jwt');
const env = require('../config/env');

// ============================================================================
// ※ 팀 결정(2026-07-23): 로그인·비밀번호 인증은 구현하지 않습니다.
//
//    아래 엔드포인트는 "누구로 동작할지" 식별만 하고 본인 확인은 하지 않습니다.
//    reports.reporter_id / report_actions.admin_id / changed_by 를 서버가
//    채우려면 사용자 id 가 필요하기 때문에 최소한의 식별 장치만 남겼습니다.
//
//    ⚠ 따라서 학번을 아는 사람은 누구나 그 학번으로 신고할 수 있습니다.
//      관리자 권한은 ADMIN_SIGNUP_CODE 하나로만 막혀 있습니다.
//      공개 배포 전 팀 재확인이 필요합니다. (기능명세 17: 인증 방식 미정)
// ============================================================================

// 1. 학생 식별 (비밀번호 없음)
exports.userLogin = async (req, res, next) => {
  try {
    const { studentId, name } = req.body;

    if (typeof studentId !== 'string' || !studentId.trim()) {
      return res.status(400).json({ message: 'studentId가 필요합니다.' });
    }
    const loginId = studentId.trim();

    let user = await User.findOne({ where: { login_id: loginId } });

    // 관리자 계정을 학생 엔드포인트로 넘기면 role: 'admin' 토큰이 발급되므로 차단합니다.
    if (user && user.role === 'admin') {
      return res.status(403).json({ message: '관리자 계정은 관리자 로그인을 사용하세요.' });
    }

    if (!user) {
      user = await User.create({
        login_id: loginId,
        name: (typeof name === 'string' && name.trim()) || loginId,
        role: 'student',
      });
    }

    return res.status(200).json({
      message: '로그인 성공',
      token: generateToken(user),
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
};

// 2. 관리자 등록 (초대 코드 필요)
exports.adminSignup = async (req, res, next) => {
  try {
    const { adminId, signupCode, name } = req.body;

    if (typeof adminId !== 'string' || !adminId.trim()) {
      return res.status(400).json({ message: 'adminId가 필요합니다.' });
    }
    // env.js 가 ADMIN_SIGNUP_CODE 존재를 보장하므로 undefined === undefined 우회가 불가능합니다.
    if (signupCode !== env.adminSignupCode) {
      return res.status(403).json({ message: '초대 코드가 올바르지 않습니다.' });
    }

    const loginId = adminId.trim();
    const existing = await User.findOne({ where: { login_id: loginId } });
    if (existing) {
      return res.status(409).json({ message: '이미 존재하는 계정입니다.' });
    }

    const user = await User.create({
      login_id: loginId,
      name: (typeof name === 'string' && name.trim()) || loginId,
      role: 'admin',
    });

    return res.status(201).json({
      message: '관리자 등록 완료',
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
};

// 3. 관리자 식별 (비밀번호 없음 — 초대 코드로만 게이트)
exports.adminLogin = async (req, res, next) => {
  try {
    const { adminId, signupCode } = req.body;

    if (typeof adminId !== 'string' || !adminId.trim()) {
      return res.status(400).json({ message: 'adminId가 필요합니다.' });
    }
    // 비밀번호가 없으므로 초대 코드가 유일한 관리자 게이트입니다.
    // 이게 없으면 adminId 만 알아도 관리자 토큰이 나갑니다. (기능명세 13: 권한 분리)
    if (signupCode !== env.adminSignupCode) {
      return res.status(401).json({ message: '관리자 인증에 실패했습니다.' });
    }

    const user = await User.findOne({
      where: { login_id: adminId.trim(), role: 'admin' },
    });
    if (!user) {
      return res.status(401).json({ message: '관리자 인증에 실패했습니다.' });
    }

    return res.status(200).json({
      message: '관리자 로그인 성공',
      token: generateToken(user),
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error) {
    return next(error);
  }
};
