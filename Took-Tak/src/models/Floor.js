const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Floor = sequelize.define('Floor', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  building_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  tableName: 'floors',
  timestamps: false,
});

module.exports = Floor;
