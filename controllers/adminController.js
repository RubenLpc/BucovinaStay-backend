// controllers/adminController.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Property = require("../models/Property");
const Review = require("../models/Review");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const AdminSettings = require("../models/AdminSettings");

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
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

    res.json({ items, total, page, limit });
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
  let doc = await AdminSettings.findOne({}).lean();
  if (!doc) {
    const created = await AdminSettings.create({});
    doc = created.toObject();
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

    // get singleton doc (not lean, we want to save)
    let doc = await AdminSettings.findOne({});
    if (!doc) doc = await AdminSettings.create({});

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
    await doc.save();

    res.json({ settings: doc.toObject() });
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
