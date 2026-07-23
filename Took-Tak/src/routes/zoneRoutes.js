const express = require('express');

const router = express.Router();
const zoneController = require('../controllers/zoneController');
const { requireAuth } = require('../middleware/auth.middleware');

router.use(requireAuth);

router.get('/pins', zoneController.getZonePins);              // C1 학생 배치도 / A3 관리자 위험도
router.get('/:zoneId/reports', zoneController.getZoneReports); // C2 중복 안내 / A4 핀 클릭 상세

module.exports = router;
