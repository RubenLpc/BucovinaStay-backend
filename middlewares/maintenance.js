const AdminSettings = require("../models/AdminSettings");

let cache = { at: 0, doc: null };
const CACHE_MS = 10_000;

async function getSettingsCached() {
  const now = Date.now();
  if (cache.doc && now - cache.at < CACHE_MS) return cache.doc;

  let doc = await AdminSettings.findOne({}).lean();
  if (!doc) {
    const created = await AdminSettings.create({});
    doc = created.toObject();
  }

  cache = { at: now, doc };
  return doc;
}

module.exports = function maintenanceGuard({ allow = [] } = {}) {
  return async function (req, res, next) {
    try {
      const path = req.path || "";
      const allowed = allow.some((p) => path.startsWith(p));
      if (allowed) return next();

      const settings = await getSettingsCached();
      const branding = settings?.branding || {};

      if (!branding.maintenanceMode) return next();

      // IMPORTANT: returnează JSON cu fields clare
      return res.status(503).json({
        code: "MAINTENANCE",
        message: branding.maintenanceMessage || "Platforma e în mentenanță. Revenim în curând.",
        supportEmail: branding.supportEmail || "",
      });
    } catch (e) {
      // dacă middleware pică, nu bloca tot site-ul
      return next();
    }
  };
};
