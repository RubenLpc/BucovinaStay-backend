const router = require("express").Router();
const health = require("../controllers/healthController");

router.get("/", health.getHealth);

module.exports = router;
