const Property = require("../models/Property");
const cloudinary = require("../utils/cloudinary");
const HostProfile = require("../models/HostProfile");
const { mapHostProfilePublic } = require("../mappers/hostProfileMapper");
const {
  ensureHostProfileByUserId,
  recomputeHostStats,
} = require("../services/hostStatsService");
const { recomputeSuperHost } = require("../services/superHostService");
const { logHostActivity } = require("../services/activityLogger");

const buildText = require("../utils/propertyEmbeddingText");
const { embedText } = require("../services/embeddingsService");

const AdminSettings = require("../models/AdminSettings");

async function getSettings() {
  const s = await AdminSettings.findOne({}).lean();
  return s || {};
}

const isOwnerOrAdmin = (req, property) => {
  const isOwner = req.user?._id?.toString() === property.hostId?.toString();
  const isAdmin = req.user?.role === "admin";
  return isOwner || isAdmin;
};

async function upsertEmbeddingForProperty(propertyDoc) {
  const text = buildText(propertyDoc);
  const embedding = await embedText(text);
  if (propertyDoc.embeddingText && propertyDoc.embeddingText === text && propertyDoc.embedding?.length) {
    return false; // no change
  }

  propertyDoc.embeddingText = text; // opțional
  propertyDoc.embedding = embedding; // IMPORTANT
}

// PUBLIC: list live properties
exports.listProperties = async (req, res) => {
  const {
    page = 1,
    limit = 12,
    city,
    type,
    priceMin,
    priceMax,
    capacityMin,
    facilities,
    q,
    sort = "recommended", // recommended | priceAsc | priceDesc | ratingDesc | newest
  } = req.query;

  const filter = { status: "live" };

  if (city) filter.city = city;
  if (type) filter.type = type;

  if (priceMin || priceMax) {
    filter.pricePerNight = {};
    if (priceMin) filter.pricePerNight.$gte = Number(priceMin);
    if (priceMax) filter.pricePerNight.$lte = Number(priceMax);
  }

  if (capacityMin) filter.capacity = { $gte: Number(capacityMin) };

  if (facilities) filter.facilities = { $all: facilities.split(",") };

  if (q) {
    const query = q.trim();
    filter.$or = [
      { title: { $regex: query, $options: "i" } },
      { subtitle: { $regex: query, $options: "i" } },
      { city: { $regex: query, $options: "i" } },
      { locality: { $regex: query, $options: "i" } },
      { type: { $regex: query, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(50, Math.max(1, Number(limit)));

  // sorting
  let sortObj = { createdAt: -1 };
  if (sort === "priceAsc") sortObj = { pricePerNight: 1 };
  if (sort === "priceDesc") sortObj = { pricePerNight: -1 };
  if (sort === "ratingDesc") sortObj = { ratingAvg: -1, reviewsCount: -1 };
  if (sort === "newest") sortObj = { createdAt: -1 };
  if (sort === "recommended")
    sortObj = { ratingAvg: -1, reviewsCount: -1, createdAt: -1 };

  const items = await Property.find(filter)
    .sort(sortObj)
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const total = await Property.countDocuments(filter);

  res.json({ items, total, page: pageNum, limit: limitNum });
};

// PUBLIC: get one (live only unless owner/admin)
exports.getProperty = async (req, res) => {
  const property = await Property.findById(req.params.id).populate(
    "hostId",
    "name phone"
  );
  if (!property) return res.status(404).json({ message: "Property not found" });

  // public can see only live
  const isLive = property.status === "live";
  if (!isLive) {
    if (!req.user)
      return res.status(404).json({ message: "Property not found" });
    // dacă vrei să limitezi: if (!isOwnerOrAdmin(req, property)) return res.status(403).json({ message: "Forbidden" });
  }

  // ✅ ia HostProfile (public) pe baza hostId
  let host = null;
  if (property.hostId) {
    const profile = await HostProfile.findOne({
      userId: property.hostId._id || property.hostId,
    }).lean();
    if (profile) host = mapHostProfilePublic(profile);
    else {
      // fallback minimal (ca să nu fie null în UI)
      const u = property.hostId; // e populat cu name, phone
      host = {
        id: String(u?._id || property.hostId),
        name: u?.name || "Gazdă",
        avatarUrl: "",
        bio: "",
        isSuperHost: false,
        verified: false,
        responseRate: null,
        responseTimeText: "Răspunde, de obicei, rapid",
        reviewsCount: property.reviewsCount || 0, // dacă ai pe property
        rating: property.ratingAvg || null,
        monthsHosting: null,
        disclaimer:
          "Acest anunț este oferit de o persoană fizică. Află mai multe",
        disclaimerHref: "",
      };
    }
  }

  // ✅ în loc de res.json(property)
  res.json({ property, host });
};

// HOST: list my properties (all statuses)
exports.listMyProperties = async (req, res) => {
  const { page = 1, limit = 20, status, q } = req.query;

  const filter = { hostId: req.user._id };
  if (status && status !== "all") filter.status = status;

  if (q) {
    const query = q.trim();
    filter.$or = [
      { title: { $regex: query, $options: "i" } },
      { city: { $regex: query, $options: "i" } },
      { locality: { $regex: query, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(50, Math.max(1, Number(limit)));

  const items = await Property.find(filter)
    .sort({ updatedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  const total = await Property.countDocuments(filter);

  res.json({ items, total, page: pageNum, limit: limitNum });
};

// HOST: create draft
// HOST: create draft
exports.createProperty = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      hostId: req.user._id,
      status: "draft",
    };

    const hostId = req.user._id;

    const s = await getSettings();
    const max = Number(s?.limits?.maxListingsPerHost || 0);

    if (max > 0) {
      const count = await Property.countDocuments({ hostId });
      if (count >= max) {
        return res.status(403).json({
          message: `Limit reached: max ${max} listings per host`,
        });
      }
    }

    // 1) Map latitude/longitude -> geo
    const hasLatLng =
      req.body?.latitude != null &&
      req.body?.longitude != null &&
      req.body.latitude !== "" &&
      req.body.longitude !== "";

    if (hasLatLng) {
      const lat = Number(req.body.latitude);
      const lng = Number(req.body.longitude);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        payload.geo = { type: "Point", coordinates: [lng, lat] };
      }

      delete payload.latitude;
      delete payload.longitude;
    }

    // 2) Normalize geo (NU permite geo incomplet)
    const coords = payload?.geo?.coordinates;
    const okCoords =
      Array.isArray(coords) &&
      coords.length === 2 &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1]);

    if (!okCoords) {
      delete payload.geo;
    }

    // 3) coverImage fallback dacă ai imagini și nu ai coverImage
    if (
      !payload.coverImage &&
      Array.isArray(payload.images) &&
      payload.images.length > 0
    ) {
      payload.coverImage = {
        url: payload.images[0].url,
        publicId: payload.images[0].publicId,
      };
    }

    const property = new Property(payload);

    // 4) Safety net (în caz că schema/ defaults au introdus geo incomplet)
    const coords2 = property?.geo?.coordinates;
    const ok2 =
      Array.isArray(coords2) &&
      coords2.length === 2 &&
      Number.isFinite(coords2[0]) &&
      Number.isFinite(coords2[1]);

    if (!ok2) property.geo = undefined;

    await property.save();
    await ensureHostProfileByUserId(req.user._id, req.user.name || "Gazdă");

    return res.status(201).json(property);
  } catch (err) {
    console.error("createProperty error:", err);
    return res.status(400).json({
      message: "Nu am putut crea draft-ul.",
      error: err?.message || String(err),
    });
  }
};

// HOST: update my property (but prevent direct status hacking)
// HOST: update my property (but prevent direct status hacking)
exports.updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property)
      return res.status(404).json({ message: "Property not found" });

    if (!isOwnerOrAdmin(req, property))
      return res.status(403).json({ message: "Forbidden" });

    // 1) Host nu are voie să seteze status etc (admin poate)
    if (req.user.role !== "admin") {
      const forbidden = [
        "status",
        "approvedAt",
        "rejectedAt",
        "rejectionReason",
        "submittedAt",
      ];
      forbidden.forEach((k) => {
        if (k in req.body) delete req.body[k];
      });
    }

    // 2) Aplică update-urile
    Object.assign(property, req.body);

    // 3) Map latitude/longitude -> geo (după assign, ca să nu fie suprascris)
    const hasLatLng =
      req.body?.latitude != null &&
      req.body?.longitude != null &&
      req.body.latitude !== "" &&
      req.body.longitude !== "";

    if (hasLatLng) {
      const lat = Number(req.body.latitude);
      const lng = Number(req.body.longitude);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        property.geo = { type: "Point", coordinates: [lng, lat] };
      } else {
        property.geo = undefined;
      }
    }

    // 4) Cleanup geo (NU permite geo incomplet)
    const coords = property?.geo?.coordinates;
    const okCoords =
      Array.isArray(coords) &&
      coords.length === 2 &&
      Number.isFinite(coords[0]) &&
      Number.isFinite(coords[1]);

    if (!okCoords) {
      property.geo = undefined;
    }

    // 5) coverImage fallback dacă ai imagini și nu ai coverImage
    if (
      !property.coverImage &&
      Array.isArray(property.images) &&
      property.images.length > 0
    ) {
      property.coverImage = {
        url: property.images[0].url,
        publicId: property.images[0].publicId,
      };
    }
    const shouldReembed =
      property.status === "live" &&
      ("title" in req.body ||
        "subtitle" in req.body ||
        "description" in req.body ||
        "city" in req.body ||
        "locality" in req.body ||
        "type" in req.body ||
        "facilities" in req.body ||
        "capacity" in req.body);

    if (shouldReembed) {
      await upsertEmbeddingForProperty(property);
    }

    await property.save();

    return res.json(property);
  } catch (err) {
    console.error("updateProperty error:", err);
    return res.status(400).json({
      message: "Nu am putut salva modificările.",
      error: err?.message || String(err),
    });
  }
};

// HOST: submit for review (draft -> pending)
exports.submitForReview = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: "Property not found" });

  // only owner host
  if (req.user._id.toString() !== property.hostId.toString())
    return res.status(403).json({ message: "Forbidden" });

  if (property.status !== "draft" && property.status !== "rejected") {
    return res
      .status(400)
      .json({ message: "Only Draft/Rejected can be submitted." });
  }
  const prevStatus = property.status;
  property.status = "pending";
  property.submittedAt = new Date();
  property.rejectedAt = null;
  property.rejectionReason = null;
  await logHostActivity({
    hostId: property.hostId, // sau req.user._id dacă e owner
    type: "property_submitted",
    actor: "host",
    propertyId: property._id,
    propertyTitle: property.title,
    meta: { from: prevStatus, to: "pending" },
  });
  await property.save();
  res.json(property);
};

// HOST: pause/resume (live <-> paused)
exports.togglePause = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: "Property not found" });

  if (req.user._id.toString() !== property.hostId.toString())
    return res.status(403).json({ message: "Forbidden" });
  const prevStatus = property.status;
  if (property.status === "live") property.status = "paused";
  else if (property.status === "paused") property.status = "live";
  else
    return res
      .status(400)
      .json({ message: "Only Live/Paused can be toggled." });
  const nextStatus = property.status;
  await logHostActivity({
    hostId: property.hostId,
    type: nextStatus === "paused" ? "property_paused" : "property_resumed",
    actor: "host",
    propertyId: property._id,
    propertyTitle: property.title,
    meta: { from: prevStatus, to: nextStatus },
  });

  await property.save();
  res.json(property);
};

// ADMIN: approve (pending -> live)
exports.approveProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: "Property not found" });

  if (property.status !== "pending") {
    return res.status(400).json({ message: "Only Pending can be approved." });
  }
  const prevStatus = property.status;
  property.status = "live";
  property.approvedAt = new Date();
  property.rejectedAt = null;
  property.rejectionReason = null;
  await upsertEmbeddingForProperty(property);
  await property.save();

  // ... după update:
  await logHostActivity({
    hostId: property.hostId, // sau req.user._id dacă e owner
    type: "property_approved",
    actor: "host",
    propertyId: property._id,
    propertyTitle: property.title,
    meta: { from: prevStatus, to: "live" },
  });

  await recomputeHostStats(property.hostId);
  await recomputeSuperHost(property.hostId);

  res.json(property);
};

// ADMIN: reject (pending -> rejected)
exports.rejectProperty = async (req, res) => {
  const { reason } = req.body;

  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: "Property not found" });

  if (property.status !== "pending") {
    return res.status(400).json({ message: "Only Pending can be rejected." });
  }
  const prevStatus = property.status;
  property.status = "rejected";
  property.rejectedAt = new Date();
  property.rejectionReason = (reason || "Necesită modificări.").slice(0, 300);

  // ... după update:
  await logHostActivity({
    hostId: property.hostId, // sau req.user._id dacă e owner
    type: "property_rejected",
    actor: "host",
    propertyId: property._id,
    propertyTitle: property.title,
    meta: { from: prevStatus, to: "rejected" },
  });

  await property.save();
  res.json(property);
};

// OWNER or ADMIN: delete
exports.deleteProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ message: "Property not found" });

  if (!isOwnerOrAdmin(req, property))
    return res.status(403).json({ message: "Forbidden" });
  await logHostActivity({
    hostId: property.hostId,
    type: "property_deleted",
    actor: "host",
    propertyId: property._id,
    propertyTitle: property.title,
  });

  await property.deleteOne();
  res.status(204).send();
};

// HOST: upload images

exports.getUploadSignature = async (req, res) => {
  // host/admin only
  const timestamp = Math.round(Date.now() / 1000);

  // IMPORTANT: semnezi exact parametrii pe care îi vei trimite la upload
  // folder recomandat per-host
  const folder = `bucovinastay/hosts/${req.user._id}`;

  const paramsToSign = {
    timestamp,
    folder,
    // optional: aceste două le poți forța din backend
    // transformation: "q_auto,f_auto",
    // allowed_formats: "jpg,png,webp" // nu merge mereu ca param semnat, mai bine verifici în FE + preset
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    timestamp,
    signature,
    folder,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  });
};

exports.attachImages = async (req, res) => {
  const { id } = req.params;
  const { images, coverPublicId } = req.body;
  // images: [{ url, publicId, width, height, format, bytes }]

  const s = await AdminSettings.findOne({}).lean();
  const maxImages = Number(s?.limits?.maxImagesPerListing || 20);

  const prop = await Property.findById(req.params.id)
    .select("images hostId")
    .lean();
  if (!prop) return res.status(404).json({ message: "Not found" });
  if (String(prop.hostId) !== String(req.user._id))
    return res.status(403).json({ message: "Forbidden" });

  if ((prop.images?.length || 0) >= maxImages) {
    return res
      .status(403)
      .json({ message: `Max images per listing: ${maxImages}` });
  }

  const property = await Property.findById(id);
  if (!property) return res.status(404).json({ message: "Property not found" });

  // only owner/admin
  const isOwner = req.user._id.toString() === property.hostId.toString();
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin)
    return res.status(403).json({ message: "Forbidden" });

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ message: "images[] required" });
  }

  // basic validation (production: whitelist domain + must have publicId)
  const cleaned = images
    .filter((img) => img?.url && img?.publicId)
    .map((img) => ({
      url: String(img.url),
      publicId: String(img.publicId),
      width: img.width ? Number(img.width) : undefined,
      height: img.height ? Number(img.height) : undefined,
      format: img.format ? String(img.format) : undefined,
      bytes: img.bytes ? Number(img.bytes) : undefined,
    }));

  // push unique by publicId
  const existing = new Set(property.images.map((i) => i.publicId));
  cleaned.forEach((img) => {
    if (!existing.has(img.publicId)) property.images.push(img);
  });

  // set cover
  if (!property.coverImage?.url && property.images.length > 0) {
    property.coverImage = {
      url: property.images[0].url,
      publicId: property.images[0].publicId,
    };
  }

  // allow setting cover by publicId
  if (coverPublicId) {
    const found = property.images.find((i) => i.publicId === coverPublicId);
    if (found)
      property.coverImage = { url: found.url, publicId: found.publicId };
  }

  await property.save();
  res.json(property);
};

exports.removeImage = async (req, res) => {
  const { id, publicId } = req.params;

  const property = await Property.findById(id);
  if (!property) return res.status(404).json({ message: "Property not found" });

  const isOwner = req.user._id.toString() === property.hostId.toString();
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin)
    return res.status(403).json({ message: "Forbidden" });

  // remove from DB
  property.images = property.images.filter((img) => img.publicId !== publicId);

  // if cover removed -> reset
  if (property.coverImage?.publicId === publicId) {
    const first = property.images[0];
    property.coverImage = first
      ? { url: first.url, publicId: first.publicId }
      : undefined;
  }

  await property.save();

  // delete from cloudinary (best-effort)
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (e) {
    // optional log
  }

  res.json(property);
};

exports.getHighlights = async (req, res) => {
  const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
  const city = (req.query.city || "").trim();

  const filter = { status: "live" };
  if (city) filter.city = city;

  // recommended: rating + reviews + newest
  const items = await Property.find(filter)
    .sort({ ratingAvg: -1, reviewsCount: -1, createdAt: -1 })
    .limit(limit)
    .select({
      title: 1,
      subtitle: 1,
      city: 1,
      locality: 1,
      pricePerNight: 1,
      currency: 1,
      capacity: 1,
      facilities: 1,
      coverImage: 1,
      images: 1,
      ratingAvg: 1,
      reviewsCount: 1,
      createdAt: 1,
    })
    .lean();

  const mapped = items.map((p) => ({
    id: String(p._id),
    title: p.title,
    location: p.locality || p.city || "—",
    pricePerNight: p.pricePerNight,
    currency: p.currency || "RON",
    rating: p.ratingAvg || 0,
    reviews: p.reviewsCount || 0,
    amenities: p.facilities || [],
    guests: p.capacity || 0,
    createdAt: p.createdAt,
    image: p.coverImage?.url || p.images?.[0]?.url || "",
  }));

  res.json({ items: mapped });
};





function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

// GET /api/properties/semantic?q=...
exports.semanticSearch = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ message: "Missing q" });

    const qEmb = await embedText(q);

    // ia un pool rezonabil (pentru proiect; dacă ai mii, treci la Atlas Vector Search)
    const pool = await Property.find({
      status: "live",
      embedding: { $exists: true, $ne: null, $not: { $size: 0 } },
    })
      .select({
        title: 1,
        subtitle: 1,
        city: 1,
        locality: 1,
        county: 1,
        type: 1,
        pricePerNight: 1,
        currency: 1,
        capacity: 1,
        facilities: 1,
        coverImage: 1,
        images: 1,
        ratingAvg: 1,
        reviewsCount: 1,
        createdAt: 1,
        embedding: 1,
      })
      .limit(600) // ajustabil
      .lean();

    const scored = pool
      .map((p) => ({
        p,
        score: cosineSimilarity(qEmb, p.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    // map exact cum vrea HorizontalListings (id, title, location, image, etc.)
    const items = scored.map(({ p, score }) => ({
      id: String(p._id),
      title: p.title,
      location: p.locality || p.city || "—",
      pricePerNight: p.pricePerNight,
      currency: p.currency || "RON",
      rating: p.ratingAvg || 0,
      reviews: p.reviewsCount || 0,
      amenities: p.facilities || [],
      guests: p.capacity || 0,
      createdAt: p.createdAt,
      image: p.coverImage?.url || p.images?.[0]?.url || "",
      aiScore: Number(score.toFixed(4)),
    }));

    res.json({ q, items });
  } catch (e) {
    res.status(500).json({ message: "Semantic search failed", error: e.message || String(e) });
  }
};