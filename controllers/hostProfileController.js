const HostProfile = require("../models/HostProfile");
const { mapHostProfilePublic } = require("../mappers/hostProfileMapper");

async function ensureHostProfile(user) {
  const existing = await HostProfile.findOne({ userId: user._id });
  if (existing) return existing;

  return HostProfile.create({
    userId: user._id,
    displayName: user.name || user.fullName || "Gazdă",
    hostingSince: new Date(),
  });
}

exports.getHostProfilePublic = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await HostProfile.findOne({ userId }).lean();
    if (!profile) return res.status(404).json({ message: "Host profile not found" });

    res.json({ host: mapHostProfilePublic(profile) });
  } catch (err) {
    next(err);
  }
};

exports.getMyHostProfile = async (req, res, next) => {
  try {
    const user = req.user;
    await ensureHostProfile(user);

    const profile = await HostProfile.findOne({ userId: user._id }).lean();
    res.json({ hostProfile: profile });
  } catch (err) {
    next(err);
  }
};

exports.patchMyHostProfile = async (req, res, next) => {
  try {
    const user = req.user;
    await ensureHostProfile(user);

    const patch = req.body || {};
    const allowed = {};

    if (typeof patch.displayName === "string") allowed.displayName = patch.displayName.trim();
    if (typeof patch.avatarUrl === "string") allowed.avatarUrl = patch.avatarUrl.trim();
    if (typeof patch.bio === "string") allowed.bio = patch.bio.trim();
    if (Array.isArray(patch.languages)) allowed.languages = patch.languages.map(String).slice(0, 10);

    const updated = await HostProfile.findOneAndUpdate(
      { userId: user._id },
      { $set: allowed },
      { new: true, runValidators: true }
    ).lean();

    res.json({ hostProfile: updated });
  } catch (err) {
    next(err);
  }
};
