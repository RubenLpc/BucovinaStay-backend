const HostMessage = require("../models/HostMessage");
const Property = require("../models/Property");
const { logHostActivity } = require("../services/activityLogger");
const HostSettings = require("../models/HostSettings"); // ✅ ADD

// POST /api/host-messages  (public or auth optional)
async function getHostSettings(hostId) {
  // dacă nu există doc, îl creează cu default-uri (important!)
  const doc = await HostSettings.findOneAndUpdate(
    { userId: hostId },
    { $setOnInsert: { userId: hostId } },
    { new: true, upsert: true }
  ).lean();

  return doc || null;
}


function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  // păstrăm + și cifre
  let v = raw.replace(/[^\d+]/g, "");
  v = v.startsWith("+") ? "+" + v.slice(1).replace(/\+/g, "") : v.replace(/\+/g, "");

  // normalize RO
  if (v.startsWith("0040")) v = "+40" + v.slice(4);
  if (v.startsWith("40")) v = "+" + v;
  if (v.startsWith("07")) v = "+4" + v;

  return v.slice(0, 24);
}

function isValidPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 9;
}

exports.sendMessageToHost = async (req, res) => {
  const { propertyId, message, guestName, guestEmail, guestPhone } = req.body || {};

  // default true dacă lipsește (safe)
  

  if (!propertyId) return res.status(400).json({ message: "propertyId required" });

  const text = String(message || "").trim();
  if (text.length < 10) return res.status(400).json({ message: "Message too short" });

  const property = await Property.findById(propertyId)
    .select({ hostId: 1, status: 1, title: 1 })
    .lean();

  if (!property) return res.status(404).json({ message: "Property not found" });

  const isAuthed = !!req.user?._id;
  const hostSettings = await getHostSettings(property.hostId);
  const notifyMessages = hostSettings?.notifications?.messages !== false; 

  // guest identity
  const finalName = isAuthed ? (req.user.name || "").slice(0, 80) : String(guestName || "").trim().slice(0, 80);
  const finalEmail = isAuthed ? (req.user.email || "").slice(0, 120) : String(guestEmail || "").trim().slice(0, 120);
  const finalPhone = isAuthed ? "" : normalizePhone(guestPhone);

  // require fields for anonymous
  if (!isAuthed) {
    if (finalName.length < 2) return res.status(400).json({ message: "guestName required" });
    if (!finalEmail || !/^\S+@\S+\.\S+$/.test(finalEmail)) return res.status(400).json({ message: "guestEmail invalid" });
    if (!finalPhone || !isValidPhone(finalPhone)) return res.status(400).json({ message: "guestPhone invalid" });
  }

  const doc = await HostMessage.create({
    hostId: property.hostId,
    propertyId,
    fromUserId: isAuthed ? req.user._id : null,
    guestName: finalName,
    guestEmail: finalEmail,
    guestPhone: finalPhone,
    message: text.slice(0, 1200),
  });

  
    await logHostActivity({
      hostId: property.hostId,
      type: "message_received",
      actor: "guest",
      propertyId,
      propertyTitle: property.title,
      meta: { hasEmail: !!finalEmail, hasName: !!finalName, hasPhone: !!finalPhone },
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
  const hostId = req.user?._id;
  if (!hostId) return res.status(401).json({ message: "Unauthorized" });

  const settings = await getHostSettings(hostId);

  // 🔕 dacă userul a oprit notificările de mesaje => nu arăta badge
  if (settings?.notifications?.messages === false) {
    return res.json({ count: 0, suppressed: true });
  }

  const count = await HostMessage.countDocuments({ hostId, status: "new" });
  res.json({ count, suppressed: false });
};


// PATCH /api/host-messages/:id/unread
exports.markUnread = async (req, res) => {
  const { id } = req.params;

  const msg = await HostMessage.findById(id);
  if (!msg) return res.status(404).json({ message: "Message not found" });

  if (String(msg.hostId) !== String(req.user._id))
    return res.status(403).json({ message: "Forbidden" });

  msg.status = "new";
  await msg.save();
  res.json({ ok: true });
};

// PATCH /api/host-messages/read-all
exports.markAllRead = async (req, res) => {
  await HostMessage.updateMany(
    { hostId: req.user._id, status: "new" },
    { $set: { status: "read" } }
  );
  res.json({ ok: true });
};
