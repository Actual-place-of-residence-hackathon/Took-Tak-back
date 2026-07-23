const sequelize = require('../config/db');

const User = require('./User');
const Building = require('./Building');
const Floor = require('./Floor');
const Zone = require('./Zone');
const ReportGroup = require('./ReportGroup');
const Report = require('./Report');
const ReportPhoto = require('./ReportImage');
const AiAnalysis = require('./AiAnalysis');
const ReportStatusHistory = require('./StatusLog');
const Action = require('./Action');
const Feedback = require('./Feedback');
const Notification = require('./Notification');

// Building - Floor - Zone
Building.hasMany(Floor, { foreignKey: 'building_id' });
Floor.belongsTo(Building, { foreignKey: 'building_id' });
Floor.hasMany(Zone, { foreignKey: 'floor_id' });
Zone.belongsTo(Floor, { foreignKey: 'floor_id' });

// User - Report (신고자)
User.hasMany(Report, { foreignKey: 'reporter_id' });
Report.belongsTo(User, { foreignKey: 'reporter_id', as: 'reporter' });

// Location / area relationships
Building.hasMany(Report, { foreignKey: 'building_id' });
Report.belongsTo(Building, { foreignKey: 'building_id' });
Floor.hasMany(Report, { foreignKey: 'floor_id' });
Report.belongsTo(Floor, { foreignKey: 'floor_id' });
Zone.hasMany(Report, { foreignKey: 'zone_id' });
Report.belongsTo(Zone, { foreignKey: 'zone_id' });

// Report group
ReportGroup.hasMany(Report, { foreignKey: 'group_id' });
Report.belongsTo(ReportGroup, { foreignKey: 'group_id', as: 'group' });

// Report - ReportPhoto (1:N)
Report.hasMany(ReportPhoto, { foreignKey: 'report_id', as: 'photos' });
ReportPhoto.belongsTo(Report, { foreignKey: 'report_id' });

// Report - AiAnalysis (1:1)
Report.hasOne(AiAnalysis, { foreignKey: 'reportId', as: 'aiAnalysis' });
AiAnalysis.belongsTo(Report, { foreignKey: 'reportId' });

// Report - StatusHistory (1:N, 타임라인)
Report.hasMany(ReportStatusHistory, { foreignKey: 'report_id', as: 'status_history' });
ReportStatusHistory.belongsTo(Report, { foreignKey: 'report_id' });

// Report - Action (1:1, 조치결과)
Report.hasOne(Action, { foreignKey: 'report_id', as: 'action' });
Action.belongsTo(Report, { foreignKey: 'report_id' });

// Report - Feedback (1:1)
Report.hasOne(Feedback, { foreignKey: 'report_id', as: 'feedback' });
Feedback.belongsTo(Report, { foreignKey: 'report_id' });

// Report - Notification (1:N)
Report.hasMany(Notification, { foreignKey: 'report_id' });
Notification.belongsTo(Report, { foreignKey: 'report_id' });

// User - Notification (1:N)
User.hasMany(Notification, { foreignKey: 'user_id' });
Notification.belongsTo(User, { foreignKey: 'user_id' });

module.exports = {
  sequelize,
  User,
  Building,
  Floor,
  Zone,
  ReportGroup,
  Report,
  ReportPhoto,
  AiAnalysis,
  ReportStatusHistory,
  Action,
  Feedback,
  Notification,
};
