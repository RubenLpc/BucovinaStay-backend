// routes/adminRoutes.js
const router = require("express").Router();
const { protect, authorize } = require("../middlewares/auth");
const admin = require("../controllers/adminController");


router.get("/overview", protect, authorize( "admin"),admin.getOverview);

router.get("/users", protect, authorize("admin"),admin.listUsers);
router.patch("/users/:id", protect, authorize( "admin"),admin.patchUser);

router.get("/properties",protect, authorize( "admin"), admin.listProperties);
router.patch("/properties/:id/status",protect, authorize( "admin"), admin.setPropertyStatus);

router.get("/settings", protect, authorize("admin"), admin.getSettings);
router.put("/settings", protect, authorize("admin"), admin.saveSettings);


// Reviews moderation
router.get("/reviews", protect, authorize("admin"), admin.listReviews);
router.patch("/reviews/:id", protect, authorize("admin"), admin.patchReview);
// optional hard delete:
router.delete("/reviews/:id", protect, authorize("admin"), admin.deleteReview);



module.exports = router;
