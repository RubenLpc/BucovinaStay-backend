const Property = require('../models/Property');
const cloudinary = require('../utils/cloudinary');

exports.listProperties = async (req, res) => {
  const { page = 1, limit = 10, city, type, priceMin, priceMax, capacityMin, facilities } = req.query;
  const filter = {};
  if (city) filter.city = city;
  if (type) filter.type = type;
  if (priceMin) filter.pricePerNight = { ...filter.pricePerNight, $gte: Number(priceMin) };
  if (priceMax) filter.pricePerNight = { ...filter.pricePerNight, $lte: Number(priceMax) };
  if (capacityMin) filter.capacity = { $gte: Number(capacityMin) };
  if (facilities) filter.facilities = { $all: facilities.split(',') };

  const items = await Property.find(filter)
    .skip((page-1)*limit)
    .limit(Number(limit));
  const total = await Property.countDocuments(filter);
  res.json({ items, total, page: Number(page), limit: Number(limit) });
};

exports.createProperty = async (req, res) => {
  const property = new Property({ ...req.body, hostId: req.user._id });
  await property.save();
  res.status(201).json(property);
};

exports.getProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: 'Property not found' });
  res.json(property);
};

exports.updateProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: 'Property not found' });
  if (req.user._id.toString() !== property.hostId.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  Object.assign(property, req.body);
  await property.save();
  res.json(property);
};

exports.deleteProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: 'Property not found' });
  if (req.user._id.toString() !== property.hostId.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  await property.remove();
  res.status(204).send();
};

exports.uploadImages = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: 'Property not found' });

  const uploaded = [];
  for (const file of req.files) {
    const result = await cloudinary.uploader.upload(file.path);
    uploaded.push(result.secure_url);
    property.images.push(result.secure_url);
  }
  await property.save();
  res.json({ urls: uploaded });
};
