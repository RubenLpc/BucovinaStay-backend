const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  slug: { type: String },
  description: { type: String, required: true },
  type: { type: String, enum: ['pensiune', 'cabana', 'hotel', 'apartament', 'vila'], required: true },
  address: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  city: { type: String, required: true },
  region: { type: String, default: 'Bucovina' },
  pricePerNight: { type: Number, required: true },
  currency: { type: String, default: 'EUR' },
  capacity: { type: Number, required: true },
  facilities: [{ type: String }],
  images: [{ type: String }],
  isActive: { type: Boolean, default: false }, // necesita aprobare admin
}, { timestamps: true });

module.exports = mongoose.model('Property', propertySchema);
