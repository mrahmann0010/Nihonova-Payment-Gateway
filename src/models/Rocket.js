// Rocket — received Rocket (DBBL) payments. Collection: "rocket".
// "sender" holds the masked account number printed in the SMS (e.g. "***515").
const createPaymentModel = require('./createPaymentModel');

module.exports = createPaymentModel('Rocket', 'rocket');
