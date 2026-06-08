require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../config/db"); // adjust path if needed

async function resetDatabase() {
  try {
    await connectDB();

    const db = mongoose.connection.db;

    console.log("[RESET] Connected to DB:", db.databaseName);

    // ❌ WARNING: This deletes EVERYTHING in the database
    await db.dropDatabase();

    console.log("[RESET] Database dropped successfully.");

    // Optional: recreate collections (MongoDB will auto-create on insert anyway)
    await db.createCollection("payments");
    await db.createCollection("transactions");

    console.log("[RESET] Collections initialized in primary-data.");

    process.exit(0);
  } catch (err) {
    console.error("[RESET ERROR]", err);
    process.exit(1);
  }
}

resetDatabase();
