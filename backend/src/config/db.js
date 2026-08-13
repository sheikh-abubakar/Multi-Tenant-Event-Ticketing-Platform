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
    
    // Auto-cleanup: Unset/remove googleId from users where it is null to resolve index collision.
    const result = await mongoose.connection.collection("users").updateMany(
      { googleId: null },
      { $unset: { googleId: "" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[Database Cleanup] Cleaned up ${result.modifiedCount} users with null googleId`);
    }
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Let the server bootstrapper decide how to retry. Exiting here made
    // transient Atlas/DNS delays look like a nodemon application crash.
    throw error;
  }
};

module.exports = connectDB;
