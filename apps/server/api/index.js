// Vercel serverless entry point.
// Vercel expects a default export of a Node.js request handler.
// Express apps satisfy that interface directly.

const app = require('../src/app');

module.exports = app;
