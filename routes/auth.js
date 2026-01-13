const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
  forceResetPassword,
} = require("../controllers/authController");
const { protect } = require("../middlewares/auth");

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/me", protect, updateMe); // ✅ edit profile
router.post("/change-password", protect, changePassword);
router.post("/force-reset-password", forceResetPassword);

module.exports = router;
