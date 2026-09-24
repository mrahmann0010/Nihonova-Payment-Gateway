// requireClient.js — the gate on /v1/*, the surface consuming apps talk to.
//
// Deliberately not requireAdmin. A business that verifies payments must not
// hold an admin credential: with one it can read the other business's ledger
// and fish the payment list with a prefix search. A client credential can do
// exactly one thing — claim a payment.
//
//   Authorization: Bearer <clientId>.<secret>
//
// Every failure that isn't "deactivated" returns the same 401 body. An unknown
// client and a wrong secret must be indistinguishable, or the response becomes
// an oracle for which client IDs exist. 'client_inactive' is the one exception:
// it is a 403 because the caller's own operator needs to be able to tell "your
// key is wrong" from "your account was switched off" without filing a ticket.

const { authenticate } = require('../services/clientAuth');
const log = require('../services/logger');

const UNAUTHENTICATED = { error: 'Unauthenticated', reason: 'unauthenticated' };

async function requireClient(req, res, next) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json(UNAUTHENTICATED);

  let result;
  try {
    result = await authenticate(header.slice(7).trim());
  } catch (err) {
    return next(err);
  }

  if (!result.ok) {
    if (result.reason === 'inactive') {
      return res.status(403).json({ error: 'Client is deactivated', reason: 'client_inactive' });
    }
    // Logged, not returned — the operator can see which client ID was tried
    // while the caller still learns nothing from the response body.
    log.warn('CLIENT', 'auth_fail', { reason: result.reason, ip: req.ip });
    return res.status(401).json(UNAUTHENTICATED);
  }

  req.client = result.client;

  // A request that authenticated on the outgoing secret still succeeds — that
  // is the point of the grace window — but it is the only signal that an app
  // has not picked up its new credential yet, so it is worth a line.
  if (result.usedSecret === 'previous') {
    log.warn('CLIENT', 'stale_secret', {
      clientId: result.client.clientId,
      expires: result.client.previousExpiresAt?.toISOString(),
    });
  }

  next();
}

module.exports = requireClient;
