const { Report, ReportPhoto, ReportStatusHistory, Action, Building, Floor, Zone } = require('../models');
const { Op } = require('sequelize');

const VALID_STATUSES = ['received', 'checking', 'processing', 'done', 'hold'];

// 1. 신고 등록
exports.createReport = async (req, res) => {
  try {
    const reporter_id = req.user?.id;
    const {
      building_id,
      floor_id,
      zone_id,
      part,
      description,
      type,
      urgency,
      ai_type,
      ai_urgency,
      ai_reasoning,
      ai_suggested_action,
      photoUrls = [],
    } = req.body;

    if (!reporter_id || !building_id || !floor_id || !zone_id) {
      return res.status(400).json({ message: 'reporter_id, building_id, floor_id, zone_id는 필수입니다.' });
    }

    const [building, floor, zone] = await Promise.all([
      Building.findByPk(building_id),
      Floor.findByPk(floor_id),
      Zone.findByPk(zone_id),
    ]);

    if (!building || !floor || !zone) {
      return res.status(400).json({ message: '유효하지 않은 건물/층/구역 정보입니다.' });
    }

    const report = await Report.create({
      reporter_id,
      building_id,
      floor_id,
      zone_id,
      part,
      description,
      type: type || ai_type || null,
      urgency: urgency || ai_urgency || null,
      ai_type: ai_type || null,
      ai_urgency: ai_urgency || null,
      ai_reasoning: ai_reasoning || null,
      ai_suggested_action: ai_suggested_action || null,
    });

    if (Array.isArray(photoUrls) && photoUrls.length > 0) {
      const photos = photoUrls.slice(0, 3).map((url, index) => ({
        report_id: report.id,
        url,
        kind: 'report',
        sort_order: index,
      }));
      await ReportPhoto.bulkCreate(photos);
    }

    await ReportStatusHistory.create({
      report_id: report.id,
      from_status: null,
      to_status: 'received',
      changed_by: reporter_id,
    });

    return res.status(201).json({ message: '신고가 접수되었습니다.', reportId: report.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: '신고 등록 중 오류가 발생했습니다.', error: error.message });
  }
};

// 2. 신고 목록 조회
exports.getReports = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};

    if (req.user.role === 'student') {
      where.reporter_id = req.user.id;
    }

    if (status) {
      where.status = status;
    }

    const reports = await Report.findAll({
      where,
      include: [
        { model: Building, attributes: ['id', 'name'] },
        { model: Floor, attributes: ['id', 'name'] },
        { model: Zone, attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    return res.status(200).json(reports);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: '신고 목록 조회 중 오류가 발생했습니다.', error: error.message });
  }
};

// 3. 신고 상세 조회
exports.getReportById = async (req, res) => {
  try {
    const report = await Report.findByPk(req.params.id, {
      include: [
        { model: Building, attributes: ['id', 'name'] },
        { model: Floor, attributes: ['id', 'name'] },
        { model: Zone, attributes: ['id', 'name'] },
        { model: ReportPhoto, attributes: ['id', 'url', 'kind', 'sort_order'], as: 'photos' },
        { model: Action, attributes: ['id', 'content', 'admin_id', 'created_at'] },
      ],
    });

    if (!report) {
      return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
    }

    if (req.user.role === 'student' && report.reporter_id !== req.user.id) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const statuses = await ReportStatusHistory.findAll({
      where: { report_id: report.id },
      order: [['changed_at', 'ASC']],
    });

    return res.status(200).json({ report, status_history: statuses });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: '신고 상세 조회 중 오류가 발생했습니다.', error: error.message });
  }
};

// 4. 상태 변경 (관리자 전용)
exports.updateStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;
    const report = await Report.findByPk(req.params.id);

    if (!report) {
      return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: '유효하지 않은 상태입니다.' });
    }

    const previousStatus = report.status;
    report.status = status;
    report.updated_at = new Date();
    await report.save();

    await ReportStatusHistory.create({
      report_id: report.id,
      from_status: previousStatus,
      to_status: status,
      reason: reason || null,
      changed_by: req.user.id,
    });

    return res.status(200).json({ message: '상태가 변경되었습니다.', report });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: '상태 변경 중 오류가 발생했습니다.', error: error.message });
  }
};

// 5. 조치 결과 등록 및 자동 완료 처리 (관리자 전용)
exports.addAction = async (req, res) => {
  try {
    const { content, photoUrls = [] } = req.body;
    const report = await Report.findByPk(req.params.id);

    if (!report) {
      return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
    }

    if (!content) {
      return res.status(400).json({ message: '조치 내용이 필요합니다.' });
    }

    await Action.create({
      report_id: report.id,
      content,
      admin_id: req.user.id,
    });

    if (Array.isArray(photoUrls) && photoUrls.length > 0) {
      const actionPhotos = photoUrls.map((url, index) => ({
        report_id: report.id,
        url,
        kind: 'action',
        sort_order: index,
      }));
      await ReportPhoto.bulkCreate(actionPhotos);
    }

    const previousStatus = report.status;
    report.status = 'done';
    report.updated_at = new Date();
    await report.save();

    await ReportStatusHistory.create({
      report_id: report.id,
      from_status: previousStatus,
      to_status: 'done',
      reason: '조치 완료',
      changed_by: req.user.id,
    });

    return res.status(200).json({ message: '조치 결과가 등록되고 완료 처리되었습니다.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: '조치 등록 중 오류가 발생했습니다.', error: error.message });
  }
};
