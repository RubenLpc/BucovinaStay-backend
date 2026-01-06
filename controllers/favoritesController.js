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
