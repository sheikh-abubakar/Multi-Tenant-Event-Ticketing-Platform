const express = require("express");
const cors = require("cors");
const session = require("express-session");
const authRoutes = require("./routes/auth.routes");
const organizationRoutes = require("./routes/organization.routes");
const tenantRoutes = require("./routes/tenant.routes");
const venueRoutes = require("./routes/venue.routes");
const eventRoutes = require("./routes/event.routes");
const bookingRoutes = require("./routes/booking.routes");
const bookingConfirmRoutes = require("./routes/bookingConfirm.routes");
const cartRoutes = require("./routes/cart.routes");
const bookingController = require("./controllers/booking.controller");
const orgSettingsRoutes = require("./routes/orgSettings.routes");
const teamRoutes = require("./routes/team.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const calendarRoutes = require("./routes/calendar.routes");
const publicRoutes = require("./routes/public.routes");
const refundRoutes = require("./routes/refund.routes");
const seatmapRoutes = require("./routes/seatmap.routes");

const app = express();

// Stripe webhook must be BEFORE express.json() — Stripe needs the raw body
// for signature verification
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  bookingController.handleWebhook,
);

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "stagepass-cart-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Ticketing platform API is running" });
});

app.use("/api/auth", authRoutes);
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
app.use("/api/o/:orgSlug/settings", orgSettingsRoutes);
app.use("/api/o/:orgSlug/team", teamRoutes);
app.use("/api/o/:orgSlug/analytics", analyticsRoutes);
app.use("/api/o/:orgSlug", calendarRoutes);
app.use("/api", publicRoutes);
app.use("/api", refundRoutes);
module.exports = app;
