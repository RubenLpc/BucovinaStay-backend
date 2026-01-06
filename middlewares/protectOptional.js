const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protectOptional = async (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return next(); // public

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (user) req.user = user;

    return next();
  } catch (error) {
    // dacă tokenul e invalid, nu blocăm (endpoint public), doar tratăm ca guest
    return next();
  }
};

module.exports = { protectOptional };
