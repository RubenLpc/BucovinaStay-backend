const AdminSettings = require("../models/AdminSettings");

async function getOrCreateSettings() {
  let doc = await AdminSettings.findOne({}).lean();
  if (!doc) {
    const created = await AdminSettings.create({});
    doc = created.toObject();
  }
  return doc;
}

exports.getHealth = async (req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    const branding = s?.branding || {};

    res.json({
      ok: true,
      maintenance: {
        enabled: !!branding.maintenanceMode,
        message: branding.maintenanceMessage || "",
        supportEmail: branding.supportEmail || "",
      },
      ts: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};
