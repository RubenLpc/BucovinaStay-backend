const express = require("express");
const { protect, authorize } = require("../middlewares/auth");
const {
  getMyHostProfile,
  patchMyHostProfile,
  getHostProfilePublic,
} = require("../controllers/hostProfileController");

const router = express.Router();

router.get("/public/:userId", getHostProfilePublic);

router.get("/me", protect, getMyHostProfile);
router.patch("/me", protect, patchMyHostProfile);

module.exports = router;