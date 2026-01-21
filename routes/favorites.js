// server/routes/favoritesRoutes.js
const router = require("express").Router();
const fav = require("../controllers/favoritesController");
const { protect, authorize } = require("../middlewares/auth");
const { listMyFavorites, addFavorite, removeFavorite,listMyFavoritesPreview,listMyFavoritesAll } = require("../controllers/favoritesController");


router.get("/me", protect, listMyFavorites);

router.get("/me/preview", protect, listMyFavoritesPreview);
router.get("/me/all", protect, listMyFavoritesAll);

router.post("/:propertyId", protect, addFavorite);
router.delete("/:propertyId", protect, removeFavorite);

module.exports = router;
