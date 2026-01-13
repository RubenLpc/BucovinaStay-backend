const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// taie inputul la o dimensiune sigură (embeddings suportă mult, dar nu ai nevoie)
function normalizeInput(input) {
  return String(input || "").replace(/\s+/g, " ").trim().slice(0, 8000);
}

async function embedText(input) {
  const text = normalizeInput(input);
  if (!text) throw new Error("Empty input for embedding");

  // retry simplu pt rate limit tranzitoriu (nu insufficient_quota)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      return res.data[0].embedding;
    } catch (e) {
      const status = e?.status;
      const code = e?.code || e?.error?.code;

      // dacă ai insuficient_quota, nu are sens retry
      if (code === "insufficient_quota" || status === 401) throw e;

      // dacă e rate limit, mai încearcă
      if (status === 429 && attempt < 2) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

module.exports = { embedText, normalizeInput };
