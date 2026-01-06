const cloudinary = require("../utils/cloudinary");

exports.getCloudinarySignature = async (req, res) => {
  // host/admin only
  const timestamp = Math.round(Date.now() / 1000);

  const folder = `bucovinastay/host_${req.user._id}`; // organizează pe host
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
