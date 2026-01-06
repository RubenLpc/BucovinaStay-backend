const mongoose = require("mongoose");

const FACILITIES = [
  "wifi",
  "parking",
  "breakfast",
  "petFriendly",
  "spa",
  "kitchen",
  "ac",
  "sauna",
  "fireplace",
];

const TYPES = ["pensiune", "cabana", "hotel", "apartament", "vila", "tiny_house"];

const propertySchema = new mongoose.Schema(
  {
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Core content
    title: { type: String, required: true, trim: true, maxlength: 90 },
    subtitle: { type: String, trim: true, maxlength: 60 }, // UI helper
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    
    description: { type: String, required: true, trim: true, maxlength: 4000 },

    type: { type: String, enum: TYPES, required: true, index: true },

    // Location
    region: { type: String, default: "Bucovina", index: true },
    county: { type: String, default: "Suceava", index: true }, // optional, dar util
    city: { type: String, required: true, trim: true, index: true }, // oraș (Suceava)
    locality: { type: String, trim: true }, // sat/comună (Voroneț)
    addressLine: { type: String, trim: true },

    geo: {
      type: { type: String, enum: ["Point"] },   // <- fără default
      coordinates: { type: [Number] },           // <- fără default
    },
    

    // Pricing & capacity
    pricePerNight: { type: Number, required: true, min: 0, index: true },
    currency: { type: String, default: "RON" },
    capacity: { type: Number, required: true, min: 1, index: true }, // maxGuests

    // Facilities / images
    facilities: [{ type: String, enum: FACILITIES, index: true }],
   // in Property schema
images: [
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true }, // cloudinary public_id
    width: Number,
    height: Number,
    format: String,
    bytes: Number,
  }
],
coverImage: {
  url: String,
  publicId: String,
},
 // UI helper (fallback images[0])

    // Badges (UI helper)
    badges: [{ type: String, maxlength: 24 }],

    // Workflow
    status: {
      type: String,
      enum: ["draft", "pending", "live", "paused", "rejected"],
      default: "draft",
      index: true,
    },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 300 },

    // Optional: păstrezi look-ul card-ului
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// For maps (optional)
propertySchema.index(
  { geo: "2dsphere" },
  { partialFilterExpression: { "geo.coordinates": { $exists: true } } }
);

propertySchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } }
);
// 

// Virtuals for frontend compatibility (StayCard)
propertySchema.virtual("name").get(function () {
  return this.title;
});
propertySchema.virtual("location").get(function () {
  return this.locality || this.city;
});
propertySchema.virtual("maxGuests").get(function () {
  return this.capacity;
});
propertySchema.virtual("image").get(function () {
  return this.coverImage?.url || this.images?.[0]?.url || "";
});

propertySchema.virtual("amenities").get(function () {
  return this.facilities || [];
});

module.exports = mongoose.model("Property", propertySchema);
