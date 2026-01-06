const express = require("express");
const router = express.Router();
const { getCloudinarySignature } = require("../controllers/uploadController");


const {
getHighlights,
  listProperties,
  getUploadSignature,
  attachImages,
  removeImage,
  getProperty,
  listMyProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  uploadImages,
  submitForReview,
  togglePause,
  approveProperty,
  rejectProperty,
} = require("../controllers/propertyController");

const { protect, authorize } = require("../middlewares/auth");

/**
 * PUBLIC
 */
router.get("/highlights", getHighlights);

router.get("/", listProperties);

/**
 * HOST (separate prefix recommended)
 *  -> mount this router also at /api/host/properties OR create a separate host router file
 */
router.get("/host/me", protect, authorize("host", "admin"), listMyProperties);
router.post("/host", protect, authorize("host", "admin"), createProperty);
router.put("/host/:id", protect, authorize("host", "admin"), updateProperty);
router.delete("/host/:id", protect, authorize("host", "admin"), deleteProperty);

router.get("/host/upload-signature", protect, authorize("host", "admin"), getUploadSignature);

router.post("/host/:id/images", protect, authorize("host", "admin"), attachImages);

router.delete("/host/:id/images/:publicId", protect, authorize("host", "admin"), removeImage);
router.post("/host/:id/submit", protect, authorize("host", "admin"), submitForReview);
router.post("/host/:id/toggle-pause", protect, authorize("host", "admin"), togglePause);

/**
 * ADMIN
 */
router.post("/admin/:id/approve", protect, authorize("admin"), approveProperty);
router.post("/admin/:id/reject", protect, authorize("admin"), rejectProperty);



router.post("/cloudinary-signature", protect, authorize("host","admin"), getCloudinarySignature);
router.get("/highlights", getHighlights);

router.get("/:id", protectOptional, getProperty); // optional auth for draft preview by owner/admin



module.exports = router;

/**
 * Optional auth helper (so public can view live, but logged users can view own drafts)
 * If you don’t want optional auth, you can just use getProperty public-only (no preview).
 */
function protectOptional(req, res, next) {
  // if you already have a middleware for optional auth, use it.
  // Here’s a simple pattern: try protect if token exists, else continue.
  const hasAuth = req.headers.authorization && req.headers.authorization.startsWith("Bearer ");
  if (!hasAuth) return next();

  // reuse your protect middleware if it calls next(err) on fail
  return require("../middlewares/auth").protect(req, res, next);
}
