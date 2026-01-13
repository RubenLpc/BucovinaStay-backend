function safe(v) {
    return (v ?? "").toString().trim();
  }
  
  module.exports = function buildPropertyEmbeddingText(p) {
    const facilities = Array.isArray(p.facilities) ? p.facilities.join(", ") : "";
    const tags = Array.isArray(p.tags) ? p.tags.join(", ") : "";
  
    const parts = [
      `title: ${safe(p.title)}`,
      `subtitle: ${safe(p.subtitle)}`,
      `type: ${safe(p.type)}`,
      `city: ${safe(p.city)}`,
      `locality: ${safe(p.locality)}`,
      `county: ${safe(p.county)}`,
      `capacity: ${safe(p.capacity)}`,
      `pricePerNight: ${safe(p.pricePerNight)} ${safe(p.currency || "RON")}`,
      facilities ? `facilities: ${facilities}` : "",
      tags ? `tags: ${tags}` : "",
      safe(p.description) ? `description: ${safe(p.description)}` : "",
    ];
  
    return parts.filter(Boolean).join("\n").slice(0, 8000);
  };
  