const express = require('express');
const router = express.Router();
const { listReviews, addReview } = require('../controllers/reviewController');
const { protect, authorize } = require('../middlewares/auth');

router.get('/:id/reviews', listReviews);
router.post('/:id/reviews', protect, authorize('guest'), addReview);

module.exports = router;
