const stripe = require('../config/stripe');
const Subscription = require('../models/Subscription');

exports.createCheckoutSession = async (req, res) => {
  const { priceId } = req.body;

  // Disable subscription first 2 months
  const now = new Date();
  const disableUntil = new Date(now.setMonth(now.getMonth() + 2));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.CLIENT_URL}/subscription-success`,
    cancel_url: `${process.env.CLIENT_URL}/subscription-cancel`,
    customer_email: req.user.email,
    metadata: {
      userId: req.user._id.toString(),
      disabledUntil: disableUntil.toISOString()
    }
  });

  res.json({ sessionId: session.id });
};

exports.getStatus = async (req, res) => {
  const subscription = await Subscription.findOne({ userId: req.user._id });
  if (!subscription) return res.json({ active: false });
  res.json({
    active: subscription.active,
    current_period_end: subscription.current_period_end,
    plan: subscription.plan
  });
};
