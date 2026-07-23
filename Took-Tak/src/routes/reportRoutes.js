const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

router.use(requireAuth);

router.post('/', reportController.createReport);
router.get('/', reportController.getReports);
router.get('/:id', reportController.getReportById);

router.patch('/:id/status', requireAdmin, reportController.updateStatus);
router.post('/:id/action', requireAdmin, reportController.addAction);

module.exports = router;
