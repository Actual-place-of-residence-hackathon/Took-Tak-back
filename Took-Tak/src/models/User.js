const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  dgsmId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'DataGSM OAuth 고유 식별자',
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('student', 'admin'),
    allowNull: false,
    defaultValue: 'student',
  },
}, {
  tableName: 'users',
});

module.exports = User;
