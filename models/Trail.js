const mongoose = require("mongoose");

const OFFICIAL_LINK_SCHEMA = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 120, required: true },
    url: { type: String, trim: true, maxlength: 500, required: true },
  },
  { _id: false }
);

const TRAIL_IMAGE_SCHEMA = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: Number,
    height: Number,
    format: String,
    bytes: Number,
  },
  { _id: false }
);

const trailSchema = new mongoose.Schema(
  {
    seedId: { type: String, trim: true, maxlength: 80, index: true, sparse: true },
    name: { type: String, trim: true, required: true, maxlength: 140 },
    slug: { type: String, trim: true, required: true, maxlength: 180, unique: true, index: true },
    area: { type: String, trim: true, required: true, maxlength: 140, index: true },
    difficulty: {
      type: String,
      enum: ["Ușor", "Mediu", "Greu"],
      required: true,
      index: true,
    },
    durationHrs: { type: Number, min: 0, max: 240, default: null },
    distanceKm: { type: Number, min: 0, max: 2000, default: null },
    season: { type: String, trim: true, maxlength: 120, default: "" },
    tags: [{ type: String, trim: true, maxlength: 40, index: true }],
    image: { type: TRAIL_IMAGE_SCHEMA, default: null },
    imageFallbackUrl: { type: String, trim: true, maxlength: 500, default: "" },
    sourceUrl: { type: String, trim: true, required: true, maxlength: 500 },
    sourceLabel: { type: String, trim: true, maxlength: 120, default: "Sursă oficială" },
    officialLinks: { type: [OFFICIAL_LINK_SCHEMA], default: [] },
    summary: { type: String, trim: true, maxlength: 500, default: "" },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    isVerified: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

trailSchema.index({ name: "text", area: "text", tags: "text", season: "text" });

module.exports = mongoose.model("Trail", trailSchema);
