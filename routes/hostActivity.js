const express = require("express");
const { protect } = require("../middlewares/auth");
const { getMyHostActivity } = require("../controllers/hostActivityController");

const router = express.Router();

router.get("/me", protect, getMyHostActivity);

module.exports = router;
