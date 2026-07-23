const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Action = sequelize.define('Action', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reportId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  adminId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  actionContent: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  tableName: 'actions',
});

module.exports = Action;
