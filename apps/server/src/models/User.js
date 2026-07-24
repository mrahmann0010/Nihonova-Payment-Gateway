// User.js — admin accounts for the dashboard login.
//
// Replaces the old single shared ADMIN_TOKEN with real username/password
// accounts. Passwords are stored only as bcrypt hashes; the plaintext is never
// persisted. A default `admin` account is seeded on startup (see seedAdmin.js).

const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    username:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, collection: 'users' }
);

module.exports = mongoose.model('User', schema);
