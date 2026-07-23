const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Location = sequelize.define('Location', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  buildingId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  floor: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  zone: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '구획/부위 (예: 화장실, 복도)',
  },
}, {
  tableName: 'locations',
});

module.exports = Location;
