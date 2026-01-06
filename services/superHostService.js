const HostProfile = require("../models/HostProfile");

async function recomputeSuperHost(userId) {
  const profile = await HostProfile.findOne({ userId }).lean();
  if (!profile) return null;

  const rating = profile.stats?.ratingAvg ?? null;
  const reviews = profile.stats?.reviewsCount ?? 0;

  const isSuperHost = (rating != null && rating >= 4.8 && reviews >= 20);

  await HostProfile.updateOne({ userId }, { $set: { isSuperHost } });
  return isSuperHost;
}

module.exports = { recomputeSuperHost };
