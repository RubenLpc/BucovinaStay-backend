const cloudinary = require("../utils/cloudinary");

exports.getCloudinarySignature = async (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const requestedFolder = String(req.query.folder || "").trim();

  let folder = `bucovinastay/host_${req.user._id}`;

  if (requestedFolder === "host_avatars") {
    folder = `bucovinastay/host_avatars/${req.user._id}`;
  }

  if (requestedFolder === "trail_images" && req.user?.role === "admin") {
    folder = `bucovinastay/trails/admin_${req.user._id}`;
  }

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    timestamp,
    signature,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder,
  });
};
