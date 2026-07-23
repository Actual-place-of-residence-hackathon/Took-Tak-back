const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.userLogin);
router.post('/admin/signup', authController.adminSignup);
router.post('/admin/login', authController.adminLogin);

module.exports = router;
