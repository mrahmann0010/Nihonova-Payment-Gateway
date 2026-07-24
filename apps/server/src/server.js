// Local development entry point.
// Vercel does not use this file — it uses api/index.js instead.

const app  = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
