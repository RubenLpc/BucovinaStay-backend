const Property = require("../models/Property");
const HostProfile = require("../models/HostProfile");

async function ensureHostProfileByUserId(userId, displayNameFallback = "Gazdă") {
  let profile = await HostProfile.findOne({ userId });
  if (profile) return profile;

  profile = await HostProfile.create({
    userId,
    displayName: displayNameFallback,
    hostingSince: new Date(),
    responseTimeBucket: "unknown",
  });
  return profile;
}

async function recomputeHostStats(userId, displayNameFallback) {
  await ensureHostProfileByUserId(userId, displayNameFallback);

  // luăm toate proprietățile hostului (poți filtra status: "live" dacă vrei)
  const props = await Property.find({ hostId: userId })
    .select({ ratingAvg: 1, reviewsCount: 1 })
    .lean();

  let totalReviews = 0;
  let weightedSum = 0;

  for (const p of props) {
    const rc = Number(p.reviewsCount || 0);
    const ra = p.ratingAvg == null ? null : Number(p.ratingAvg);

    if (rc > 0 && ra != null) {
      totalReviews += rc;
      weightedSum += ra * rc;
    }
  }

  const ratingAvg = totalReviews > 0 ? Number((weightedSum / totalReviews).toFixed(2)) : null;

  await HostProfile.updateOne(
    { userId },
    {
      $set: {
        "stats.reviewsCount": totalReviews,
        "stats.ratingAvg": ratingAvg,
      },
    }
  );

  return { totalReviews, ratingAvg };
}

module.exports = {
  ensureHostProfileByUserId,
  recomputeHostStats,
};
