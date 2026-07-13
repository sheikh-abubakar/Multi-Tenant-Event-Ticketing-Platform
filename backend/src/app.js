const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Simple health check — confirms the server is up.
// We'll add real routes (auth, orgs, events...) on the coming days.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Ticketing platform API is running" });
});

module.exports = app;
