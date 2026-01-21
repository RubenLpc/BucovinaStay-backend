// server/controllers/favoritesController.js
const Favorite = require("../models/Favorite");

exports.listMyFavorites = async (req, res) => {
  const rows = await Favorite.find({ userId: req.user._id }).select({ propertyId: 1 }).lean();
  res.json({ items: rows.map((r) => String(r.propertyId)) });
};

exports.addFavorite = async (req, res) => {
  const propertyId = req.params.propertyId;
  await Favorite.updateOne(
    { userId: req.user._id, propertyId },
    { $setOnInsert: { userId: req.user._id, propertyId } },
    { upsert: true }
  );
  res.status(204).send();
};

exports.removeFavorite = async (req, res) => {
  const propertyId = req.params.propertyId;
  await Favorite.deleteOne({ userId: req.user._id, propertyId });
  res.status(204).send();
};

const mapPropertyPreview = (p) => ({
  id: String(p._id),
  title: p.title,
  city: p.city,
  locality: p.locality || "",
  location: p.locality || p.city, // same as your virtual
  pricePerNight: p.pricePerNight,
  currency: p.currency || "RON",
  image: p.coverImage?.url || p.images?.[0]?.url || "",
  status: p.status,
});

exports.listMyFavoritesPreview = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "6", 10), 12);

  const favs = await Favorite.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate({
      path: "propertyId",
      // folosim exact câmpurile tale
      select: "title city locality pricePerNight currency coverImage images status",
    })
    .lean();

  const items = favs
    .map((f) => f.propertyId)
    .filter(Boolean)
    // opțional: arată doar live ca să nu apară draft/paused
    // .filter((p) => p.status === "live")
    .map(mapPropertyPreview);

  res.json({ items });
};

exports.listMyFavoritesAll = async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(parseInt(req.query.limit || "24", 10), 48);
  const skip = (page - 1) * limit;

  const [total, favs] = await Promise.all([
    Favorite.countDocuments({ userId: req.user._id }),
    Favorite.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "propertyId",
        select: "title city locality pricePerNight currency coverImage images status",
      })
      .lean(),
  ]);

  const items = favs
    .map((f) => f.propertyId)
    .filter(Boolean)
    // .filter((p) => p.status === "live")
    .map(mapPropertyPreview);

  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
};
