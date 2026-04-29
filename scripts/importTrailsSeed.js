#!/usr/bin/env node
require("dotenv").config();

const path = require("path");
const { pathToFileURL } = require("url");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Trail = require("../models/Trail");

const TRAIL_DIFFICULTIES = new Set(["Ușor", "Mediu", "Greu"]);
const DEFAULT_FALLBACK_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#334155"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#g)"/>
      <path d="M0 620L180 470L320 560L470 370L610 520L760 300L930 500L1070 410L1200 540V800H0Z" fill="#94a3b8" opacity="0.3"/>
      <path d="M0 680L190 550L350 640L520 430L670 610L840 380L1010 580L1200 470V800H0Z" fill="#e2e8f0" opacity="0.2"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="54" fill="#f8fafc" opacity="0.92">Bucovina Trails</text>
    </svg>`
  );

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
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

async function ensureUniqueTrailSlug(base, existingMap) {
  const clean = slugifyTrail(base) || `trail-${Date.now()}`;
  let candidate = clean;
  let index = 2;
  while (existingMap.has(candidate)) {
    candidate = `${clean}-${index++}`;
  }
  existingMap.add(candidate);
  return candidate;
}

function normalizeTags(tags) {
  return Array.from(
    new Set(
      (Array.isArray(tags) ? tags : [])
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

function mapSeedTrail(item) {
  const officialLinks = normalizeOfficialLinks(item?.officialLinks);
  const fallback = String(item?.image || "").trim();
  return {
    seedId: String(item?.id || "").trim() || undefined,
    name: String(item?.name || "").trim(),
    area: String(item?.area || "").trim(),
    difficulty: String(item?.difficulty || "").trim(),
    durationHrs: item?.durationHrs ?? null,
    distanceKm: item?.distanceKm ?? null,
    season: String(item?.season || "").trim(),
    tags: normalizeTags(item?.tags),
    image: null,
    imageFallbackUrl: isValidHttpUrl(fallback) ? fallback : DEFAULT_FALLBACK_IMAGE,
    sourceUrl: String(item?.url || "").trim(),
    sourceLabel: officialLinks[0]?.label || "Sursă oficială",
    officialLinks,
    summary: "",
  };
}

async function loadSeedItems() {
  const seedPath = path.resolve(__dirname, "../../client/src/pages/Trails/trailsData.js");
  const mod = await import(pathToFileURL(seedPath).href);
  return Array.isArray(mod.default) ? mod.default : [];
}

async function run() {
  const args = new Set(process.argv.slice(2));
  const publish = args.has("--published");
  const fresh = args.has("--fresh");

  await connectDB();

  const seedItems = await loadSeedItems();
  if (!seedItems.length) {
    throw new Error("No trails found in client seed");
  }

  if (fresh) {
    await Trail.deleteMany({});
  }

  const existing = await Trail.find({})
    .select("_id seedId slug status isVerified image imageFallbackUrl")
    .lean();

  const existingBySeedId = new Map(existing.filter((x) => x.seedId).map((x) => [x.seedId, x]));
  const usedSlugs = new Set(existing.map((x) => x.slug).filter(Boolean));

  let created = 0;
  let updated = 0;

  for (const raw of seedItems) {
    const mapped = mapSeedTrail(raw);

    if (!mapped.name || !mapped.area || !mapped.sourceUrl || !TRAIL_DIFFICULTIES.has(mapped.difficulty)) {
      continue;
    }

    const prev = mapped.seedId ? existingBySeedId.get(mapped.seedId) : null;
    const slug = prev?.slug || (await ensureUniqueTrailSlug(mapped.name, usedSlugs));

    const payload = {
      ...mapped,
      slug,
      status: prev?.status || (publish ? "published" : "draft"),
      isVerified: prev?.isVerified || false,
      image: prev?.image || null,
      imageFallbackUrl:
        prev?.imageFallbackUrl || mapped.imageFallbackUrl || DEFAULT_FALLBACK_IMAGE,
    };

    const res = await Trail.updateOne(
      mapped.seedId ? { seedId: mapped.seedId } : { slug },
      {
        $set: payload,
      },
      { upsert: true }
    );

    if (res.upsertedCount) created += 1;
    else updated += 1;
  }

  console.log(
    `Trails import finished. created=${created} updated=${updated} mode=${publish ? "published" : "draft"}${
      fresh ? " fresh=yes" : ""
    }`
  );

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Trails import failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
