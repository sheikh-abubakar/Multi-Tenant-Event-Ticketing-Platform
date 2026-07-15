const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
const organizationRoutes = require("./routes/organization.routes");
const tenantRoutes = require("./routes/tenant.routes");
const venueRoutes = require("./routes/venue.routes");
const eventRoutes = require("./routes/event.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check — confirms the server is up.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Ticketing platform API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);

// Every tenant-scoped route (public storefront AND organizer routes)
// lives under /api/o/:orgSlug/... . The :orgSlug here is what
// resolveTenant middleware reads on every request underneath it.
app.use("/api/o/:orgSlug", tenantRoutes);
app.use("/api/o/:orgSlug/venues", venueRoutes);
app.use("/api/o/:orgSlug/events", eventRoutes);

module.exports = app;
