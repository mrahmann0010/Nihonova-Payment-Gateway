// trxId.js — the one form two receipts are compared in.
//
// Uppercased, with every non-alphanumeric character removed. Every parser in
// services/*Parser.js captures a transaction ID as [A-Z0-9] and stores it
// uppercase, so a value put through this function matches a stored trxId
// exactly — which means the lookup stays an index seek on the unique trxId
// index rather than becoming a regex scan.
//
// ## Why this exists at all
//
// A transaction ID reaches a consuming app *by hand*: the student reads it off
// a payment SMS and types it into a checkout form. "8f3k2m9x01", "8F3K2M9X01"
// and "8F3K 2M9X01" are one receipt. Without normalising, two of those three
// come back 404 from /v1/claims — and worse, two apps sending different
// spellings of the SAME id would each get a successful claim, because the
// unique index compares the raw strings. Normalising before the insert is what
// makes the single-use rule hold against a shift key.
//
// The character class is [^A-Za-z0-9] rather than \s on purpose: it removes
// every kind of space including the non-breaking one, the zero-width characters
// that survive a trim, and the hyphens and underscores that made "PAY-123" and
// "PAY123" two different receipts.
//
// This deliberately mirrors `normaliseTransactionId` in sakura-book
// (apps/api/src/payment-verification) and the `transaction_id_normalised`
// generated column beside it. The two must produce the same string for the same
// input; if this rule ever changes, that one changes with it.
function normaliseTrxId(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

module.exports = { normaliseTrxId };
