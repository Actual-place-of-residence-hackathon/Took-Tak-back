const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reporterId: {
    type: DataTypes.BIGINT,
    allowNull: true, // 익명 신고면 NULL
  },
  anonymousCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isAnonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  locationId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  category: {
    type: DataTypes.ENUM('전기', '누수', '파손', '청소', '기타'),
    allowNull: false,
  },
  urgency: {
    type: DataTypes.ENUM('상', '중', '하'),
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('접수', '확인중', '처리중', '완료', '보류'),
    defaultValue: '접수',
  },
  mergedIntoId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: '유사 신고로 병합된 경우 대표 신고 ID',
  },
}, {
  tableName: 'reports',
});

module.exports = Report;
