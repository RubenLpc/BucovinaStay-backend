// middlewares/optionalAuth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function optionalAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id role").lean();
    if (user) req.user = user;

    next();
  } catch {
    next();
  }
};
