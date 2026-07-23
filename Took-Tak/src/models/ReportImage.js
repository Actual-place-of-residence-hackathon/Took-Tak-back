const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ReportPhoto = sequelize.define('ReportPhoto', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  report_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  kind: {
    type: DataTypes.ENUM('report', 'action'),
    allowNull: false,
    defaultValue: 'report',
  },
  sort_order: {
    type: DataTypes.SMALLINT,
    allowNull: false,
    defaultValue: 0,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'report_photos',
  timestamps: false,
});

module.exports = ReportPhoto;
