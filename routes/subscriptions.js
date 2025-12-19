const express = require('express');
const router = express.Router();
const { createCheckoutSession, getStatus } = require('../controllers/subscriptionController');
const { protect } = require('../middlewares/auth');

router.post('/create-checkout-session', protect, createCheckoutSession);
router.get('/status', protect, getStatus);

module.exports = router;
