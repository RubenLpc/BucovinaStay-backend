const express = require("express");
const { protect } = require("../middlewares/auth");
const { protectOptional } = require("../middlewares/protectOptional");


const {
  sendMessageToHost,
  getMyInbox,
  markRead,
  getUnreadCount,
} = require("../controllers/hostMessagesController");

const router = express.Router();

// Public (auth optional). Dacă vrei auth obligatoriu, pune auth aici.
router.post("/",protectOptional, sendMessageToHost);

router.get("/unread-count", protect, getUnreadCount);


// Host inbox
router.get("/inbox", protect, getMyInbox);
router.patch("/:id/read", protect, markRead);

module.exports = router;
