const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Feedback = sequelize.define('Feedback', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reportId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  isResolved: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
  },
}, {
  tableName: 'feedbacks',
});

module.exports = Feedback;
