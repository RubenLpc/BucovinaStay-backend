const mongoose = require("mongoose");
const { Schema } = mongoose;

const AdminNotificationSchema = new Schema(
  {
    // status read/unread
    status: { type: String, enum: ["new", "read"], default: "new", index: true },

    // tipuri — extins în timp
    type: {
      type: String,
      required: true,
      index: true,
      enum: [
        // listings
        "listing_pending",
        "listing_published",
        "listing_rejected",
        "listing_reported",

        // users
        "user_reported",
        "user_flagged",

        // reviews
        "review_reported",

        // system
        "system_warning",
        "system_error",
      ],
    },

    severity: { type: String, enum: ["info", "warn", "bad"], default: "info", index: true },

    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 280, default: "" },

    // entity link
    entityType: { type: String, enum: ["property", "user", "review", "system"], default: "system", index: true },
    entityId: { type: Schema.Types.ObjectId, default: null, index: true },

    // util pentru admin UI (ex: propertyTitle)
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

AdminNotificationSchema.index({ createdAt: -1 });
AdminNotificationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("AdminNotification", AdminNotificationSchema);
