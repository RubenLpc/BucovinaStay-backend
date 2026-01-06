const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 1200 },

    // optional: dacă vrei să permiți edit/review moderation ulterior
    status: { type: String, enum: ["visible", "hidden"], default: "visible", index: true },
  },
  { timestamps: true }
);

// ✅ 1 review / user / property
reviewSchema.index({ propertyId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
