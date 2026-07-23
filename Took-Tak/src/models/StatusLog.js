const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ReportStatusHistory = sequelize.define('ReportStatusHistory', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  report_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  from_status: {
    type: DataTypes.ENUM('received', 'checking', 'processing', 'done', 'hold'),
    allowNull: true,
  },
  to_status: {
    type: DataTypes.ENUM('received', 'checking', 'processing', 'done', 'hold'),
    allowNull: false,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  changed_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  changed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'report_status_history',
  timestamps: false,
});

module.exports = ReportStatusHistory;
