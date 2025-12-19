const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const {
  listProperties,
  createProperty,
  getProperty,
  updateProperty,
  deleteProperty,
  uploadImages
} = require('../controllers/propertyController');
const { protect, authorize } = require('../middlewares/auth');

router.get('/', listProperties);
router.post('/', protect, authorize('host'), createProperty);
router.get('/:id', getProperty);
router.put('/:id', protect, authorize('host'), updateProperty);
router.delete('/:id', protect, deleteProperty);
router.post('/:id/images', protect, authorize('host'), upload.array('images'), uploadImages);

module.exports = router;
