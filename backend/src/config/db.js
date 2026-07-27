const mongoose = require("mongoose");

/**
 * Connects to MongoDB using the URI from environment variables.
 * We fail fast (exit process) if connection fails on startup,
 * because the app is useless without a DB connection.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10_000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
