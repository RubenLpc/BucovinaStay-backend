const express = require("express");
const { protect } = require("../middlewares/auth");
const { protectOptional } = require("../middlewares/protectOptional");


const {
  sendMessageToHost,
  getMyInbox,
  markRead,
  getUnreadCount,
  markUnread,
  markAllRead,
} = require("../controllers/hostMessagesController");

const router = express.Router();

// Public (auth optional). Dacă vrei auth obligatoriu, pune auth aici.
router.post("/",protectOptional, sendMessageToHost);

router.get("/unread-count", protect, getUnreadCount);


// Host inbox
router.get("/inbox", protect, getMyInbox);

router.patch("/read-all", protect, markAllRead);
router.patch("/:id/read", protect, markRead);
router.patch("/:id/unread", protect, markUnread);


module.exports = router;
