const sequelize = require('../config/db');

const User = require('./User');
const Building = require('./Building');
const Floor = require('./Floor');
const Zone = require('./Zone');
const ReportGroup = require('./ReportGroup');
const Report = require('./Report');
const ReportPhoto = require('./ReportPhoto');
const ReportStatusHistory = require('./ReportStatusHistory');
const ReportAction = require('./ReportAction');

// ※ 아래 foreignKey 이름은 각 모델이 직접 선언한 컬럼명과 반드시 같아야 합니다.
//    다르면 Sequelize 가 같은 뜻의 컬럼을 하나 더 만들어버립니다.
//    (예전 Feedback 모델이 reportId + report_id 를 동시에 갖게 됐던 원인)

// 배치도 위치 계층: 건물 → 층 → 구역
Building.hasMany(Floor, { foreignKey: 'building_id', as: 'floors' });
Floor.belongsTo(Building, { foreignKey: 'building_id', as: 'building' });
Floor.hasMany(Zone, { foreignKey: 'floor_id', as: 'zones' });
Zone.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });

// 신고자
User.hasMany(Report, { foreignKey: 'reporter_id', as: 'reports' });
Report.belongsTo(User, { foreignKey: 'reporter_id', as: 'reporter' });

// 신고 위치 (조회 속도를 위해 building/floor 도 함께 보관)
Building.hasMany(Report, { foreignKey: 'building_id', as: 'reports' });
Report.belongsTo(Building, { foreignKey: 'building_id', as: 'building' });
Floor.hasMany(Report, { foreignKey: 'floor_id', as: 'reports' });
Report.belongsTo(Floor, { foreignKey: 'floor_id', as: 'floor' });
Zone.hasMany(Report, { foreignKey: 'zone_id', as: 'reports' });
Report.belongsTo(Zone, { foreignKey: 'zone_id', as: 'zone' });

// 유사 신고 병합 그룹
ReportGroup.hasMany(Report, { foreignKey: 'group_id', as: 'reports' });
Report.belongsTo(ReportGroup, { foreignKey: 'group_id', as: 'group' });
ReportGroup.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// 사진 (원본 kind='report' / 조치 후 kind='action')
Report.hasMany(ReportPhoto, { foreignKey: 'report_id', as: 'photos' });
ReportPhoto.belongsTo(Report, { foreignKey: 'report_id', as: 'report' });

// 상태 변경 이력 (처리 타임라인)
Report.hasMany(ReportStatusHistory, { foreignKey: 'report_id', as: 'status_history' });
ReportStatusHistory.belongsTo(Report, { foreignKey: 'report_id', as: 'report' });
ReportStatusHistory.belongsTo(User, { foreignKey: 'changed_by', as: 'changer' });

// 조치 결과 (report_actions 에 UNIQUE 가 없으므로 1:N)
Report.hasMany(ReportAction, { foreignKey: 'report_id', as: 'actions' });
ReportAction.belongsTo(Report, { foreignKey: 'report_id', as: 'report' });
ReportAction.belongsTo(User, { foreignKey: 'admin_id', as: 'admin' });

module.exports = {
  sequelize,
  User,
  Building,
  Floor,
  Zone,
  ReportGroup,
  Report,
  ReportPhoto,
  ReportStatusHistory,
  ReportAction,
};
