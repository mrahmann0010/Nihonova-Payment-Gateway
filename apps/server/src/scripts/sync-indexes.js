// sync-indexes.js — make every collection's indexes match its schema.
//
// Mongoose builds missing indexes at startup but never drops ones a schema no
// longer declares. Run this after changing schema indexes to build the new ones
// and remove the stale ones. Safe to re-run.

require('dotenv').config();

const mongoose  = require('mongoose');
const connectDB = require('../config/db');

const models = [
  require('../models/Bkash'),
  require('../models/Nagad'),
  require('../models/Rocket'),
  require('../models/WebhookEvent'),
  require('../models/User'),
];

(async () => {
  await connectDB();
  for (const Model of models) {
    const dropped = await Model.syncIndexes();
    console.log(`[INDEXES] ${Model.collection.name}: dropped ${dropped.length ? dropped.join(', ') : 'none'}`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('[INDEXES ERROR]', err);
  process.exit(1);
});
