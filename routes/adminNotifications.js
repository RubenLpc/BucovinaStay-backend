const express = require("express");
const { protect, authorize } = require("../middlewares/auth");
const ctrl = require("../controllers/adminNotificationsController");

const router = express.Router();

// toate endpoints admin -> protect + requireAdmin
router.get("/", protect, authorize("admin"), ctrl.getAdminNotifications);
router.get("/unread-count", protect, authorize("admin"), ctrl.getAdminUnreadCount);

router.patch("/:id/read", protect, authorize("admin"), ctrl.markAdminNotificationRead);
router.patch("/:id/unread", protect, authorize("admin"), ctrl.markAdminNotificationUnread);
router.patch("/read-all", protect, authorize("admin"), ctrl.markAdminNotificationsReadAll);

module.exports = router;
