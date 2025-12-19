const Review = require('../models/Review');
const Property = require('../models/Property');

exports.listReviews = async (req, res) => {
  const reviews = await Review.find({ propertyId: req.params.id });
  res.json(reviews);
};

exports.addReview = async (req, res) => {
  const { rating, title, comment } = req.body;
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: 'Property not found' });

  // Optional: check if user stayed (skipped since no reservations)
  const review = await Review.create({
    propertyId: property._id,
    userId: req.user._id,
    rating,
    title,
    comment
  });
  res.status(201).json(review);
};
