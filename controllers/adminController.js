// controllers/adminController.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Property = require("../models/Property");
const Review = require("../models/Review");
const Trail = require("../models/Trail");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const AdminSettings = require("../models/AdminSettings");
const { clearMaintenanceCache } = require("../middlewares/maintenance");
const cloudinary = require("../utils/cloudinary");

const TRAIL_DIFFICULTIES = ["Ușor", "Mediu", "Greu"];
const TRAIL_STATUSES = ["draft", "published", "archived"];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function supportEmailValid(v) {
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}

function isValidHttpUrl(v) {
  try {
    const url = new URL(String(v || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function slugifyTrail(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

async function ensureUniqueTrailSlug(base, excludeId = null) {
  const clean = slugifyTrail(base) || `trail-${Date.now()}`;
  let candidate = clean;
  let index = 2;

  while (true) {
    const existing = await Trail.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select("_id")
      .lean();
    if (!existing) return candidate;
    candidate = `${clean}-${index++}`;
  }
}

function normalizeTags(tags) {
  const raw = Array.isArray(tags)
    ? tags
    : String(tags || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

  return Array.from(
    new Set(
      raw
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function normalizeOfficialLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      label: String(link?.label || "").trim(),
      url: String(link?.url || "").trim(),
    }))
    .filter((link) => link.label && isValidHttpUrl(link.url))
    .slice(0, 8);
}

function normalizeTrailImage(image) {
  if (image === undefined) return undefined;
  if (image === null || image === "") return null;

  if (typeof image !== "object") {
    throw new Error("Invalid image");
  }

  const out = {
    url: String(image.url || "").trim(),
    publicId: String(image.publicId || "").trim(),
    width: image.width != null ? Number(image.width) : undefined,
    height: image.height != null ? Number(image.height) : undefined,
    format: image.format ? String(image.format).trim() : undefined,
    bytes: image.bytes != null ? Number(image.bytes) : undefined,
  };

  if (!isValidHttpUrl(out.url) || !out.publicId) {
    throw new Error("Invalid image");
  }

  return out;
}

function parseNullableNumber(value, label, { min = 0, max = 10000 } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new Error(`Invalid ${label}`);
  }
  return num;
}

function normalizeTrailPayload(body, { partial = false } = {}) {
  const payload = {};
  const source = body || {};

  const name = source.name !== undefined ? String(source.name || "").trim() : undefined;
  const area = source.area !== undefined ? String(source.area || "").trim() : undefined;
  const difficulty =
    source.difficulty !== undefined ? String(source.difficulty || "").trim() : undefined;
  const sourceUrl =
    source.sourceUrl !== undefined ? String(source.sourceUrl || "").trim() : undefined;

  if (!partial || name !== undefined) {
    if (!name) throw new Error("Name is required");
    if (name.length > 140) throw new Error("Invalid name");
    payload.name = name;
  }

  if (!partial || area !== undefined) {
    if (!area) throw new Error("Area is required");
    if (area.length > 140) throw new Error("Invalid area");
    payload.area = area;
  }

  if (!partial || difficulty !== undefined) {
    if (!TRAIL_DIFFICULTIES.includes(difficulty)) {
      throw new Error("Invalid difficulty");
    }
    payload.difficulty = difficulty;
  }

  if (!partial || sourceUrl !== undefined) {
    if (!isValidHttpUrl(sourceUrl)) throw new Error("Invalid sourceUrl");
    payload.sourceUrl = sourceUrl;
  }

  if (source.slug !== undefined) {
    const slug = slugifyTrail(source.slug);
    if (!slug) throw new Error("Invalid slug");
    payload.slug = slug;
  }

  if (source.status !== undefined) {
    const status = String(source.status || "").trim();
    if (!TRAIL_STATUSES.includes(status)) throw new Error("Invalid status");
    payload.status = status;
  }

  if (source.seedId !== undefined) {
    const seedId = String(source.seedId || "").trim();
    if (seedId && seedId.length > 80) throw new Error("Invalid seedId");
    payload.seedId = seedId || undefined;
  }

  if (source.sourceLabel !== undefined) {
    const sourceLabel = String(source.sourceLabel || "").trim();
    if (sourceLabel.length > 120) throw new Error("Invalid sourceLabel");
    payload.sourceLabel = sourceLabel || "Sursă oficială";
  }

  if (source.summary !== undefined) {
    const summary = String(source.summary || "").trim();
    if (summary.length > 500) throw new Error("Invalid summary");
    payload.summary = summary;
  }

  if (source.image !== undefined) {
    payload.image = normalizeTrailImage(source.image);
  }

  if (source.imageFallbackUrl !== undefined) {
    const imageFallbackUrl = String(source.imageFallbackUrl || "").trim();
    if (imageFallbackUrl && !isValidHttpUrl(imageFallbackUrl)) {
      throw new Error("Invalid imageFallbackUrl");
    }
    payload.imageFallbackUrl = imageFallbackUrl;
  }

  if (source.season !== undefined) {
    const season = String(source.season || "").trim();
    if (season.length > 120) throw new Error("Invalid season");
    payload.season = season;
  }

  if (source.tags !== undefined) {
    payload.tags = normalizeTags(source.tags);
  }

  if (source.officialLinks !== undefined) {
    payload.officialLinks = normalizeOfficialLinks(source.officialLinks);
  }

  if (source.isVerified !== undefined) {
    payload.isVerified = Boolean(source.isVerified);
  }

  const durationHrs = parseNullableNumber(source.durationHrs, "durationHrs", { min: 0, max: 240 });
  if (durationHrs !== undefined) payload.durationHrs = durationHrs;

  const distanceKm = parseNullableNumber(source.distanceKm, "distanceKm", { min: 0, max: 2000 });
  if (distanceKm !== undefined) payload.distanceKm = distanceKm;

  return payload;
}

function mapSeedTrail(item = {}) {
  const officialLinks = normalizeOfficialLinks(item.officialLinks);
  return {
    seedId: String(item.id || "").trim() || undefined,
    name: String(item.name || "").trim(),
    area: String(item.area || "").trim(),
    difficulty: String(item.difficulty || "").trim(),
    durationHrs: item.durationHrs ?? null,
    distanceKm: item.distanceKm ?? null,
    season: String(item.season || "").trim(),
    tags: normalizeTags(item.tags),
    image: null,
    imageFallbackUrl: String(item.image || "").trim(),
    sourceUrl: String(item.url || "").trim(),
    sourceLabel: officialLinks[0]?.label || "Sursă oficială",
    officialLinks,
    summary: "",
  };
}

function labelForSetting(path) {
  const labels = {
    "moderation.requireSubmitToPublish": "Require submit to publish",
    "moderation.allowAdminPause": "Allow admin pause",
    "moderation.allowAdminReject": "Allow admin reject",
    "moderation.allowAdminUnpublish": "Allow admin unpublish",
    "moderation.minRejectionReasonLength": "Min rejection reason length",
    "limits.maxListingsPerHost": "Max listings per host",
    "limits.maxImagesPerListing": "Max images per listing",
    "branding.supportEmail": "Support email",
    "branding.maintenanceMode": "Maintenance mode",
    "branding.maintenanceMessage": "Maintenance message",
  };
  return labels[path] || path;
}

function collectChangedPaths(current, incoming, section) {
  const changes = [];
  for (const [key, nextValue] of Object.entries(incoming || {})) {
    const prevValue = current?.[key];
    if (String(prevValue ?? "") !== String(nextValue ?? "")) {
      changes.push(labelForSetting(`${section}.${key}`));
    }
  }
  return changes;
}

exports.getOverview = async (req, res, next) => {
  try {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      disabledUsers,
      totalHosts,
      totalAdmins,
      totalProperties,
      liveProperties,
      pendingProperties,
      rejectedProperties,
      totalReviews,
      analytics7d,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ disabled: true }),
      User.countDocuments({ role: "host" }),
      User.countDocuments({ role: "admin" }),

      Property.countDocuments({}),
      Property.countDocuments({ status: "live" }),
      Property.countDocuments({ status: "pending" }),
      Property.countDocuments({ status: "rejected" }),

      Review.countDocuments({ status: "visible" }),

      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: since7d } } },
        {
          $group: {
            _id: { type: "$type", action: "$action" },
            c: { $sum: 1 },
          },
        },
      ]),
    ]);

    // normalize analytics
    let impressions7d = 0;
    let clicks7d = 0;
    const clickActions = {
      open: 0,
      contact_phone: 0,
      contact_whatsapp: 0,
      contact_sms: 0,
      share: 0,
      unknown: 0,
    };

    for (const row of analytics7d) {
      const type = row?._id?.type;
      const action = row?._id?.action || "unknown";
      const c = Number(row?.c || 0);

      if (type === "impression") impressions7d += c;
      if (type === "click") {
        clicks7d += c;
        if (clickActions[action] !== undefined) clickActions[action] += c;
        else clickActions.unknown += c;
      }
    }

    const ctr7d = impressions7d > 0 ? (clicks7d / impressions7d) * 100 : 0;

    // -------- series 7d (pentru grafic) --------
    const start7 = new Date(now);
    start7.setDate(start7.getDate() - 6);
    start7.setHours(0, 0, 0, 0);

    const seriesAgg = await AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: start7 } } },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
            type: "$type",
          },
          c: { $sum: 1 },
        },
      },
    ]);

    // bucket 7 zile
    const buckets = new Map();
    for (let i = 0; i < 7; i++) {
      const dt = new Date(start7);
      dt.setDate(start7.getDate() + i);
      const key = dt.toISOString().slice(0, 10);
      buckets.set(key, { impressions: 0, clicks: 0 });
    }

    for (const row of seriesAgg) {
      const { y, m, d, type } = row._id || {};
      const key = new Date(y, (m || 1) - 1, d || 1).toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      if (type === "impression") b.impressions += Number(row.c || 0);
      if (type === "click") b.clicks += Number(row.c || 0);
    }

    const series7d = Array.from(buckets.entries()).map(([day, v]) => ({
      day,
      impressions: v.impressions,
      clicks: v.clicks,
    }));

    res.json({
      kpis: {
        users: totalUsers,
        disabledUsers,
        hosts: totalHosts,
        admins: totalAdmins,

        properties: totalProperties,
        liveProperties,
        pendingProperties,
        rejectedProperties,

        reviewsVisible: totalReviews,

        impressions7d,
        clicks7d,
        ctr7d,
        clickActions,
      },
      series7d,
    });
  } catch (err) {
    next(err);
  }
};

exports.listUsers = async (req, res, next) => {
  try {
    const page = clamp(parseInt(req.query.page || "1", 10), 1, 10_000);
    const limit = clamp(parseInt(req.query.limit || "20", 10), 5, 100);
    const q = String(req.query.q || "").trim();
    const role = String(req.query.role || "all");

    const filter = {};
    if (role !== "all") filter.role = role;

    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select("email name phone role disabled createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const userIds = items.map((u) => u._id);
    const propertyCounts = userIds.length
      ? await Property.aggregate([
          { $match: { hostId: { $in: userIds } } },
          { $group: { _id: "$hostId", count: { $sum: 1 } } },
        ])
      : [];

    const countsMap = new Map(
      propertyCounts.map((row) => [String(row._id), Number(row.count || 0)])
    );

    const enrichedItems = items.map((u) => ({
      ...u,
      listingsCount: countsMap.get(String(u._id)) || 0,
    }));

    res.json({ items: enrichedItems, total, page, limit });
  } catch (err) {
    next(err);
  }
};

exports.patchUser = async (req, res, next) => {
  try {
    const userId = req.params.id;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const patch = req.body || {};
    const allowed = {};

    // -------- role --------
    if (typeof patch.role === "string") {
      const r = patch.role.trim();
      if (!["guest", "host", "admin"].includes(r)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      allowed.role = r;
    }

    // -------- disabled --------
    if (typeof patch.disabled === "boolean") {
      allowed.disabled = patch.disabled;
    }

    // payload gol
    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // nu-ți permite să te dezactivezi singur
    if (allowed.disabled === true && String(req.user?._id) === String(userId)) {
      return res.status(400).json({ message: "You cannot disable yourself" });
    }

    // recomandat: nu-ți permite să-ți schimbi singur rolul de admin (evită lock-out)
    if (
      typeof allowed.role === "string" &&
      String(req.user?._id) === String(userId) &&
      req.user?.role === "admin" &&
      allowed.role !== "admin"
    ) {
      return res
        .status(400)
        .json({ message: "You cannot change your own admin role" });
    }

    // citește user curent ca să aplici regula "last admin"
    const current = await User.findById(userId).select("role").lean();
    if (!current) return res.status(404).json({ message: "User not found" });

    // nu elimina ultimul admin
    if (
      current.role === "admin" &&
      typeof allowed.role === "string" &&
      allowed.role !== "admin"
    ) {
      const admins = await User.countDocuments({ role: "admin" });
      if (admins <= 1) {
        return res
          .status(400)
          .json({ message: "Cannot remove the last admin" });
      }
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: allowed },
      { new: true, runValidators: true }
    )
      .select("email name phone role disabled createdAt")
      .lean();

    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
};

exports.listProperties = async (req, res, next) => {
  try {
    const page = clamp(parseInt(req.query.page || "1", 10), 1, 10_000);
    const limit = clamp(parseInt(req.query.limit || "20", 10), 5, 100);
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "all");

    const filter = {};
    if (status !== "all") filter.status = status;

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { city: { $regex: q, $options: "i" } },
        { locality: { $regex: q, $options: "i" } },
        { type: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Property.find(filter)
        .select(
          "title city locality type status pricePerNight currency capacity coverImage images hostId submittedAt approvedAt rejectedAt rejectionReason createdAt"
        )
        .populate("hostId", "name email role disabled")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Property.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
};


exports.setPropertyStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    const { status: nextStatus, reason } = req.body || {};
    const allowedStatus = ["pending", "live", "paused", "rejected"]; // admin nu umblă la draft
    if (!allowedStatus.includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const prop = await Property.findById(id)
      .select("status submittedAt approvedAt rejectedAt rejectionReason")
      .lean();
    if (!prop) return res.status(404).json({ message: "Property not found" });

    const current = prop.status;
    const now = new Date();

    // settings moderation
    const settings = await AdminSettings.findOne({}).lean();
    const mod = settings?.moderation || {};

    // ---------- GUARDS from settings ----------
    // publish only if pending when requireSubmitToPublish
    if (nextStatus === "live" && mod.requireSubmitToPublish) {
      if (current !== "pending") {
        return res
          .status(400)
          .json({ message: "Cannot publish: listing is not submitted (pending)." });
      }
    }

    // pause by admin?
    // (dacă tu folosești paused ca “unpublish”, atunci allowAdminPause rămâne false,
    //  iar allowAdminUnpublish controlează live->paused)
    if (nextStatus === "paused" && current !== "live") {
      return res.status(400).json({ message: "Can set paused only from live" });
    }

    // reject allowed?
    if (nextStatus === "rejected" && mod.allowAdminReject === false) {
      return res.status(400).json({ message: "Admin cannot reject listings." });
    }

    // unpublish allowed? (live -> paused)
    if (nextStatus === "paused" && mod.allowAdminUnpublish === false) {
      return res.status(400).json({ message: "Admin cannot unpublish listings." });
    }

    // admin pause logic (dacă vrei să folosești paused ca “pause” adevărat):
    if (nextStatus === "paused" && mod.allowAdminPause === false) {
      // dacă vrei strict: admin NU are voie “pause”, doar “unpublish”
      // atunci comentează linia asta dacă allowAdminUnpublish=true și paused e unpublish.
      // Eu o las activă doar dacă tu chiar vrei să separi pause vs unpublish.
      // return res.status(400).json({ message: "Admin cannot pause listings." });
    }

    // ---------- TRANSITION RULES ----------
    const set = {};

    // pending nu ar trebui setat de admin (vine din submit de host)
    if (nextStatus === "pending") {
      return res.status(400).json({ message: "Pending is set by host submit, not admin" });
    }

    // approve / publish
    if (nextStatus === "live") {
      // strict: doar pending -> live (când requireSubmitToPublish e true)
      // dacă la tine vrei și “resume” din paused -> live, activează aici:
      if (current !== "pending" && current !== "paused") {
        return res.status(400).json({ message: "Can set live only from pending or paused" });
      }

      set.status = "live";
      set.approvedAt = now;
      set.rejectedAt = null;
      set.rejectionReason = "";
    }

    // unpublish (live -> paused)
    else if (nextStatus === "paused") {
      if (current !== "live") {
        return res.status(400).json({ message: "Can set paused only from live" });
      }
      set.status = "paused";
      // recomand: dacă vrei audit, poți adăuga adminTakedownAt/adminTakedownReason în schema
    }

    // reject (pending -> rejected)
    else if (nextStatus === "rejected") {
      if (current !== "pending") {
        return res.status(400).json({ message: "Can reject only from pending" });
      }

      const r = String(reason || "").trim();
      const minLen = Number(mod.minRejectionReasonLength ?? 8);
      if (r.length < minLen || r.length > 300) {
        return res
          .status(400)
          .json({ message: `Rejection reason must be ${minLen}-300 chars` });
      }

      set.status = "rejected";
      set.rejectedAt = now;
      set.approvedAt = null;
      set.rejectionReason = r;
    }

    const updated = await Property.findByIdAndUpdate(
      id,
      { $set: set },
      { new: true, runValidators: true }
    )
      .populate("hostId", "name email role")
      .lean();

    res.json({ property: updated });
  } catch (err) {
    next(err);
  }
};


// controllers/adminController.js (doar partea settings)

// singleton
async function getOrCreateSettings() {
  let doc = await AdminSettings.findOne({})
    .populate("updatedBy", "name email")
    .populate("changeLog.changedBy", "name email")
    .lean();
  if (!doc) {
    const created = await AdminSettings.create({});
    doc = await AdminSettings.findById(created._id)
      .populate("updatedBy", "name email")
      .populate("changeLog.changedBy", "name email")
      .lean();
  }
  return doc;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
}

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.saveSettings = async (req, res, next) => {
  try {
    const body = req.body || {};

    const moderation = pick(body.moderation, [
      "requireSubmitToPublish",
      "allowAdminPause",
      "allowAdminReject",
      "allowAdminUnpublish",
      "minRejectionReasonLength",
    ]);

    const limits = pick(body.limits, [
      "maxListingsPerHost",
      "maxImagesPerListing",
    ]);

    const branding = pick(body.branding, [
      "supportEmail",
      "maintenanceMode",
      "maintenanceMessage",
    ]);

    // validate
    if (
      moderation.minRejectionReasonLength !== undefined &&
      (!Number.isFinite(Number(moderation.minRejectionReasonLength)) ||
        Number(moderation.minRejectionReasonLength) < 0 ||
        Number(moderation.minRejectionReasonLength) > 300)
    ) {
      return res
        .status(400)
        .json({ message: "Invalid minRejectionReasonLength" });
    }

    if (
      limits.maxImagesPerListing !== undefined &&
      (!Number.isFinite(Number(limits.maxImagesPerListing)) ||
        Number(limits.maxImagesPerListing) < 1 ||
        Number(limits.maxImagesPerListing) > 200)
    ) {
      return res.status(400).json({ message: "Invalid maxImagesPerListing" });
    }

    if (
      limits.maxListingsPerHost !== undefined &&
      (!Number.isFinite(Number(limits.maxListingsPerHost)) ||
        Number(limits.maxListingsPerHost) < 0 ||
        Number(limits.maxListingsPerHost) > 100000)
    ) {
      return res.status(400).json({ message: "Invalid maxListingsPerHost" });
    }

    if (
      branding.supportEmail !== undefined &&
      (String(branding.supportEmail).length > 120 || !supportEmailValid(branding.supportEmail))
    ) {
      return res.status(400).json({ message: "Invalid supportEmail" });
    }

    // get singleton doc (not lean, we want to save)
    let doc = await AdminSettings.findOne({});
    if (!doc) doc = await AdminSettings.create({});
    const changeLabels = [
      ...collectChangedPaths(doc.moderation?.toObject?.() || doc.moderation || {}, moderation, "moderation"),
      ...collectChangedPaths(doc.limits?.toObject?.() || doc.limits || {}, limits, "limits"),
      ...collectChangedPaths(doc.branding?.toObject?.() || doc.branding || {}, branding, "branding"),
    ];

    if (Object.keys(moderation).length) {
      doc.moderation = {
        ...(doc.moderation?.toObject?.() || doc.moderation || {}),
        ...moderation,
      };
      // normalize numeric
      if (moderation.minRejectionReasonLength !== undefined) {
        doc.moderation.minRejectionReasonLength = Number(
          moderation.minRejectionReasonLength
        );
      }
    }

    if (Object.keys(limits).length) {
      doc.limits = {
        ...(doc.limits?.toObject?.() || doc.limits || {}),
        ...limits,
      };
      if (limits.maxListingsPerHost !== undefined)
        doc.limits.maxListingsPerHost = Number(limits.maxListingsPerHost);
      if (limits.maxImagesPerListing !== undefined)
        doc.limits.maxImagesPerListing = Number(limits.maxImagesPerListing);
    }

    if (Object.keys(branding).length) {
      doc.branding = {
        ...(doc.branding?.toObject?.() || doc.branding || {}),
        ...branding,
      };
    }

    doc.updatedBy = req.user?._id || null;
    if (changeLabels.length) {
      const nextLog = [
        {
          changedAt: new Date(),
          changedBy: req.user?._id || null,
          changes: changeLabels.slice(0, 12),
        },
        ...(doc.changeLog || []),
      ].slice(0, 20);
      doc.changeLog = nextLog;
    }
    await doc.save();
    clearMaintenanceCache?.();

    const populated = await AdminSettings.findById(doc._id)
      .populate("updatedBy", "name email")
      .populate("changeLog.changedBy", "name email")
      .lean();

    res.json({ settings: populated });
  } catch (err) {
    next(err);
  }
};



exports.listReviews = async (req, res, next) => {
  try {
    const page = clamp(parseInt(req.query.page || "1", 10), 1, 10_000);
    const limit = clamp(parseInt(req.query.limit || "20", 10), 5, 100);

    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "all"); // all | visible | hidden
    const rating = String(req.query.rating || "all"); // all | 1..5
    const sort = String(req.query.sort || "newest");  // newest | oldest | rating_desc | rating_asc

    const filter = {};
    if (status !== "all") filter.status = status;

    if (rating !== "all") {
      const r = Number(rating);
      if (![1,2,3,4,5].includes(r)) return res.status(400).json({ message: "Invalid rating" });
      filter.rating = r;
    }

    // Search "q" peste comment + (user email/name) + (property title/city)
    // Ca să nu faci populate + regex pe populate fields (ineficient),
    // facem lookup IDs când există q, apoi filtrăm cu $or.
    if (q) {
      const rx = new RegExp(q, "i");

      const [userIds, propIds] = await Promise.all([
        User.find({ $or: [{ email: rx }, { name: rx }, { phone: rx }] }).select("_id").limit(200).lean(),
        Property.find({ $or: [{ title: rx }, { city: rx }, { locality: rx }, { type: rx }] })
          .select("_id")
          .limit(200)
          .lean(),
      ]);

      filter.$or = [
        { comment: rx },
        ...(userIds.length ? [{ userId: { $in: userIds.map(x => x._id) } }] : []),
        ...(propIds.length ? [{ propertyId: { $in: propIds.map(x => x._id) } }] : []),
      ];
    }

    let sortObj = { createdAt: -1 };
    if (sort === "oldest") sortObj = { createdAt: 1 };
    if (sort === "rating_desc") sortObj = { rating: -1, createdAt: -1 };
    if (sort === "rating_asc") sortObj = { rating: 1, createdAt: -1 };

    const [items, total] = await Promise.all([
      Review.find(filter)
        .select("propertyId userId rating comment status createdAt updatedAt")
        .populate("userId", "name email phone role disabled")
        .populate("propertyId", "title city locality type status hostId")
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
};

exports.patchReview = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid review id" });

    const body = req.body || {};
    const allowed = {};

    if (typeof body.status === "string") {
      const s = body.status.trim();
      if (!["visible", "hidden"].includes(s)) return res.status(400).json({ message: "Invalid status" });
      allowed.status = s;
    }

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const updated = await Review.findByIdAndUpdate(
      id,
      { $set: allowed },
      { new: true, runValidators: true }
    )
      .select("propertyId userId rating comment status createdAt updatedAt")
      .populate("userId", "name email phone")
      .populate("propertyId", "title city locality type status")
      .lean();

    if (!updated) return res.status(404).json({ message: "Review not found" });

    res.json({ review: updated });
  } catch (err) {
    next(err);
  }
};

// optional: hard delete (rar, dar uneori util)
exports.deleteReview = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid review id" });

    const r = await Review.findByIdAndDelete(id).lean();
    if (!r) return res.status(404).json({ message: "Review not found" });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.listTrails = async (req, res, next) => {
  try {
    const page = clamp(parseInt(req.query.page || "1", 10), 1, 10_000);
    const limit = clamp(parseInt(req.query.limit || "12", 10), 1, 100);
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "all").trim();
    const difficulty = String(req.query.difficulty || "all").trim();

    const filter = {};
    if (status !== "all") filter.status = status;
    if (difficulty !== "all") filter.difficulty = difficulty;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { area: { $regex: q, $options: "i" } },
        { season: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
        { sourceLabel: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total, counts] = await Promise.all([
      Trail.find(filter)
        .select(
          "seedId name slug area difficulty durationHrs distanceKm season tags image imageFallbackUrl sourceUrl sourceLabel officialLinks summary status isVerified createdAt updatedAt"
        )
        .sort({ isVerified: -1, updatedAt: -1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Trail.countDocuments(filter),
      Trail.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = {
      total: counts.reduce((acc, row) => acc + Number(row.count || 0), 0),
      draft: 0,
      published: 0,
      archived: 0,
    };

    for (const row of counts) {
      if (summary[row._id] !== undefined) summary[row._id] = Number(row.count || 0);
    }

    res.json({ items, total, page, limit, summary });
  } catch (err) {
    next(err);
  }
};

exports.createTrail = async (req, res, next) => {
  try {
    const payload = normalizeTrailPayload(req.body, { partial: false });
    payload.slug = await ensureUniqueTrailSlug(payload.slug || payload.name);
    payload.createdBy = req.user?._id || null;
    payload.updatedBy = req.user?._id || null;

    const trail = await Trail.create(payload);
    res.status(201).json({ trail });
  } catch (err) {
    if (err?.message?.startsWith("Invalid") || err?.message?.includes("required")) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

exports.updateTrail = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid trail id" });
    }

    const existing = await Trail.findById(id).lean();
    if (!existing) return res.status(404).json({ message: "Trail not found" });

    const payload = normalizeTrailPayload(req.body, { partial: true });
    const shouldRefreshSlug = payload.name && !payload.slug;
    if (payload.slug || shouldRefreshSlug) {
      payload.slug = await ensureUniqueTrailSlug(payload.slug || payload.name, id);
    }
    payload.updatedBy = req.user?._id || null;

    const prevPublicId = existing.image?.publicId || null;
    const nextPublicId =
      payload.image === null ? null : payload.image?.publicId || existing.image?.publicId || null;

    const trail = await Trail.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true, runValidators: true }
    ).lean();

    if (prevPublicId && prevPublicId !== nextPublicId) {
      cloudinary.uploader.destroy(prevPublicId).catch(() => {});
    }

    res.json({ trail });
  } catch (err) {
    if (err?.message?.startsWith("Invalid") || err?.message?.includes("required")) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

exports.deleteTrail = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid trail id" });
    }

    const trail = await Trail.findByIdAndDelete(id).lean();
    if (!trail) return res.status(404).json({ message: "Trail not found" });

    if (trail.image?.publicId) {
      cloudinary.uploader.destroy(trail.image.publicId).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.importTrails = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ message: "No trails provided for import" });
    }

    const normalized = [];
    for (const item of items) {
      const mapped = mapSeedTrail(item);
      const payload = normalizeTrailPayload(mapped, { partial: false });
      payload.seedId = mapped.seedId;
      payload.slug = await ensureUniqueTrailSlug(mapped.name);
      normalized.push(payload);
    }

    const seedIds = normalized.map((item) => item.seedId).filter(Boolean);
    const existing = seedIds.length
      ? await Trail.find({ seedId: { $in: seedIds } }).select("_id seedId status isVerified slug").lean()
      : [];
    const existingBySeedId = new Map(existing.map((item) => [item.seedId, item]));

    const ops = normalized.map((item) => {
      const prev = item.seedId ? existingBySeedId.get(item.seedId) : null;
      const setPayload = {
        ...item,
        slug: prev?.slug || item.slug,
        status: prev?.status || "draft",
        isVerified: prev?.isVerified || false,
        updatedBy: req.user?._id || null,
      };

      return {
        updateOne: {
          filter: item.seedId ? { seedId: item.seedId } : { slug: item.slug },
          update: {
            $set: setPayload,
            $setOnInsert: { createdBy: req.user?._id || null },
          },
          upsert: true,
        },
      };
    });

    const result = await Trail.bulkWrite(ops, { ordered: false });
    res.json({
      imported: normalized.length,
      created: Number(result.upsertedCount || 0),
      updated:
        Number(result.modifiedCount || 0) +
        Number(result.matchedCount || 0) -
        Number(result.upsertedCount || 0),
    });
  } catch (err) {
    if (err?.message?.startsWith("Invalid") || err?.message?.includes("required")) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};
