const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Building = sequelize.define('Building', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '건물명 (예: 동행관, 본관)',
  },
}, {
  tableName: 'buildings',
});

module.exports = Building;
