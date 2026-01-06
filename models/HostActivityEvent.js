const mongoose = require("mongoose");
const { Schema } = mongoose;

const HostActivityEventSchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // ce s-a întâmplat
    type: {
      type: String,
      required: true,
      index: true,
      enum: [
        // property lifecycle
        "property_created",
        "property_updated",
        "property_submitted",
        "property_published",
        "property_paused",
        "property_resumed",
        "property_rejected",
        "property_deleted",

        // messaging
        "message_received",
        "message_sent",

        // analytics
        "impression",
        "click_contact_phone",
        "click_contact_whatsapp",
        "click_contact_sms",
        "click_share",
        "click_gallery",
      ],
    },

    // legături utile
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", default: null, index: true },
    propertyTitle: { type: String, default: "" },

    // cine a declanșat (host / guest / system)
    actor: { type: String, enum: ["host", "guest", "system"], default: "system", index: true },

    // payload extra (safe)
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

HostActivityEventSchema.index({ hostId: 1, createdAt: -1 });

module.exports = mongoose.model("HostActivityEvent", HostActivityEventSchema);
