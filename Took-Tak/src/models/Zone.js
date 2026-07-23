const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Zone = sequelize.define('Zone', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  floor_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  // 배치도 이미지 위 핀 위치(0~100 퍼센트). NULL 이면 프론트에서 핀이 안 보입니다.
  pin_x: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  pin_y: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
}, {
  tableName: 'zones',
  timestamps: false,
});

module.exports = Zone;
