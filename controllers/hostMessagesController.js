const HostMessage = require("../models/HostMessage");
const Property = require("../models/Property");

// POST /api/host-messages  (public or auth optional)
exports.sendMessageToHost = async (req, res) => {
  const { propertyId, message, guestName, guestEmail } = req.body || {};
  console.log("AUTH USER:", req.user);
console.log("AUTH HEADER:", req.headers.authorization);


  if (!propertyId) return res.status(400).json({ message: "propertyId required" });
  if (!message || String(message).trim().length < 10)
    return res.status(400).json({ message: "Message too short" });

  const property = await Property.findById(propertyId).select({ hostId: 1, status: 1 }).lean();
  if (!property) return res.status(404).json({ message: "Property not found" });

  // opțional: doar live acceptă mesaje publice
  // if (property.status !== "live") return res.status(400).json({ message: "Property not available" });

  const doc = await HostMessage.create({
    hostId: property.hostId,
    propertyId,
    fromUserId: req.user?._id || null,
guestName: req.user?._id ? (req.user.name || "").slice(0, 80) : (guestName || "").slice(0, 80),
guestEmail: req.user?._id ? (req.user.email || "").slice(0, 120) : (guestEmail || "").slice(0, 120),

    message: String(message).trim().slice(0, 1200),
  });

  res.status(201).json({ ok: true, id: String(doc._id) });
};

// GET /api/host-messages/inbox (host auth)
exports.getMyInbox = async (req, res) => {
  const { page = 1, limit = 20, status = "all" } = req.query;

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(50, Math.max(1, Number(limit)));

  const filter = { hostId: req.user._id };
  if (status !== "all") filter.status = status;

  const items = await HostMessage.find(filter)
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .populate("propertyId", "title city locality coverImage")
    .lean();

  const total = await HostMessage.countDocuments(filter);

  res.json({ items, total, page: pageNum, limit: limitNum });
};

// PATCH /api/host-messages/:id/read (host auth)
exports.markRead = async (req, res) => {
  const { id } = req.params;

  const msg = await HostMessage.findById(id);
  if (!msg) return res.status(404).json({ message: "Message not found" });

  if (String(msg.hostId) !== String(req.user._id))
    return res.status(403).json({ message: "Forbidden" });

  msg.status = "read";
  await msg.save();

  res.json({ ok: true });
};



exports.getUnreadCount = async (req, res) => {
  const count = await HostMessage.countDocuments({ hostId: req.user._id, status: "new" });
  res.json({ count });
};
