// csrfGuard.js — protects state-changing admin routes against cross-site
// requests that ride the session cookie.
//
// Why this is needed now and wasn't before: the admin API was read-only, so a
// forged cross-site request could do nothing. Client management adds the first
// writes, and the session cookie is SameSite=None in production (jwt.js) —
// required for the Vercel dashboard to talk to this API at all — which means a
// request from any site arrives WITH the admin's cookie attached.
//
// CORS does not stop this. CORS blocks the attacker from reading the response;
// it does not stop the request, and the write would already have happened.
//
// The defence: demand a header no cross-site form can set. Requiring a custom
// header forces the browser to preflight, and the preflight is checked against
// the CORS origin allowlist in app.js — so the real request never lands. A
// plain <form> cross-site POST can't set headers at all, so it fails here.

const REQUESTED_WITH = 'nihonova-admin';

function csrfGuard(req, res, next) {
  // Reads are safe and are never state-changing on this API.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  if (req.get('x-requested-with') !== REQUESTED_WITH) {
    return res.status(403).json({ error: 'Missing X-Requested-With header' });
  }
  next();
}

module.exports = csrfGuard;
module.exports.REQUESTED_WITH = REQUESTED_WITH;
