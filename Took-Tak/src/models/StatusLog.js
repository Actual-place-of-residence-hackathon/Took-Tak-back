const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const StatusLog = sequelize.define('StatusLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reportId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  prevStatus: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  newStatus: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  changedBy: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: '변경한 관리자 user id',
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'status_logs',
});

module.exports = StatusLog;
