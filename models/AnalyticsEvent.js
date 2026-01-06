const mongoose = require("mongoose");

const AnalyticsEventSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },

    // IMPORTANT: la tine e hostId
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["impression", "click"],
      required: true,
      index: true,
    },

    // optional (dar foarte util)
    action: {
      type: String,
      enum: ["open", "contact_phone", "contact_whatsapp", "message", "share", "unknown"],
      default: "unknown",
      index: true,
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

// indexuri pt stats rapide
AnalyticsEventSchema.index({ hostId: 1, createdAt: -1, type: 1 });
AnalyticsEventSchema.index({ listingId: 1, createdAt: -1, type: 1 });

// optional: TTL 180 zile (activează când vrei)
/// AnalyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = mongoose.model("AnalyticsEvent", AnalyticsEventSchema);
