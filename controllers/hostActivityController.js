const HostActivityEvent = require("../models/HostActivityEvent");
const HostSettings = require("../models/HostSettings");

async function getHostSettings(hostId) {
  const doc = await HostSettings.findOneAndUpdate(
    { userId: hostId },
    { $setOnInsert: { userId: hostId } },
    { new: true, upsert: true }
  ).lean();
  return doc || null;
}

function isTypeAllowedBySettings(type, settings) {
  const n = settings?.notifications || {};

  // default true dacă lipsește
  const allowMessages = n.messages !== false;
  const allowListing = n.listingStatus !== false;

  // aici decizi ce intră la “messages” și ce intră la “listingStatus”
  if (String(type).startsWith("message_")) return allowMessages;

  // doar status / acțiuni de proprietăți
  if (
    type === "property_submitted" ||
    type === "property_approved" ||
    type === "property_rejected" ||
    type === "property_paused" ||
    type === "property_resumed" ||
    type === "property_deleted"
  ) {
    return allowListing;
  }

  // analytics / impressions / clicks -> le lăsăm ON (nu sunt notificări “host notifications”)
  return true;
}


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
      includeAll = "0", // dacă vrei un “admin/debug mode” din UI
    } = req.query;

    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(10, Number(limit) || 30));

    const sinceMs = parseRange(String(range));
    const since = new Date(Date.now() - sinceMs);

    const settings = await getHostSettings(hostId);

    // 1) filter de bază (range)
    const baseFilter = { hostId, createdAt: { $gte: since } };

    // 2) citim un pool rezonabil din DB (pe range). Dacă ai foarte multe, optimizăm cu filter direct în Mongo.
    // Aici păstrăm simplu: citește recent + filtrează în memorie.
    const poolLimit = 800; // ajustabil
    const pool = await HostActivityEvent.find(baseFilter)
      .sort({ createdAt: -1 })
      .limit(poolLimit)
      .lean();

    // 3) respectă settings (doar dacă includeAll=0)
    let visible = pool;
    if (String(includeAll) !== "1") {
      visible = visible.filter((e) => isTypeAllowedBySettings(e.type, settings));
    }

    // 4) aplică query params (type, q)
    if (type && type !== "all") visible = visible.filter((e) => String(e.type) === String(type));

    if (q && String(q).trim()) {
      const needle = String(q).trim().toLowerCase();
      visible = visible.filter((e) => {
        const t = String(e.type || "").toLowerCase();
        const pt = String(e.propertyTitle || "").toLowerCase();
        return t.includes(needle) || pt.includes(needle);
      });
    }

    const total = visible.length;

    // 5) paginare (pe lista filtrată)
    const items = visible.slice((p - 1) * l, (p - 1) * l + l);

    // 6) KPI pe ce vede userul
    const kpi = { impressions: 0, clicks: 0, messages: 0, propertyActions: 0 };
    for (const e of visible) {
      if (e.type === "impression") kpi.impressions += 1;
      if (String(e.type).startsWith("click_")) kpi.clicks += 1;
      if (String(e.type).startsWith("message_")) kpi.messages += 1;
      if (String(e.type).startsWith("property_")) kpi.propertyActions += 1;
    }

    res.json({
      items,
      total,
      page: p,
      limit: l,
      kpi,
      settings: {
        notifications: settings?.notifications || {},
        // poți trimite și preferences dacă vrei
      },
    });
  } catch (err) {
    next(err);
  }
};
