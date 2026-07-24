const express = require('express');

const router = express.Router();
const locationController = require('../controllers/locationController');
const { optionalAuth } = require('../middleware/auth.middleware');

router.use(optionalAuth);

router.get('/tree', locationController.getTree);
router.get('/buildings', locationController.getBuildings);
router.get('/buildings/:buildingId/floors', locationController.getFloors);
router.get('/floors/:floorId/zones', locationController.getZones);

module.exports = router;
