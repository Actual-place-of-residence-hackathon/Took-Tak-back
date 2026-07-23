const express = require('express');

const router = express.Router();
const statsController = require('../controllers/statsController');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

// 통계는 전부 관리자 전용입니다. (기능명세 13: 권한 분리)
router.use(requireAuth, requireAdmin);

router.get('/summary', statsController.getSummary);   // A1 대시보드 요약 카운터
router.get('/heatmap', statsController.getHeatmap);   // A10-a 히트맵
router.get('/hotspots', statsController.getHotspots); // A10-b 다발 이슈

module.exports = router;
