const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// ================= REGISTER =================
exports.register = async (req, res) => {
  try {
    const { email, password, name, role,phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      email,
      password,
      name,role
      // role vine automat = 'guest'
    });

    res.status(201).json({
      token: generateToken(user._id),
      expiresIn: 3600,
      user
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Missing credentials' });
    }

    const user = await User.findOne({ email });

    if (user.disabled) {
      return res.status(403).json({ message: "Cont dezactivat. Contactează suportul." });
    }
    

    if (user && (await user.matchPassword(password))) {
      res.json({
        token: generateToken(user._id),
        expiresIn: 3600,
        user
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================= GET ME =================
exports.getMe = async (req, res) => {
  res.json(req.user);
};


// ✅ UPDATE PROFILE (name + phone)
exports.updateMe = async (req, res) => {
  const { name, phone } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (typeof name === "string") user.name = name;
  if (typeof phone === "string") user.phone = phone;

  await user.save();

  const safeUser = await User.findById(user._id).select("-password");
  res.json(safeUser);
};

exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Missing fields" });
    if (String(newPassword).length < 6) return res.status(400).json({ message: "Password too short" });

    const user = await User.findById(userId).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(String(currentPassword), user.password);
    if (!ok) return res.status(400).json({ message: "Current password invalid" });

    // IMPORTANT: setăm parola în clar, iar modelul o va hash-ui în pre('save')
    user.password = String(newPassword);
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};


// TEMPORAR – scoate după fix
exports.forceResetPassword = async (req, res) => {
  const { userId, newPassword } = req.body;

  if (!userId || !newPassword)
    return res.status(400).json({ message: "Missing fields" });

  if (newPassword.length < 6)
    return res.status(400).json({ message: "Password too short" });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  // ⚠️ NU HASH MANUAL
  user.password = newPassword;
  await user.save();

  res.json({ ok: true });
};

