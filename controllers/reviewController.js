const Review = require("../models/Review");
const Property = require("../models/Property");
const mongoose = require("mongoose");


// helper: recalc ratingAvg & reviewsCount (vizibile)
async function recalcPropertyRating(propertyId) {
  const agg = await Review.aggregate([

    { $match: { propertyId: new mongoose.Types.ObjectId(propertyId), status: "visible" } },
        {
      $group: {
        _id: "$propertyId",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const avg = agg?.[0]?.avg || 0;
  const count = agg?.[0]?.count || 0;

  await Property.findByIdAndUpdate(propertyId, {
    ratingAvg: Math.round(avg * 10) / 10, // 4.37 -> 4.4 (arata pro)
    reviewsCount: count,
  });
}

// GET /properties/:id/reviews?page&limit
exports.listPropertyReviews = async (req, res) => {
  const { id } = req.params;
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));

  // dacă vrei strict: doar live poate fi public
  const property = await Property.findById(id).select({ status: 1 });
  if (!property) return res.status(404).json({ message: "Property not found" });
  if (property.status !== "live") {
    // preview doar owner/admin (ai deja helper-ul în propertyController; aici facem simplu)
    if (!req.user) return res.status(404).json({ message: "Property not found" });
  }

  const filter = { propertyId: id, status: "visible" };

  const items = await Review.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("userId", "name")
    .lean();

  const total = await Review.countDocuments(filter);

  // shape FE-friendly
  const mapped = items.map((r) => ({
    id: String(r._id),
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    userName: r.userId?.name || "Anonim",
    userId: String(r.userId?._id || ""),
  }));

  res.json({ items: mapped, total, page, limit });
};

// GET /properties/:id/reviews/me
exports.getMyReviewForProperty = async (req, res) => {
  const { id } = req.params;
  const r = await Review.findOne({ propertyId: id, userId: req.user._id }).lean();
  if (!r) return res.json(null);

  res.json({
    id: String(r._id),
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
  });
};

// POST /properties/:id/reviews
exports.createReview = async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  const property = await Property.findById(id).select({ hostId: 1, status: 1 });
  if (!property) return res.status(404).json({ message: "Property not found" });

  // doar live (ca să nu comenteze la draft)
  if (property.status !== "live") {
    return res.status(400).json({ message: "Nu poți lăsa recenzie la o proprietate nelive." });
  }

  // host-ul să nu-și dea recenzie singur
  if (String(property.hostId) === String(req.user._id)) {
    return res.status(400).json({ message: "Nu poți lăsa recenzie la propria proprietate." });
  }

  const ratingNum = Number(rating);
  if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ message: "Rating invalid (1-5)." });
  }

  const text = String(comment || "").trim();
  if (!text) return res.status(400).json({ message: "Comentariul este obligatoriu." });

  try {
    const review = await Review.create({
      propertyId: id,
      userId: req.user._id,
      rating: ratingNum,
      comment: text,
      status: "visible",
    });

    await recalcPropertyRating(id);            
    await recomputeHostStats(property.hostId);
await recomputeSuperHost(property.hostId);
       

    res.status(201).json({
      id: String(review._id),
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      userName: req.user.name,
    });
  } catch (err) {
    // duplicate key -> already reviewed
    if (String(err?.code) === "11000") {
      return res.status(400).json({ message: "Ai lăsat deja o recenzie pentru această proprietate." });
    }
    return res.status(400).json({ message: "Nu am putut salva recenzia.", error: err?.message });
  }
};

// DELETE /properties/:id/reviews/:reviewId  (optional - admin/moderation)
exports.deleteReview = async (req, res) => {
  const { id: propertyId, reviewId } = req.params;

  const review = await Review.findOne({ _id: reviewId, propertyId });
  if (!review) return res.status(404).json({ message: "Review not found" });

  const isOwner = String(review.userId) === String(req.user._id);
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

  await review.deleteOne();
  await recalcPropertyRating(propertyId);

  return res.status(204).send();
};



