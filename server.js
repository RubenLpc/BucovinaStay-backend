require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const hpp = require("hpp");
const xss = require("xss-clean");

const connectDB = require("./config/db");
const errorHandler = require("./middlewares/errorHandler");
const maintenanceGuard = require("./middlewares/maintenance");
const botFilter = require("./middlewares/botFilter");
const optionalAuth = require("./middlewares/optionalAuth");

// Routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const propertyRoutes = require("./routes/properties");
const reviewRoutes = require("./routes/reviews");
const subscriptionRoutes = require("./routes/subscriptions");
const searchRoutes = require("./routes/search");
const favoriteRoutes = require("./routes/favorites");
const analyticsRoutes = require("./routes/analytics");
const hostProfilesRoutes = require("./routes/hostProfiles.js");
const hostMessagesRoutes = require("./routes/hostMessages");
const hostActivity = require("./routes/hostActivity");
const hostSettingsRoutes = require("./routes/hostSettings");
const adminRoutes = require("./routes/admin");
const healthRoutes = require("./routes/health");
const semanticSearchRoutes = require("./routes/semanticSearch");
const adminNotificationsRoutes = require("./routes/adminNotifications");

connectDB();

const app = express();

/** ✅ Render/proxy support */
app.set("trust proxy", 1);

/** ✅ Body limit (anti-abuz) */
app.use(express.json({ limit: "1mb" }));

/** ✅ Helmet (API-safe CSP strict) */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
  })
);

/** ✅ CORS allowlist */
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Postman / server-to-server
      if (allowedOrigins.length === 0) return cb(null, true); // fallback
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked for this origin"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/** ✅ Logs */
if (process.env.NODE_ENV === "production") app.use(morgan("combined"));
else app.use(morgan("dev"));

/** ✅ Bot filter (ieftin, înainte de limitere) */
app.use(
  botFilter({
    allowPaths: ["/health"],
    blockEmptyUAOn: ["/auth", "/search", "/favorites", "/host-messages"],
  })
);

/** ✅ Anti-parameter pollution + basic XSS clean */
app.use(hpp());
const xssSanitize = require("./middlewares/xssSanitize");
app.use(xssSanitize);

/** ✅ Global rate limit + slowdown */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const globalSlowDown = slowDown({
  windowMs: 60 * 1000,
  delayAfter: 120,
  delayMs: () => 250,
});
app.use(globalSlowDown);

/** ✅ Optional auth: pune req.user dacă există token */
app.use(optionalAuth);

/** ✅ Maintenance gate */
app.use(
  maintenanceGuard({
    allow: ["/admin", "/auth", "/health"],
  })
);

/** ✅ Route-specific limiters */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many attempts, try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  message: { message: "Too many requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { message: "Too many searches, slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/auth", authLimiter);
app.use("/favorites", writeLimiter);
app.use("/host-messages", writeLimiter);
app.use("/reviews", writeLimiter); // dacă rutele sunt aici; altfel scoate
app.use("/search", searchLimiter);

/** ✅ Routes */
app.use("/host/activity", hostActivity);
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/properties", propertyRoutes);
app.use("/properties", reviewRoutes);
app.use("/subscriptions", subscriptionRoutes);

// ai doua /search: clasic + semantic — le păstrezi, dar ordinea contează.
// dacă ambele trebuie să fie active, pune semantic pe alt prefix (ex: /semantic-search).
app.use("/search", searchRoutes);
app.use("/search", semanticSearchRoutes);

app.use("/analytics", analyticsRoutes);
app.use("/favorites", favoriteRoutes);
app.use("/host", hostProfilesRoutes);
app.use("/host-messages", hostMessagesRoutes);
app.use("/host-settings", hostSettingsRoutes);
app.use("/admin", adminRoutes);
app.use("/health", healthRoutes);
app.use("/notifications/admin", adminNotificationsRoutes);

/** ✅ Error handler last */
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
