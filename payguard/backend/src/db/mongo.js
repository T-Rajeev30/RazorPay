/**
 * mongo.js
 *
 * Single responsibility: establish and export the MongoDB connection.
 * Nothing else in the codebase should call mongoose.connect directly.
 */
const mongoose = require("mongoose");

async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment variables");
  }

  mongoose.connection.on("connected", () => {
    console.log("[mongo] connected");
  });
  mongoose.connection.on("error", (err) => {
    console.error("[mongo] connection error:", err.message);
  });

  await mongoose.connect(uri);
}

module.exports = { connectToDatabase };
