const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Action = sequelize.define('Action', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  report_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  admin_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'report_actions',
  timestamps: false,
});

module.exports = Action;
