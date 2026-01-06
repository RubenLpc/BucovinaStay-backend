// server/routes/analyticsRoutes.js
const router = require("express").Router();
const { protect, authorize } = require("../middlewares/auth");
const { impression, click } = require("../controllers/analyticsController");

router.post("/impression", impression);
router.post("/click", click);

module.exports = router;
