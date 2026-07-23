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
}, {
  tableName: 'zones',
  timestamps: false,
});

module.exports = Zone;
