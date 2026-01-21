const AdminNotification = require("../models/AdminNotification");

exports.getAdminNotifications = async (req, res, next) => {
  try {
    const { status = "new", type = "all", page = "1", limit = "20" } = req.query;

    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(50, Math.max(1, Number(limit) || 20));

    const filter = {};
    if (status !== "all") filter.status = status;
    if (type !== "all") filter.type = type;

    const [items, total] = await Promise.all([
      AdminNotification.find(filter)
        .sort({ status: 1, createdAt: -1 }) // new first
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      AdminNotification.countDocuments(filter),
    ]);

    res.json({ items, total, page: p, limit: l });
  } catch (err) {
    next(err);
  }
};

exports.getAdminUnreadCount = async (req, res, next) => {
  try {
    const count = await AdminNotification.countDocuments({ status: "new" });
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

exports.markAdminNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const n = await AdminNotification.findById(id);
    if (!n) return res.status(404).json({ message: "Not found" });

    n.status = "read";
    await n.save();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.markAdminNotificationUnread = async (req, res, next) => {
  try {
    const { id } = req.params;
    const n = await AdminNotification.findById(id);
    if (!n) return res.status(404).json({ message: "Not found" });

    n.status = "new";
    await n.save();

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.markAdminNotificationsReadAll = async (req, res, next) => {
  try {
    await AdminNotification.updateMany({ status: "new" }, { $set: { status: "read" } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
