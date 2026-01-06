const mongoose = require("mongoose");

const { Schema } = mongoose;

const HostProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    avatarUrl: { type: String, trim: true, default: "" },
    bio: { type: String, trim: true, maxlength: 1200, default: "" },

    verified: { type: Boolean, default: false },
    isSuperHost: { type: Boolean, default: false },

    hostingSince: { type: Date, default: null },

    responseRate: { type: Number, default: null, min: 0, max: 100 },
    responseTimeBucket: {
      type: String,
      enum: ["within_hour", "within_day", "few_days", "unknown"],
      default: "unknown",
    },

    stats: {
      reviewsCount: { type: Number, default: 0, min: 0 },
      ratingAvg: { type: Number, default: null, min: 0, max: 5 },
    },

    languages: { type: [String], default: [] },
  },
  { timestamps: true }
);

HostProfileSchema.index({ isSuperHost: 1 });
HostProfileSchema.index({ "stats.ratingAvg": -1 });

module.exports = mongoose.model("HostProfile", HostProfileSchema);
