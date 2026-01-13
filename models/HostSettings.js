const mongoose = require("mongoose");
const { Schema } = mongoose;

const HostSettingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    notifications: {
      messages: { type: Boolean, default: true },
      listingStatus: { type: Boolean, default: true },
      weeklyReport: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
    },

    preferences: {
      currency: { type: String, default: "RON" },
      locale: { type: String, default: "ro-RO" },
      timezone: { type: String, default: "Europe/Bucharest" },
      reduceMotion: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HostSettings", HostSettingsSchema);
