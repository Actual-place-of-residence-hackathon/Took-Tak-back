const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ReportImage = sequelize.define('ReportImage', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reportId: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  imageType: {
    type: DataTypes.ENUM('원본', '조치후'),
    defaultValue: '원본',
  },
}, {
  tableName: 'report_images',
});

module.exports = ReportImage;
