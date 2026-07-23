const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// ※ 팀 결정(2026-07-23): 로그인·비밀번호 인증은 구현하지 않습니다.
//    따라서 password_hash 컬럼이 없습니다. login_id 는 "누가 신고했는지"를
//    기록하기 위한 식별자일 뿐이며, 본인 확인 수단이 아닙니다.
const User = sequelize.define('User', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  login_id: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true,
    comment: '학번 또는 관리자 ID',
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  email: {
    type: DataTypes.TEXT,
    allowNull: true,
    unique: true,
  },
  role: {
    type: DataTypes.ENUM('student', 'admin'),
    allowNull: false,
    defaultValue: 'student',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'users',
  timestamps: false,
});

module.exports = User;
