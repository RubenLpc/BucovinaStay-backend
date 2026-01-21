const mongoose = require("mongoose");
const { Schema } = mongoose;

const HostMessageSchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true, index: true },

    // dacă guest e logat, setezi userId
    fromUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // dacă guest e public, permiți nume/email
    guestName: { type: String, trim: true, maxlength: 80, default: "" },
    guestEmail: { type: String, trim: true, maxlength: 120, default: "" },
    guestPhone: { type: String, trim: true, maxlength: 24, default: "" },

    message: { type: String, trim: true, required: true, minlength: 10, maxlength: 1200 },

    status: { type: String, enum: ["new", "read"], default: "new", index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HostMessage", HostMessageSchema);
