const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const AiAnalysis = sequelize.define('AiAnalysis', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reportId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  predictedCategory: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  predictedUrgency: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  confidenceScore: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  reasoningText: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  suggestedAction: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  isOverridden: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'ai_analysis',
});

module.exports = AiAnalysis;
