function monthsBetween(fromDate, now = new Date()) {
  if (!fromDate) return null;
  const d1 = new Date(fromDate);
  let months = (now.getFullYear() - d1.getFullYear()) * 12 + (now.getMonth() - d1.getMonth());
  if (now.getDate() < d1.getDate()) months -= 1;
  return Math.max(0, months);
}

function responseTimeText(bucket) {
  if (bucket === "within_hour") return "Răspunde în decurs de o oră";
  if (bucket === "within_day") return "Răspunde în aceeași zi";
  if (bucket === "few_days") return "Răspunde în câteva zile";
  return "Răspunde, de obicei, rapid";
}

function mapHostProfilePublic(profile) {
  if (!profile) return null;

  return {
    id: String(profile.userId),
    name: profile.displayName,
    avatarUrl: profile.avatarUrl || "",
    bio: profile.bio || "",

    isSuperHost: Boolean(profile.isSuperHost),
    verified: Boolean(profile.verified),

    responseRate: profile.responseRate ?? null,
    responseTimeText: responseTimeText(profile.responseTimeBucket),

    reviewsCount: profile.stats?.reviewsCount ?? 0,
    rating: profile.stats?.ratingAvg ?? null,
    monthsHosting: monthsBetween(profile.hostingSince),

    disclaimer: "Acest anunț este oferit de o persoană fizică. Află mai multe",
    disclaimerHref: "",
  };
}

module.exports = { mapHostProfilePublic };
