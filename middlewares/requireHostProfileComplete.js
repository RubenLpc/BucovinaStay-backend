const HostProfile = require("../models/HostProfile");

module.exports = async function requireHostProfileComplete(req, res, next) {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const profile = await HostProfile.findOne({ userId }).lean();

    const ok =
      profile &&
      typeof profile.displayName === "string" &&
      profile.displayName.trim().length >= 2;

    if (!ok) {
      return res.status(409).json({
        code: "HOST_PROFILE_INCOMPLETE",
        message: "Completează profilul de gazdă înainte să creezi proprietăți.",
        required: ["displayName"],
        hostProfile: profile || null,
      });
    }

    req.hostProfile = profile;
    next();
  } catch (e) {
    next(e);
  }
};
