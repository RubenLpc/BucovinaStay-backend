const mongoose = require("mongoose");

const AdminSettingsSchema = new mongoose.Schema(
  {
    // Moderation rules
    moderation: {
      requireSubmitToPublish: { type: Boolean, default: true }, // admin poate publica doar dacă e pending (trimis)
      allowAdminPause: { type: Boolean, default: false },       // admin poate pune pauză? (de obicei false)
      allowAdminReject: { type: Boolean, default: true },        // admin poate respinge (pending)
      allowAdminUnpublish: { type: Boolean, default: true },     // admin poate da jos din live → paused
      minRejectionReasonLength: { type: Number, default: 10, min: 0, max: 300 },
    },

    // App behavior (optional)
    limits: {
      maxListingsPerHost: { type: Number, default: 0, min: 0, max: 100000 }, // 0 = unlimited
      maxImagesPerListing: { type: Number, default: 20, min: 1, max: 200 },
    },

    // Branding / public texts (optional)
    branding: {
      supportEmail: { type: String, default: "", maxlength: 120 },
      maintenanceMode: { type: Boolean, default: false },
      maintenanceMessage: { type: String, default: "", maxlength: 300 },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Singleton document
AdminSettingsSchema.index({ createdAt: 1 });

module.exports = mongoose.model("AdminSettings", AdminSettingsSchema);
