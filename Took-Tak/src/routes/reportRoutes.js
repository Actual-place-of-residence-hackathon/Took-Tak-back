const express = require('express');

const router = express.Router();
const reportController = require('../controllers/reportController');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth.middleware');
const { uploadReportImages, uploadActionImage } = require('../middleware/upload.middleware');

router.use(optionalAuth);

// 업로드된 이미지 파일을 백엔드가 저장하고 접근 가능한 URL 을 돌려줍니다.
router.post('/upload-images', uploadReportImages, reportController.uploadReportImages);
router.post('/upload-action-image', uploadActionImage, reportController.uploadActionImage);

// 고정 경로를 :id 보다 먼저 등록합니다.
router.post('/merge', requireAdmin, reportController.mergeReports);          // A7 병합

router.post('/', reportController.createReport);                             // C3 신고 등록
router.get('/', reportController.getReports);                                // A2 필터/정렬 + C5 내 신고
router.get('/:id', reportController.getReportById);                          // A5 + C6

router.patch('/:id/status', requireAdmin, reportController.updateStatus);    // A8 상태 변경
router.patch('/:id/classification', requireAdmin, reportController.overrideClassification); // A6 재분류
router.post('/:id/action', requireAdmin, reportController.addAction);        // A9 조치 등록

module.exports = router;
