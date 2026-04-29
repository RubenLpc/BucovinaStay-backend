const Trail = require("../models/Trail");

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

exports.listPublishedTrails = async (req, res, next) => {
  try {
    const page = clamp(parseInt(req.query.page || "1", 10), 1, 10_000);
    const limit = clamp(parseInt(req.query.limit || "24", 10), 1, 100);
    const q = String(req.query.q || "").trim();
    const difficulty = String(req.query.difficulty || "all").trim();
    const tag = String(req.query.tag || "all").trim();

    const filter = { status: "published" };

    if (difficulty !== "all") filter.difficulty = difficulty;
    if (tag !== "all") filter.tags = tag;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { area: { $regex: q, $options: "i" } },
        { season: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Trail.find(filter)
        .select(
          "name slug area difficulty durationHrs distanceKm season tags image imageFallbackUrl sourceUrl sourceLabel officialLinks summary status isVerified createdAt updatedAt"
        )
        .sort({ isVerified: -1, updatedAt: -1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Trail.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
};
