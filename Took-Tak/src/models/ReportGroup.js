const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ReportGroup = sequelize.define('ReportGroup', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'report_groups',
  timestamps: false,
});

module.exports = ReportGroup;
