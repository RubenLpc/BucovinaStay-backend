const express = require("express");
const Property = require("../models/Property");
const { embedText } = require("../services/embeddingsService");

const router = express.Router();
const propertyController = require("../controllers/propertyController");

// server/routes/properties.js
router.get("/semantic", propertyController.semanticSearch);


module.exports = router;
