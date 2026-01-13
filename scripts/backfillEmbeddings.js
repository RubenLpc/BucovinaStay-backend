require("dotenv").config();
const mongoose = require("mongoose");
const Property = require("../models/Property");
const buildText = require("../utils/propertyEmbeddingText");
const { embedText } = require("../services/embeddingsService");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const cursor = Property.find({ status: "live" }).cursor();
  let n = 0, skipped = 0;

  for (let p = await cursor.next(); p != null; p = await cursor.next()) {
    const text = buildText(p);

    // ✅ guard: dacă text identic și există embedding, sari
    if (p.embeddingText === text && Array.isArray(p.embedding) && p.embedding.length > 0) {
      skipped++;
      continue;
    }

    const emb = await embedText(text);
    p.embeddingText = text;
    p.embedding = emb;
    await p.save();

    n++;
    if (n % 20 === 0) console.log("embedded:", n, "skipped:", skipped);
  }

  console.log("done:", n, "skipped:", skipped);
  process.exit(0);
})();
