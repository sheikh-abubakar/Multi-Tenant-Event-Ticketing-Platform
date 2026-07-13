const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check — confirms the server is up.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Ticketing platform API is running" });
});

app.use("/api/auth", authRoutes);

module.exports = app;
