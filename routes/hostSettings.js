const express = require("express");
const { protect } = require("../middlewares/auth");
const { getMyHostSettings, patchMyHostSettings } = require("../controllers/hostSettingsController");

const router = express.Router();

router.get("/me", protect, getMyHostSettings);
router.patch("/me", protect, patchMyHostSettings);

module.exports = router;
