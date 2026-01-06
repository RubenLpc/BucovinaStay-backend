const HostActivityEvent = require("../models/HostActivityEvent");

function parseRange(range) {
  // range: "24h" | "7d" | "30d"
  if (range === "24h") return 24 * 60 * 60 * 1000;
  if (range === "7d") return 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return 30 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

exports.getMyHostActivity = async (req, res, next) => {
  try {
    const hostId = req.user?._id;
    if (!hostId) return res.status(401).json({ message: "Unauthorized" });

    const {
      range = "7d",
      type = "all",
      q = "",
      page = "1",
      limit = "30",
    } = req.query;

    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(10, Number(limit) || 30));

    const sinceMs = parseRange(String(range));
    const since = new Date(Date.now() - sinceMs);

    const filter = { hostId, createdAt: { $gte: since } };

    if (type && type !== "all") filter.type = String(type);

    if (q && String(q).trim()) {
      const needle = String(q).trim();
      filter.$or = [
        { propertyTitle: { $regex: needle, $options: "i" } },
        { type: { $regex: needle, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      HostActivityEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      HostActivityEvent.countDocuments(filter),
    ]);

    // KPI quick summary din aceleași date
    const kpi = {
      impressions: 0,
      clicks: 0,
      messages: 0,
      propertyActions: 0,
    };

    for (const e of items) {
      if (e.type === "impression") kpi.impressions += 1;
      if (String(e.type).startsWith("click_")) kpi.clicks += 1;
      if (String(e.type).startsWith("message_")) kpi.messages += 1;
      if (String(e.type).startsWith("property_")) kpi.propertyActions += 1;
    }

    res.json({ items, total, page: p, limit: l, kpi });
  } catch (err) {
    next(err);
  }
};
