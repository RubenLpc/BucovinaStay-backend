const router = require("express").Router();
const trails = require("../controllers/trailController");

router.get("/", trails.listPublishedTrails);

module.exports = router;
