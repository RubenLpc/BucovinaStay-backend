const AdminNotification = require("../models/AdminNotification");

async function notifyAdmin(payload) {
  // payload: { type, severity, title, body, entityType, entityId, meta }
  const doc = await AdminNotification.create({
    status: "new",
    severity: "info",
    entityType: "system",
    ...payload,
  });
  return doc;
}

module.exports = { notifyAdmin };
