const { QueryTypes } = require('sequelize');
const env = require('../config/env');
const {
  sequelize,
  Report,
  ReportPhoto,
  ReportStatusHistory,
  ReportAction,
  ReportGroup,
  Building,
  Floor,
  Zone,
  User,
} = require('../models');
const { analyzeReport } = require('../utils/aiService');
const {
  REPORT_STATUSES,
  URGENCY_LEVELS,
  MAX_REPORT_PHOTOS,
  sameId,
  parseId,
  parseEnumValue,
  parseDate,
  parsePhotoUrls,
  parseDescription,
} = require('../utils/validators');

// 정렬 옵션 화이트리스트.
// ORDER BY 는 바인드 파라미터로 넘길 수 없어 문자열을 직접 끼워 넣습니다.
// 반드시 이 맵의 값만 사용해야 SQL 인젝션이 막힙니다.
const SORT_OPTIONS = {
  // urgency ENUM 은 선언 순서(high → medium → low)대로 정렬됩니다.
  // 아직 분류되지 않은(NULL) 건은 뒤로 보냅니다.
  urgency: 'r.urgency ASC NULLS LAST, r.created_at DESC',
  latest: 'r.created_at DESC',
  location: 'b.name ASC, f.name ASC, z.name ASC, r.created_at DESC',
};

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= 100 ? num : null;
}

function toUploadUrl(req, filename) {
  const configuredBaseUrl = (env.publicBaseUrl || '').replace(/\/$/, '');
  const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
  const baseUrl = configuredBaseUrl || requestBaseUrl;
  return `${baseUrl}/uploads/${filename}`;
}

// ---------------------------------------------------------------------------
// 0. 이미지 업로드 (임시 blob URL → 백엔드 저장 URL)
// ---------------------------------------------------------------------------
exports.uploadReportImages = async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: '업로드할 이미지가 없습니다.' });
    }

    const photoUrls = files
      .filter((file) => file && file.filename)
      .map((file) => toUploadUrl(req, file.filename));

    return res.status(200).json({ photoUrls });
  } catch (error) {
    return next(error);
  }
};

exports.uploadActionImage = async (req, res, next) => {
  try {
    if (!req.file || !req.file.filename) {
      return res.status(400).json({ message: '업로드할 조치 사진이 없습니다.' });
    }

    return res.status(200).json({ photoUrl: toUploadUrl(req, req.file.filename) });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 1. 신고 등록 (C3)
// ---------------------------------------------------------------------------
exports.createReport = async (req, res, next) => {
  try {
    const reporterId = req.user.id;

    const buildingId = parseId(req.body.building_id);
    const floorId = parseId(req.body.floor_id);
    const zoneId = parseId(req.body.zone_id);
    const pinX = parseCoordinate(req.body.pin_x);
    const pinY = parseCoordinate(req.body.pin_y);

    if (!buildingId || !floorId) {
      return res.status(400).json({ message: 'building_id, floor_id는 필수입니다.' });
    }

    const hasZoneSelection = zoneId !== null;
    const hasFreeClick = pinX !== null && pinY !== null;

    if (!hasZoneSelection && !hasFreeClick) {
      return res.status(400).json({ message: 'zone_id 또는 pin_x/pin_y 중 하나는 필수입니다.' });
    }

    const description = parseDescription(req.body.description);
    if (!description.ok) {
      return res.status(400).json({ message: description.message });
    }

    const part = typeof req.body.part === 'string' && req.body.part.trim()
      ? req.body.part.trim()
      : null;

    const photoUrls = parsePhotoUrls(req.body.photoUrls, MAX_REPORT_PHOTOS);

    // 위치 계층 검증.
    // zone_id 가 있으면 기존 hotspot 방식, 없으면 자유 클릭 좌표를 사용합니다.
    let zone = null;
    if (hasZoneSelection) {
      zone = await Zone.findByPk(zoneId, {
        include: [{
          model: Floor,
          as: 'floor',
          include: [{ model: Building, as: 'building' }],
        }],
      });

      if (!zone || !zone.floor || !zone.floor.building
        || !sameId(zone.floor_id, floorId)
        || !sameId(zone.floor.building_id, buildingId)) {
        return res.status(400).json({ message: '유효하지 않은 건물/층/구역 조합입니다.' });
      }
    }

    // AI 분류는 서버가 만듭니다.
    // 클라이언트가 보낸 ai_type / ai_urgency 등은 신뢰하지 않고 무시합니다.
    // (기능명세 16-10)
    let ai = null;
    try {
      ai = await analyzeReport({ description: description.value, photoUrls });
    } catch (err) {
      // 기능명세 9.4: AI 실패 시 재시도/대체 처리 방식 미정.
      // 임시로 신고 접수 자체는 막지 않고 분류를 비운 채 저장합니다.
      // 이후 C4(AI 결과 나중 입력)로 채울 수 있습니다.
      console.error('[ai] 분석 실패 — 분류 없이 저장합니다:', err.message);
    }

    // 사진/이력까지 한 트랜잭션으로 묶습니다.
    // 중간에 실패하면 "이력 없는 신고"가 남아 처리 타임라인이 깨집니다.
    const reportId = await sequelize.transaction(async (t) => {
      const report = await Report.create({
        reporter_id: reporterId,
        building_id: buildingId,
        floor_id: floorId,
        zone_id: zoneId,
        pin_x: pinX,
        pin_y: pinY,
        part,
        description: description.value,
        status: 'received',
        // 최종값은 AI 값으로 초기화하고, 이후 관리자가 A6 으로 덮어씁니다.
        type: ai ? ai.type : null,
        urgency: ai ? ai.urgency : null,
        ai_type: ai ? ai.type : null,
        ai_urgency: ai ? ai.urgency : null,
        ai_summary: ai ? ai.summary : null,
        ai_reasoning: ai ? ai.reasoning : null,
        ai_suggested_action: ai ? ai.suggested_action : null,
      }, { transaction: t });

      if (photoUrls.length > 0) {
        await ReportPhoto.bulkCreate(
          photoUrls.map((url, index) => ({
            report_id: report.id,
            url,
            kind: 'report',
            sort_order: index,
          })),
          { transaction: t },
        );
      }

      await ReportStatusHistory.create({
        report_id: report.id,
        from_status: null,
        to_status: 'received',
        changed_by: reporterId,
      }, { transaction: t });

      return report.id;
    });

    return res.status(201).json({ message: '신고가 접수되었습니다.', reportId });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 2. 신고 목록 (A2 다중 필터/정렬 + C5 내 신고 목록)
//    학생이면 본인 신고로 자동 제한됩니다.
// ---------------------------------------------------------------------------
exports.getReports = async (req, res, next) => {
  try {
    const isStudent = req.user.role === 'student';

    const status = parseEnumValue(req.query.status, REPORT_STATUSES);
    if (status === undefined) {
      throw badRequest(`status는 ${REPORT_STATUSES.join(', ')} 중 하나여야 합니다.`);
    }

    const urgency = parseEnumValue(req.query.urgency, URGENCY_LEVELS);
    if (urgency === undefined) {
      throw badRequest(`urgency는 ${URGENCY_LEVELS.join(', ')} 중 하나여야 합니다.`);
    }

    const from = parseDate(req.query.from);
    if (from === undefined) throw badRequest('from은 ISO 날짜 형식이어야 합니다.');

    const to = parseDate(req.query.to);
    if (to === undefined) throw badRequest('to는 ISO 날짜 형식이어야 합니다.');

    const type = typeof req.query.type === 'string' && req.query.type.trim()
      ? req.query.type.trim()
      : null;

    const sortKey = req.query.sort || (isStudent ? 'latest' : 'urgency');
    const orderBy = SORT_OPTIONS[sortKey];
    if (!orderBy) {
      throw badRequest(`sort는 ${Object.keys(SORT_OPTIONS).join(', ')} 중 하나여야 합니다.`);
    }

    const limit = Math.min(parseId(req.query.limit) || 50, 200);
    const offset = parseId(req.query.offset) || 0;

    const rows = await sequelize.query(
      `SELECT r.id, r.type, r.urgency, r.status, r.part, r.description,
              r.created_at, r.updated_at, r.group_id,
              b.id AS building_id, b.name AS building,
              f.id AS floor_id,    f.name AS floor,
              z.id AS zone_id,     z.name AS zone, z.pin_x, z.pin_y,
              u.id AS reporter_id, u.name AS reporter_name,
              (SELECT p.url FROM report_photos p
                WHERE p.report_id = r.id AND p.kind = 'report'
                ORDER BY p.sort_order LIMIT 1) AS thumbnail
         FROM reports r
         JOIN buildings b ON b.id = r.building_id
         JOIN floors    f ON f.id = r.floor_id
         JOIN zones     z ON z.id = r.zone_id
         JOIN users     u ON u.id = r.reporter_id
        WHERE ($1::bigint        IS NULL OR r.reporter_id = $1)
          AND ($2::text          IS NULL OR r.type = $2)
          AND ($3::urgency_level IS NULL OR r.urgency = $3)
          AND ($4::bigint        IS NULL OR r.building_id = $4)
          AND ($5::bigint        IS NULL OR r.floor_id = $5)
          AND ($6::bigint        IS NULL OR r.zone_id = $6)
          AND ($7::report_status IS NULL OR r.status = $7)
          AND ($8::timestamptz   IS NULL OR r.created_at >= $8)
          AND ($9::timestamptz   IS NULL OR r.created_at <  $9)
        ORDER BY ${orderBy}
        LIMIT $10 OFFSET $11`,
      {
        bind: [
          isStudent ? req.user.id : null,
          type,
          urgency,
          parseId(req.query.building_id),
          parseId(req.query.floor_id),
          parseId(req.query.zone_id),
          status,
          from,
          to,
          limit,
          offset,
        ],
        type: QueryTypes.SELECT,
      },
    );

    return res.status(200).json({ reports: rows, limit, offset, count: rows.length });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 3. 신고 상세 (A5 원본 데이터 + C6-a 타임라인 + C6-b AI 근거 + C6-c 조치 결과)
// ---------------------------------------------------------------------------
exports.getReportById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw badRequest('유효하지 않은 신고 id 입니다.');

    const report = await Report.findByPk(id, {
      include: [
        { model: Building, as: 'building', attributes: ['id', 'name'] },
        { model: Floor, as: 'floor', attributes: ['id', 'name'] },
        { model: Zone, as: 'zone', attributes: ['id', 'name', 'pin_x', 'pin_y'] },
        { model: User, as: 'reporter', attributes: ['id', 'name'] },
        {
          model: ReportPhoto,
          as: 'photos',
          attributes: ['id', 'url', 'kind', 'sort_order'],
        },
        {
          // ※ 연관을 as 로 정의했으면 include 에도 반드시 as 를 써야 합니다.
          //   빠지면 Sequelize 가 EagerLoadingError 를 던져 500 이 납니다.
          model: ReportAction,
          as: 'actions',
          attributes: ['id', 'content', 'admin_id', 'created_at'],
        },
      ],
      order: [[{ model: ReportPhoto, as: 'photos' }, 'sort_order', 'ASC']],
    });

    if (!report) {
      return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
    }

    // 학생은 본인 신고만 볼 수 있습니다. (기능명세 13: 권한 분리)
    if (req.user.role === 'student' && !sameId(report.reporter_id, req.user.id)) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const statusHistory = await ReportStatusHistory.findAll({
      where: { report_id: report.id },
      order: [['changed_at', 'ASC']],
    });

    return res.status(200).json({ report, status_history: statusHistory });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 4. 상태 변경 (A8) — 관리자 전용
// ---------------------------------------------------------------------------
exports.updateStatus = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw badRequest('유효하지 않은 신고 id 입니다.');

    const status = parseEnumValue(req.body.status, REPORT_STATUSES);
    if (!status) {
      throw badRequest(`status는 ${REPORT_STATUSES.join(', ')} 중 하나여야 합니다.`);
    }

    const reason = typeof req.body.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : null;

    const result = await sequelize.transaction(async (t) => {
      // 잠금을 걸어 두 관리자가 동시에 바꿀 때 이력의 from_status 가 어긋나는 것을 막습니다.
      const report = await Report.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!report) return null;

      const previousStatus = report.status;
      if (previousStatus === status) {
        return { report, changed: false };
      }

      report.status = status;
      report.updated_at = new Date();
      await report.save({ transaction: t });

      await ReportStatusHistory.create({
        report_id: report.id,
        from_status: previousStatus,
        to_status: status,
        reason,
        changed_by: req.user.id,
      }, { transaction: t });

      return { report, changed: true };
    });

    if (!result) {
      return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
    }

    return res.status(200).json({
      message: result.changed ? '상태가 변경되었습니다.' : '이미 해당 상태입니다.',
      report: result.report,
    });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 5. 조치 결과 등록 + 자동 완료 처리 (A9) — 관리자 전용
// ---------------------------------------------------------------------------
exports.addAction = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw badRequest('유효하지 않은 신고 id 입니다.');

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content) throw badRequest('조치 내용(content)은 필수입니다.');

    // 조치 후 사진은 kind='action' 이라 원본 3장 제한과 무관합니다.
    const photoUrls = parsePhotoUrls(req.body.photoUrls, 10);

    const result = await sequelize.transaction(async (t) => {
      const report = await Report.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!report) return null;

      await ReportAction.create({
        report_id: report.id,
        content,
        admin_id: req.user.id,
      }, { transaction: t });

      if (photoUrls.length > 0) {
        // 같은 신고에 조치가 여러 번 등록될 수 있으므로
        // sort_order 는 기존 조치 사진 개수부터 이어붙입니다.
        const existing = await ReportPhoto.count({
          where: { report_id: report.id, kind: 'action' },
          transaction: t,
        });

        await ReportPhoto.bulkCreate(
          photoUrls.map((url, index) => ({
            report_id: report.id,
            url,
            kind: 'action',
            sort_order: existing + index,
          })),
          { transaction: t },
        );
      }

      const previousStatus = report.status;
      report.status = 'done';
      report.updated_at = new Date();
      await report.save({ transaction: t });

      await ReportStatusHistory.create({
        report_id: report.id,
        from_status: previousStatus,
        to_status: 'done',
        reason: '조치 완료',
        changed_by: req.user.id,
      }, { transaction: t });

      return report;
    });

    if (!result) {
      return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
    }

    return res.status(200).json({ message: '조치 결과가 등록되고 완료 처리되었습니다.' });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 6. 재분류 · 수동 오버라이드 (A6) — 관리자 전용
//    ai_* 컬럼은 건드리지 않습니다. AI 원본과 사람 수정본을 모두 보존합니다.
// ---------------------------------------------------------------------------
exports.overrideClassification = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw badRequest('유효하지 않은 신고 id 입니다.');

    const patch = { updated_at: new Date() };

    if ('type' in req.body) {
      patch.type = typeof req.body.type === 'string' && req.body.type.trim()
        ? req.body.type.trim()
        : null;
    }

    if ('urgency' in req.body) {
      const urgency = parseEnumValue(req.body.urgency, URGENCY_LEVELS);
      if (urgency === undefined) {
        throw badRequest(`urgency는 ${URGENCY_LEVELS.join(', ')} 중 하나여야 합니다.`);
      }
      patch.urgency = urgency;
    }

    if (Object.keys(patch).length === 1) {
      throw badRequest('type 또는 urgency 중 하나는 지정해야 합니다.');
    }

    const [affected] = await Report.update(patch, { where: { id } });
    if (!affected) {
      return res.status(404).json({ message: '신고를 찾을 수 없습니다.' });
    }

    const report = await Report.findByPk(id);
    return res.status(200).json({ message: '분류가 수정되었습니다.', report });
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------------------
// 7. 유사 신고 묶음 · 병합 처리 (A7) — 관리자 전용
// ---------------------------------------------------------------------------
exports.mergeReports = async (req, res, next) => {
  try {
    const rawIds = Array.isArray(req.body.report_ids) ? req.body.report_ids : [];
    const ids = [...new Set(rawIds.map(parseId).filter((v) => v !== null))];

    if (ids.length < 2) {
      throw badRequest('병합하려면 report_ids 에 유효한 신고 id 를 2건 이상 지정해야 합니다.');
    }

    const note = typeof req.body.note === 'string' && req.body.note.trim()
      ? req.body.note.trim()
      : null;

    const result = await sequelize.transaction(async (t) => {
      const found = await Report.count({ where: { id: ids }, transaction: t });
      if (found !== ids.length) {
        throw badRequest('존재하지 않는 신고 id 가 포함되어 있습니다.');
      }

      const group = await ReportGroup.create({
        note,
        created_by: req.user.id,
      }, { transaction: t });

      await Report.update(
        { group_id: group.id, updated_at: new Date() },
        { where: { id: ids }, transaction: t },
      );

      return group;
    });

    return res.status(200).json({
      message: `${ids.length}건이 병합되었습니다.`,
      groupId: result.id,
      reportIds: ids,
    });
  } catch (error) {
    return next(error);
  }
};
