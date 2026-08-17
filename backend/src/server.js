// Force reload to pick up email.js template changes
require("dotenv").config();
const { logger, legacyLog } = require("./config/logger");
// Preserve existing operational diagnostics while progressively migrating
// services from console.* to logger.*.
console.log = (...args) => legacyLog("info", args);
console.warn = (...args) => legacyLog("warn", args);
console.error = (...args) => legacyLog("error", args);
const app = require("./app");
const connectDB = require("./config/db");
const mongoose = require("mongoose");
const { startBookingScheduler, stopBookingScheduler } = require("./services/bookingScheduler");

const PORT = process.env.PORT || 5000;

const validateProductionEnvironment = () => {
  if (process.env.NODE_ENV !== "production") return;

  const required = [
    "MONGO_URI",
    "JWT_SECRET",
    "SESSION_SECRET",
    "FRONTEND_URL",
    "CORS_ALLOWED_ORIGINS",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "AWS_REGION",
    "S3_BUCKET_NAME",
    "S3_PUBLIC_BASE_URL"
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  if (process.env.JWT_SECRET.length < 32 || process.env.SESSION_SECRET.length < 32) {
    throw new Error("JWT_SECRET and SESSION_SECRET must each contain at least 32 characters in production");
  }
};

const startServer = async () => {
  validateProductionEnvironment();
  await connectDB();
  // Bind the HTTP port first. A second accidentally started dev server must
  // never start a scheduler if port 5000 is already owned by the real one.
  const server = await new Promise((resolve, reject) => {
    const httpServer = app.listen(PORT, () => {
      logger.info("Server listening", { port: PORT, environment: process.env.NODE_ENV || "development" });
      resolve(httpServer);
    });
    httpServer.once("error", reject);
  });
  if (process.env.NODE_ENV !== "production" || process.env.ENABLE_BOOKING_SCHEDULER === "true") {
    startBookingScheduler();
  }

  const shutdown = (signal) => {
    logger.info("Graceful shutdown requested", { signal });
    stopBookingScheduler();
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
};

const startWithRetry = async () => {
  try {
    await startServer();
  } catch (error) {
    // Atlas can briefly be unreachable because of DNS/VPN/network changes.
    // Keep one process alive and retry instead of leaving nodemon in a
    // crashed state waiting for an unrelated file save.
    logger.error("Server startup failed; retrying", { error: error.message, stack: error.stack, retryAfterMs: 15_000 });
    setTimeout(startWithRetry, 15_000);
  }
};

startWithRetry();

process.on("unhandledRejection", (reason) => logger.error("Unhandled promise rejection", { reason: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : undefined }));
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception; exiting for PM2 restart", { error: error.message, stack: error.stack });
  setTimeout(() => process.exit(1), 250);
});
