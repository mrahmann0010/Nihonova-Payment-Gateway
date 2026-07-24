// seed-admin.js — one-time script to create the default admin account.
//
// Run once after setting up the database:
//   node src/scripts/seed-admin.js
//
// Creates the account (default admin / 2250, override via DEFAULT_ADMIN_USER /
// DEFAULT_ADMIN_PASS) only if it does not already exist, then exits. This is a
// deliberate manual step — it is NOT wired into the server startup.

require('dotenv').config();

const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const connectDB = require('../config/db');
const User      = require('../models/User');

async function run() {
  const username = (process.env.DEFAULT_ADMIN_USER || 'admin').toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASS || '2250';

  await connectDB();

  const existing = await User.findOne({ username });
  if (existing) {
    console.log(`[Seed] Account "${username}" already exists — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ username, passwordHash });
  console.log(`[Seed] Created admin account "${username}".`);
}

run()
  .catch((err) => {
    console.error('[Seed] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
