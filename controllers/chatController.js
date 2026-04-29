const OpenAI = require("openai");
const Property = require("../models/Property");
const Review = require("../models/Review");
const HostProfile = require("../models/HostProfile");
const { mapHostProfilePublic } = require("../mappers/hostProfileMapper");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Ești asistentul virtual al platformei BucovinaStay, o platformă de cazare din Bucovina, România.

Pentru orice întrebare despre proprietăți, prețuri, facilități, recenzii sau gazde — folosește funcțiile disponibile să cauți în baza de date reală.
Pentru întrebări generale despre Bucovina (mânăstiri, trasee, tradiții, gastronomie, transport, sezon) — răspunde din cunoștințele proprii fără să apelez funcții.

Stilul răspunsurilor:
- Răspunde în română, ton prietenos și natural
- Folosește **text îngroșat** pentru nume de proprietăți, prețuri și informații cheie
- Structurează cu bullet points (•) când listezi mai multe opțiuni
- Fii concis — nu repeta informații inutile
- Nu inventa proprietăți, recenzii sau date de contact`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_properties",
      description: "Caută cazări după tip, facilități, locație, preț sau capacitate.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["pensiune", "cabana", "hotel", "apartament", "vila", "tiny_house"],
          },
          facilities: {
            type: "array",
            items: { type: "string" },
            description: "ex: ['spa', 'sauna', 'wifi', 'petFriendly', 'parking', 'hotTub', 'breakfast', 'pool', 'fireplace']",
          },
          city: { type: "string" },
          priceMin: { type: "number" },
          priceMax: { type: "number" },
          capacityMin: { type: "number" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_details",
      description: "Detalii complete despre o proprietate specifică (descriere, facilități, preț, locație, rating).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Numele sau parte din numele proprietății" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_property_reviews",
      description: "Recenziile utilizatorilor pentru o proprietate specifică.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_host_info",
      description: "Informații publice despre gazda unei proprietăți: nume, bio, rating, timp de răspuns, dacă e SuperHost, limbi vorbite.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string", description: "Numele proprietății pentru a găsi gazda" },
        },
        required: ["property_name"],
      },
    },
  },
];

// Acumulează proprietățile găsite pentru carduri în frontend
const PROP_SELECT = {
  title: 1, city: 1, locality: 1, type: 1,
  pricePerNight: 1, currency: 1, capacity: 1,
  facilities: 1, ratingAvg: 1, reviewsCount: 1,
  coverImage: 1, images: 1, description: 1,
};

async function runSearchProperties(args, foundProps) {
  const { type, facilities, city, priceMin, priceMax, capacityMin } = args;
  const filter = { status: "live" };

  if (type) filter.type = type;
  if (city) filter.$or = [
    { city: { $regex: city, $options: "i" } },
    { locality: { $regex: city, $options: "i" } },
  ];
  if (priceMin != null || priceMax != null) {
    filter.pricePerNight = {};
    if (priceMin != null) filter.pricePerNight.$gte = Number(priceMin);
    if (priceMax != null) filter.pricePerNight.$lte = Number(priceMax);
  }
  if (capacityMin != null) filter.capacity = { $gte: Number(capacityMin) };
  if (facilities?.length) filter.facilities = { $all: facilities };

  const props = await Property.find(filter)
    .select(PROP_SELECT)
    .sort({ ratingAvg: -1 })
    .limit(8)
    .lean();

  if (!props.length) return "Nu am găsit proprietăți pentru aceste criterii.";

  props.forEach((p) => {
    if (!foundProps.find((x) => String(x._id) === String(p._id))) foundProps.push(p);
  });

  return props.map((p) => {
    const loc = p.locality ? `${p.locality}, ${p.city}` : p.city;
    const rating = p.ratingAvg ? `${p.ratingAvg}/5 (${p.reviewsCount} recenzii)` : "fără recenzii";
    return `• **${p.title}** (${p.type}) — ${loc} | **${p.pricePerNight} ${p.currency || "RON"}/noapte** | ${p.capacity} pers. | rating: ${rating} | facilități: ${p.facilities?.join(", ") || "—"}`;
  }).join("\n");
}

async function runGetPropertyDetails(args, foundProps) {
  const { name } = args;
  const prop = await Property.findOne({
    status: "live",
    title: { $regex: name, $options: "i" },
  }).select(PROP_SELECT).lean();

  if (!prop) return `Nu am găsit nicio proprietate cu numele "${name}".`;

  if (!foundProps.find((x) => String(x._id) === String(prop._id))) foundProps.push(prop);

  const loc = prop.locality ? `${prop.locality}, ${prop.city}` : prop.city;
  return [
    `**${prop.title}** (${prop.type})`,
    `📍 ${loc}`,
    `💰 **${prop.pricePerNight} ${prop.currency || "RON"}/noapte**`,
    `👥 Max. ${prop.capacity} persoane`,
    `⭐ ${prop.ratingAvg || "—"} (${prop.reviewsCount || 0} recenzii)`,
    `🛎 Facilități: ${prop.facilities?.join(", ") || "nespecificate"}`,
    `📝 ${prop.description || "—"}`,
  ].join("\n");
}

async function runGetPropertyReviews({ name }) {
  const prop = await Property.findOne({
    status: "live",
    title: { $regex: name, $options: "i" },
  }).select({ _id: 1, title: 1 }).lean();

  if (!prop) return `Nu am găsit nicio proprietate cu numele "${name}".`;

  const reviews = await Review.find({ propertyId: prop._id, status: "visible" })
    .populate("userId", "name")
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  if (!reviews.length) return `**${prop.title}** nu are recenzii încă.`;

  const lines = reviews.map((r) => {
    const date = new Date(r.createdAt).toLocaleDateString("ro-RO");
    const stars = "⭐".repeat(Math.round(r.rating));
    return `• ${stars} **${r.userId?.name || "Anonim"}** (${date}): "${r.comment}"`;
  });

  return `Recenzii pentru **${prop.title}** (${reviews.length}):\n${lines.join("\n")}`;
}

async function runGetHostInfo({ property_name }) {
  const prop = await Property.findOne({
    status: "live",
    title: { $regex: property_name, $options: "i" },
  }).select({ hostId: 1, title: 1 }).lean();

  if (!prop) return `Nu am găsit proprietatea "${property_name}".`;

  const profile = await HostProfile.findOne({ userId: prop.hostId }).lean();
  if (!profile) return `Nu există un profil public pentru gazda proprietății "${prop.title}".`;

  const h = mapHostProfilePublic(profile);

  const lines = [
    `**${h.name}**${h.isSuperHost ? " 🏅 SuperHost" : ""}`,
    h.bio ? `"${h.bio}"` : null,
    `⭐ Rating: ${h.rating ?? "—"} | ${h.reviewsCount} recenzii`,
    `⏱ ${h.responseTimeText}${h.responseRate != null ? ` (${h.responseRate}% rată răspuns)` : ""}`,
    h.monthsHosting != null ? `🏠 Gazdă de ${h.monthsHosting} luni` : null,
    h.languages?.length ? `🗣 Limbi: ${h.languages.join(", ")}` : null,
    h.verified ? "✅ Profil verificat" : null,
  ].filter(Boolean);

  return lines.join("\n");
}

async function executeTool(name, args, foundProps) {
  if (name === "search_properties") return runSearchProperties(args, foundProps);
  if (name === "get_property_details") return runGetPropertyDetails(args, foundProps);
  if (name === "get_property_reviews") return runGetPropertyReviews(args);
  if (name === "get_host_info") return runGetHostInfo(args);
  return "Funcție necunoscută.";
}

exports.chat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "Missing message" });
    }

    const trimmed = message.trim().slice(0, 600);
    if (!trimmed) return res.status(400).json({ message: "Empty message" });

    const safeHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .filter((m) => m?.role && m?.content)
          .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content).slice(0, 800),
          }))
      : [];

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...safeHistory,
      { role: "user", content: trimmed },
    ];

    // Colectează proprietățile găsite pentru carduri în frontend
    const foundProps = [];

    // Agentic loop — max 3 iterații
    for (let i = 0; i < 3; i++) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 700,
        temperature: 0.65,
      });

      const choice = completion.choices[0];
      const msg = choice.message;
      messages.push(msg);

      if (choice.finish_reason !== "tool_calls" || !msg.tool_calls?.length) {
        return res.json({
          reply: msg.content || "Nu am putut genera un răspuns.",
          properties: formatPropsForFrontend(foundProps),
        });
      }

      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          let args = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* ignoră */ }
          const result = await executeTool(tc.function.name, args, foundProps);
          return { role: "tool", tool_call_id: tc.id, content: result };
        })
      );

      messages.push(...toolResults);
    }

    const final = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 700,
      temperature: 0.65,
    });

    res.json({
      reply: final.choices[0]?.message?.content || "Nu am putut genera un răspuns.",
      properties: formatPropsForFrontend(foundProps),
    });
  } catch (err) {
    console.error("chat error:", err);
    res.status(500).json({ message: "Serviciul de chat nu este disponibil momentan." });
  }
};

function formatPropsForFrontend(props) {
  return props.map((p) => ({
    id: String(p._id),
    title: p.title,
    type: p.type,
    location: p.locality ? `${p.locality}, ${p.city}` : p.city || "Bucovina",
    pricePerNight: p.pricePerNight,
    currency: p.currency || "RON",
    rating: p.ratingAvg || 0,
    reviews: p.reviewsCount || 0,
    image: p.coverImage?.url || p.images?.[0]?.url || "",
  }));
}
