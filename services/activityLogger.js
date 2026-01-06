const HostActivityEvent = require("../models/HostActivityEvent");

function cleanString(v, max = 120) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length > max ? s.slice(0, max).trim() : s;
}

async function logHostActivity({
  hostId,
  type,
  actor = "system",
  propertyId = null,
  propertyTitle = "",
  meta = {},
}) {
  if (!hostId || !type) return;

  try {
    await HostActivityEvent.create({
      hostId,
      type,
      actor,
      propertyId,
      propertyTitle: cleanString(propertyTitle, 140),
      meta: meta && typeof meta === "object" ? meta : {},
    });
  } catch (e) {
    // nu bloca fluxul principal
    // console.error("logHostActivity failed:", e.message);
  }
}

module.exports = { logHostActivity };
