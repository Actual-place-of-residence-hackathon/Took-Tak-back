const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reporter_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  building_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  floor_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  zone_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  part: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('received', 'checking', 'processing', 'done', 'hold'),
    allowNull: false,
    defaultValue: 'received',
  },
  type: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  urgency: {
    type: DataTypes.ENUM('high', 'medium', 'low'),
    allowNull: true,
  },
  ai_type: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ai_urgency: {
    type: DataTypes.ENUM('high', 'medium', 'low'),
    allowNull: true,
  },
  ai_reasoning: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ai_suggested_action: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  group_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'reports',
  timestamps: false,
});

module.exports = Report;
