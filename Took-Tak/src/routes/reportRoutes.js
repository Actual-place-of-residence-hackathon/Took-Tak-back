const express = require('express');

const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

router.use(requireAuth);

// 고정 경로를 :id 보다 먼저 등록합니다.
router.post('/merge', requireAdmin, reportController.mergeReports);          // A7 병합

router.post('/', reportController.createReport);                             // C3 신고 등록
router.get('/', reportController.getReports);                                // A2 필터/정렬 + C5 내 신고
router.get('/:id', reportController.getReportById);                          // A5 + C6

router.patch('/:id/status', requireAdmin, reportController.updateStatus);    // A8 상태 변경
router.patch('/:id/classification', requireAdmin, reportController.overrideClassification); // A6 재분류
router.post('/:id/action', requireAdmin, reportController.addAction);        // A9 조치 등록

module.exports = router;
