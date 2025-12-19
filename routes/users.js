const express = require('express');
const router = express.Router();
const { getUserById, updateUser, changeUserRole } = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/auth');

router.get('/:id', getUserById);
router.put('/:id', protect, updateUser);
router.patch('/:id/role', protect, authorize('admin'), changeUserRole);

module.exports = router;
