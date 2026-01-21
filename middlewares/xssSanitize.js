const xss = require("xss");

function sanitizeValue(v) {
  if (typeof v === "string") return xss(v);
  return v;
}

function sanitizeDeep(obj) {
  if (!obj || typeof obj !== "object") return;

  for (const key of Object.keys(obj)) {
    const val = obj[key];

    if (Array.isArray(val)) {
      obj[key] = val.map((x) => (typeof x === "string" ? xss(x) : x));
      continue;
    }

    if (val && typeof val === "object") {
      sanitizeDeep(val);
      continue;
    }

    obj[key] = sanitizeValue(val);
  }
}

module.exports = function xssSanitize(req, _res, next) {
  // body/params: safe to mutate
  sanitizeDeep(req.body);
  sanitizeDeep(req.params);

  // query: NU reasigna req.query, doar mută obiectul returnat
  const q = req.query;
  if (q && typeof q === "object") sanitizeDeep(q);

  next();
};
