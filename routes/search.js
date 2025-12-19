const express = require('express');
const router = express.Router();
const { standardSearch, aiSearch } = require('../controllers/searchController');

router.get('/', standardSearch);
router.post('/ai', aiSearch);

module.exports = router;
