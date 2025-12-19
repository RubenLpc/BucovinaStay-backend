const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stripeSubscriptionId: { type: String },
  active: { type: Boolean, default: false },
  current_period_end: { type: Date },
  plan: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
