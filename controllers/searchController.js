const Property = require('../models/Property');

// Standard keyword + filter search
exports.standardSearch = async (req, res) => {
  const { q, city, priceMax, capacityMin } = req.query;
  const filter = {};

  if (city) filter.city = city;
  if (priceMax) filter.pricePerNight = { $lte: Number(priceMax) };
  if (capacityMin) filter.capacity = { $gte: Number(capacityMin) };
  if (q) filter.$text = { $search: q }; // need text index on Property

  const items = await Property.find(filter);
  res.json({ items, total: items.length });
};

// AI-powered search (pseudo implementation)
exports.aiSearch = async (req, res) => {
  const { query, filters } = req.body;

  // Example: parse query with AI (here simple contains match)
  const aiFilter = {};
  if (filters?.city) aiFilter.city = filters.city;
  if (filters?.priceMax) aiFilter.pricePerNight = { $lte: filters.priceMax };
  if (filters?.capacityMin) aiFilter.capacity = { $gte: filters.capacityMin };

  const items = await Property.find({
    ...aiFilter,
    $or: [
      { title: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } }
    ]
  });

  res.json({ queryParsed: { query }, items, total: items.length });
};
