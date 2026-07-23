const sequelize = require('../config/db');

const User = require('./User');
const Building = require('./Building');
const Location = require('./Location');
const Report = require('./Report');
const ReportImage = require('./ReportImage');
const AiAnalysis = require('./AiAnalysis');
const StatusLog = require('./StatusLog');
const Action = require('./Action');
const Feedback = require('./Feedback');
const Notification = require('./Notification');

// Building - Location
Building.hasMany(Location, { foreignKey: 'buildingId' });
Location.belongsTo(Building, { foreignKey: 'buildingId' });

// User - Report (신고자)
User.hasMany(Report, { foreignKey: 'reporterId' });
Report.belongsTo(User, { foreignKey: 'reporterId', as: 'reporter' });

// Location - Report
Location.hasMany(Report, { foreignKey: 'locationId' });
Report.belongsTo(Location, { foreignKey: 'locationId' });

// Report - ReportImage (1:N)
Report.hasMany(ReportImage, { foreignKey: 'reportId', as: 'images' });
ReportImage.belongsTo(Report, { foreignKey: 'reportId' });

// Report - AiAnalysis (1:1)
Report.hasOne(AiAnalysis, { foreignKey: 'reportId', as: 'aiAnalysis' });
AiAnalysis.belongsTo(Report, { foreignKey: 'reportId' });

// Report - StatusLog (1:N, 타임라인)
Report.hasMany(StatusLog, { foreignKey: 'reportId', as: 'statusLogs' });
StatusLog.belongsTo(Report, { foreignKey: 'reportId' });

// Report - Action (1:1, 조치결과)
Report.hasOne(Action, { foreignKey: 'reportId', as: 'action' });
Action.belongsTo(Report, { foreignKey: 'reportId' });

// Report - Feedback (1:1)
Report.hasOne(Feedback, { foreignKey: 'reportId', as: 'feedback' });
Feedback.belongsTo(Report, { foreignKey: 'reportId' });

// Report - Notification (1:N)
Report.hasMany(Notification, { foreignKey: 'reportId' });
Notification.belongsTo(Report, { foreignKey: 'reportId' });

// User - Notification (1:N)
User.hasMany(Notification, { foreignKey: 'userId' });
Notification.belongsTo(User, { foreignKey: 'userId' });

// Report - Report (유사 신고 병합, self-reference)
Report.belongsTo(Report, { foreignKey: 'mergedIntoId', as: 'mergedInto' });
Report.hasMany(Report, { foreignKey: 'mergedIntoId', as: 'mergedChildren' });

module.exports = {
  sequelize,
  User,
  Building,
  Location,
  Report,
  ReportImage,
  AiAnalysis,
  StatusLog,
  Action,
  Feedback,
  Notification,
};
