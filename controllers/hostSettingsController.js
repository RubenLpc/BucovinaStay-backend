const HostSettings = require("../models/HostSettings");

async function ensureHostSettings(userId) {
  const existing = await HostSettings.findOne({ userId });
  if (existing) return existing;
  return HostSettings.create({ userId });
}

exports.getMyHostSettings = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await ensureHostSettings(userId);
    const settings = await HostSettings.findOne({ userId }).lean();
    return res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.patchMyHostSettings = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await ensureHostSettings(userId);

    const patch = req.body || {};
    const allowed = {};

    if (patch.notifications && typeof patch.notifications === "object") {
      allowed["notifications.messages"] = patch.notifications.messages ?? undefined;
      allowed["notifications.listingStatus"] = patch.notifications.listingStatus ?? undefined;
      allowed["notifications.weeklyReport"] = patch.notifications.weeklyReport ?? undefined;
      allowed["notifications.marketing"] = patch.notifications.marketing ?? undefined;
    }

    if (patch.preferences && typeof patch.preferences === "object") {
      if (typeof patch.preferences.currency === "string") allowed["preferences.currency"] = patch.preferences.currency;
      if (typeof patch.preferences.locale === "string") allowed["preferences.locale"] = patch.preferences.locale;
      if (typeof patch.preferences.timezone === "string") allowed["preferences.timezone"] = patch.preferences.timezone;
      if (typeof patch.preferences.reduceMotion === "boolean")
        allowed["preferences.reduceMotion"] = patch.preferences.reduceMotion;
    }

    // curăță undefined
    Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);

    const updated = await HostSettings.findOneAndUpdate(
      { userId },
      { $set: allowed },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ settings: updated });
  } catch (err) {
    next(err);
  }
};
