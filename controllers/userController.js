const User = require('../models/User');

exports.getUserById = async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
};

exports.updateUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (req.user._id.toString() !== user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  user.name = req.body.name || user.name;
  user.phone = req.body.phone || user.phone;
  await user.save();
  res.json(user);
};

exports.changeUserRole = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.role = req.body.role;
  await user.save();
  res.json({ message: 'Role updated' });
};
