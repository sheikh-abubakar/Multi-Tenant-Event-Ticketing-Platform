const express = require("express");
const cors = require("cors");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { MongoStore } = require("connect-mongo");
const authRoutes = require("./routes/auth.routes");
const organizationRoutes = require("./routes/organization.routes");
const tenantRoutes = require("./routes/tenant.routes");
const venueRoutes = require("./routes/venue.routes");
const eventRoutes = require("./routes/event.routes");
const bookingRoutes = require("./routes/booking.routes");
const bookingConfirmRoutes = require("./routes/bookingConfirm.routes");
const cartRoutes = require("./routes/cart.routes");
const globalCartRoutes = require("./routes/globalCart.routes");
const bookingController = require("./controllers/booking.controller");
const orgSettingsRoutes = require("./routes/orgSettings.routes");
const teamRoutes = require("./routes/team.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const calendarRoutes = require("./routes/calendar.routes");
const publicRoutes = require("./routes/public.routes");
const refundRoutes = require("./routes/refund.routes");
const seatmapRoutes = require("./routes/seatmap.routes");
const referralRoutes = require("./routes/referral.routes");
const couponRoutes = require("./routes/coupon.routes");
const platformAdminRoutes = require("./routes/platformAdmin.routes");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (isProduction) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));

// Stripe webhook must be BEFORE express.json() — Stripe needs the raw body
// for signature verification
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  bookingController.handleWebhook,
);

app.use(
  cors({
    origin(origin, callback) {
      const cleanOrigin = origin ? origin.replace(/\/$/, "") : "";
      if (!origin || allowedOrigins.includes(cleanOrigin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again in 15 minutes." },
});

app.use(
  session({
    name: process.env.SESSION_COOKIE_NAME || "stagepass.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 24 * 60 * 60,
      touchAfter: 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Ticketing platform API is running-AUTO DEPLOYED SUCCESSful!" });
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/platform-admin", platformAdminRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/o/:orgSlug", tenantRoutes);
app.use("/api/o/:orgSlug/venues", venueRoutes);
app.use("/api/o/:orgSlug/venues", seatmapRoutes.templates);
app.use("/api/o/:orgSlug/events", eventRoutes);
app.use("/api/o/:orgSlug/events", seatmapRoutes.eventMaps);
app.use("/api/o/:orgSlug/events/:eventId/bookings", bookingRoutes);
// Simpler path for confirmation — Stripe redirects here without eventId
app.use("/api/o/:orgSlug/bookings", bookingConfirmRoutes);
app.use("/api/o/:orgSlug/cart", cartRoutes);
app.use("/api/o/:orgSlug/coupons", couponRoutes);
app.use("/api/cart", globalCartRoutes);
app.use("/api/o/:orgSlug/settings", orgSettingsRoutes);
app.use("/api/o/:orgSlug/team", teamRoutes);
app.use("/api/o/:orgSlug/analytics", analyticsRoutes);
app.use("/api/o/:orgSlug", calendarRoutes);
app.use("/api", publicRoutes);
app.use("/api", refundRoutes);
app.use("/api/referrals", referralRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((error, req, res, next) => {
  if (error.name === "MulterError") return res.status(400).json({ message: error.message });
  if (error.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON request body" });

  console.error("Unhandled API error:", error);
  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : "Internal server error",
  });
});

module.exports = app;
