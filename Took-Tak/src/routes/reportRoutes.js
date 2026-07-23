const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.post('/', reportController.createReport);
router.get('/', reportController.getReports);
router.get('/:id', reportController.getReportById);

router.patch('/:id/status', reportController.updateStatus);
router.post('/:id/action', reportController.addAction);

module.exports = router;
