// Nagad — received Nagad payments. Collection: "nagad".
// Adds "ref", the optional reference note included in Nagad SMS.
const createPaymentModel = require('./createPaymentModel');

module.exports = createPaymentModel('Nagad', 'nagad', {
  ref: {
    type: String,
    default: null,
  },
});
