const router = require("express").Router();
const { protect } = require("../middlewares/auth");
const {
  impression,
  click,
  hostOverview,
  hostListingsStats,
} = require("../controllers/analyticsController");

// public tracking
router.post("/impression", impression);
router.post("/click", click);

// protected stats
router.get("/host/overview", protect, hostOverview);
router.get("/host/listings", protect, hostListingsStats);



module.exports = router;
