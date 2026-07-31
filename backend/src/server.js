// Force reload to pick up email.js template changes
require("dotenv").config();
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
  if (process.env.NODE_ENV !== "production" || process.env.ENABLE_BOOKING_SCHEDULER === "true") {
    startBookingScheduler();
  }
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received. Shutting down gracefully.`);
    stopBookingScheduler();
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
};

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
