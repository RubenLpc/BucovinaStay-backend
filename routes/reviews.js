const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middlewares/auth");
// dacă nu ai fișier separat, folosește exact helper-ul tău din propertyRoutes (ori îl muți în middleware).

const {
  listPropertyReviews,
  getMyReviewForProperty,
  createReview,
  deleteReview,
} = require("../controllers/reviewController");

// Public (cu optional auth dacă vrei să arăți extra info)
router.get("/:id/reviews", listPropertyReviews);

// Logged user
router.get("/:id/reviews/me", protect, getMyReviewForProperty);
router.post("/:id/reviews", protect, createReview);

// Optional delete
router.delete("/:id/reviews/:reviewId", protect, deleteReview);

module.exports = router;
