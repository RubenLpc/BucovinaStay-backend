const mongoose = require("mongoose");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const Property = require("../models/Property"); // ajustează dacă e alt path/nume
const { logHostActivity } = require("../services/activityLogger");

function oid(id) {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function parseRange(range) {
  const m = String(range || "30d").match(/^(\d+)\s*d$/i);
  const days = m ? Math.max(1, Math.min(365, parseInt(m[1], 10))) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
}

/**
 * POST /analytics/impression
 * body: { listingIds: string[] }
 * Public: fail-safe (analytics nu trebuie să strice UX)
 */

exports.impression = async (req, res) => {
  try {
    const listingIdsRaw = req.body?.listingIds;
    if (!Array.isArray(listingIdsRaw) || listingIdsRaw.length === 0) return res.status(204).send();

    const unique = [...new Set(listingIdsRaw)].slice(0, 50);
    const ids = unique.map(oid).filter(Boolean);
    if (!ids.length) return res.status(204).send();

    const props = await Property.find({ _id: { $in: ids } })
      .select("_id hostId title")
      .lean();

    if (!props.length) return res.status(204).send();

    const now = new Date();

    // (optional) păstrezi AnalyticsEvent dacă vrei rapoarte
    const events = props
      .filter((p) => p.hostId)
      .map((p) => ({
        listingId: p._id,
        hostId: p.hostId,
        type: "impression",
        action: "unknown",
        createdAt: now,
      }));

    if (events.length) await AnalyticsEvent.insertMany(events, { ordered: false });

    // ✅ IMPORTANT: scrie și în HostActivityEvent
    await Promise.all(
      props
        .filter((p) => p.hostId)
        .map((p) =>
          logHostActivity({
            hostId: p.hostId,
            type: "impression",
            actor: "guest",
            propertyId: p._id,
            propertyTitle: p.title,
            meta: { ua: req.headers["user-agent"]?.slice(0, 120) },
          })
        )
    );

    return res.status(204).send();
  } catch (err) {
    return res.status(204).send();
  }
};

/**
 * POST /analytics/click
 * body: { listingId: string, action?: string }
 */
exports.click = async (req, res) => {
  try {
    const listingId = oid(req.body?.listingId);
    if (!listingId) return res.status(400).json({ message: "listingId invalid" });

    const action = req.body?.action || "unknown";

    const p = await Property.findById(listingId).select("_id hostId title").lean();
    if (!p?.hostId) return res.status(204).send();

    await AnalyticsEvent.create({
      listingId: p._id,
      hostId: p.hostId,
      type: "click",
      action,
      createdAt: new Date(),
    });

    const mapClickType = (key) => {
      if (key === "contact_phone") return "click_contact_phone";
      if (key === "contact_whatsapp") return "click_contact_whatsapp";
      if (key === "contact_sms") return "click_contact_sms";
      if (key === "share") return "click_share";
      if (key === "contact_gallery") return "click_gallery";
      return null;
    };

    const t = mapClickType(action);
    if (t) {
      await logHostActivity({
        hostId: p.hostId,
        type: t,
        actor: "guest",
        propertyId: p._id,
        propertyTitle: p.title,
        meta: { ua: req.headers["user-agent"]?.slice(0, 120) },
      });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(204).send();
  }
};

/**
 * GET /analytics/host/overview?range=30d
 * Protected: host doar pentru el
 */
exports.hostOverview = async (req, res) => {
  try {
    const hostId = req.user?._id;
    if (!hostId) return res.status(401).json({ message: "Unauthorized" });

    const { from, to, days } = parseRange(req.query?.range);

    const match = {
      hostId: new mongoose.Types.ObjectId(hostId),
      createdAt: { $gte: from, $lte: to },
    };

    // totals + click breakdown by action
    const agg = await AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: { type: "$type", action: "$action" },
          count: { $sum: 1 },
        },
      },
    ]);

    let impressions = 0;
    let clicks = 0;
    const clickActions = {};

    for (const row of agg) {
      const t = row._id?.type;
      const a = row._id?.action || "unknown";
      if (t === "impression") impressions += row.count;
      if (t === "click") {
        clicks += row.count;
        clickActions[a] = (clickActions[a] || 0) + row.count;
      }
    }

    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0;

    // daily timeline
    const dailyAgg = await AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            type: "$type",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]);

    const map = new Map(); // day -> { day, impressions, clicks }
    for (const row of dailyAgg) {
      const day = row._id.day;
      const type = row._id.type;
      if (!map.has(day)) map.set(day, { day, impressions: 0, clicks: 0 });
      const obj = map.get(day);
      if (type === "impression") obj.impressions = row.count;
      if (type === "click") obj.clicks = row.count;
    }

    // fill missing days
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(to.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      daily.push(map.get(key) || { day: key, impressions: 0, clicks: 0 });
    }

    return res.json({
      range: `${days}d`,
      from,
      to,
      impressions,
      clicks,
      ctr,
      clickActions,
      daily,
    });
  } catch (err) {
    return res.status(500).json({ message: "Stats error" });
  }
};

/**
 * GET /analytics/host/listings?range=30d
 * Returnează views/clicks per listing pentru “views30 / clicks30”
 */
exports.hostListingsStats = async (req, res) => {
  try {
    const hostId = req.user?._id;
    if (!hostId) return res.status(401).json({ message: "Unauthorized" });

    const { from, to } = parseRange(req.query?.range);

    const match = {
      hostId: new mongoose.Types.ObjectId(hostId),
      createdAt: { $gte: from, $lte: to },
    };

    const rows = await AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: { listingId: "$listingId", type: "$type" },
          count: { $sum: 1 },
        },
      },
    ]);

    // listingId -> { views30, clicks30 }
    const out = {};
    for (const r of rows) {
      const id = String(r._id.listingId);
      if (!out[id]) out[id] = { views30: 0, clicks30: 0 };
      if (r._id.type === "impression") out[id].views30 = r.count;
      if (r._id.type === "click") out[id].clicks30 = r.count;
    }

    return res.json({ from, to, byListingId: out });
  } catch (err) {
    return res.status(500).json({ message: "Stats error" });
  }
};
