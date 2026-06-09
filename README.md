# Payment SMS Webhook Server

An Express.js server that receives payment SMS notifications forwarded by an Android app, parses them, and stores the extracted data in MongoDB — one collection per payment platform.

Supports **bKash**, **Nagad**, and **Rocket (DBBL)**.

---

## How it works

1. An Android phone receives an SMS from bKash / Nagad / Rocket.
2. The **"Incoming SMS to URL Forwarder"** app on that phone POSTs the raw SMS text to this server.
3. The server detects the platform, parses the message with a regex-based parser, and saves the structured payment record to MongoDB.
4. Duplicate deliveries are silently deduplicated using the transaction ID as a unique key.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env` and fill in your values:

```env
PORT=3000
MONGO_URI=your-mongodb-connection-string

# Secret token — append ?token=<this value> to your webhook URL in the Android app
WEBHOOK_SECRET=your-random-secret

# Sender IDs to accept (comma-separated, case-insensitive). Use * to accept all.
BKASH_SENDER=bKash
NAGAD_SENDER=Nagad
ROCKET_SENDER=DBBL
```

### 3. Run

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

### 4. Configure the Android app

In "Incoming SMS to URL Forwarder", set the webhook URL to:

```
https://your-domain.com/webhooks/sms?token=<WEBHOOK_SECRET>
```

---

## Deployment (Vercel)

The project is pre-configured for Vercel. `vercel.json` routes all traffic to `api/index.js`, which exports the Express app as a serverless function.

```bash
vercel deploy
```

Set `MONGO_URI`, `WEBHOOK_SECRET`, and sender env vars in your Vercel project settings.

---

## API

### `GET /health`

Returns `{ "status": "ok" }`. Use this to verify the server is up.

---

### `POST /webhooks/sms?token=<secret>`

The main webhook endpoint. Receives an SMS payload from the Android forwarder app.

**Request body** (JSON, sent by the Android app):

| Field | Type | Description |
|---|---|---|
| `from` | string | Sender ID (e.g. `"bKash"`) |
| `text` | string | Raw SMS text |
| `sim` | string | SIM slot the SMS arrived on (e.g. `"1"`) |
| `sentStamp` | number | Epoch ms when the SMS was sent |
| `receivedStamp` | number | Epoch ms when the SMS was received |

**Response** (always HTTP 200 unless a server error occurs):

```json
{ "received": true, "processed": true, "platform": "bkash", "trxId": "AB1234CDEF" }
```

| `processed` | `reason` | Meaning |
|---|---|---|
| `true` | — | Payment saved successfully |
| `false` | `unmatched` | SMS didn't match any known payment pattern |
| `false` | `duplicate` | TrxID already exists — delivery was retried |
| `false` | — | Sender not in the allowed-senders list |

---

## Parsers

Each parser is a pure function that takes a raw SMS string and returns a structured object, or `null` if the text doesn't match.

All timestamps in bKash SMS are in Bangladesh local time (BDT, UTC+6). Parsers convert them to UTC before storing. The original raw date and time strings are preserved on the document.

---

### bKash (`src/services/bkashParser.js`)

Handles four SMS formats:

#### 1. Send Money received (`type: "received"`)

Triggered when someone sends money to your bKash account.

```
You have received Tk 500.00 from 01712345678. Fee Tk 0.00.
Balance Tk 1,200.00. TrxID AB1234CDEF at 08/06/2026 14:32
```

| Field | Value |
|---|---|
| `type` | `"received"` |
| `amount` | `500` |
| `senderNumber` | `"01712345678"` |
| `fee` | `0` |
| `balance` | `1200` |
| `trxid` | `"AB1234CDEF"` |
| `bkashTimestamp` | UTC Date |

---

#### 2. Cash In deposit (`type: "deposit"`)

Triggered when an agent deposits cash into your bKash account. No sender phone number is included — the sender is an agent/branch code.

```
You have received a deposit of BDT 30,000 from CZB. Fee BDT 0.00.
Balance BDT 200,000. TrxID XXXXXXXXXX at 08/06/2026 14:32
```

| Field | Value |
|---|---|
| `type` | `"deposit"` |
| `senderNumber` | `null` |

---

#### 3. iBanking deposit (`type: "ibanking_deposit"`)

Triggered when money is transferred into your bKash account from a bank via iBanking.

```
You have received deposit from iBanking of Tk 99.00 from Prime Bank.
Fee Tk 0.00. Balance Tk 23,324.44. TrxID DF844EE7SM at 08/06/2026 21:41
```

| Field | Value |
|---|---|
| `type` | `"ibanking_deposit"` |
| `senderNumber` | `null` |

---

#### 4. Merchant payment (`type: "payment"`) — not stored

Outgoing payments (Pay Bill, merchant checkout) are parsed but discarded. Only incoming money is saved to the database.

```
Payment Tk 1,000.00 to Some Merchant from 01712345678.
Fee Tk 0.00. Balance Tk 200.00. TrxID XY9876GHIJ at 08/06/2026 15:10
```

---

### Nagad (`src/services/nagadParser.js`)

Handles the standard "Money Received" notification. The `Ref:` line is optional.

```
Money Received.
Amount: Tk 99.00
Sender: 01634358056
Ref: Saom
TxnID: 75HKUOBF
Balance: Tk 1289.43
08/06/2026 19:00
```

**Returned fields:**

| Field | Description |
|---|---|
| `platform` | `"nagad"` |
| `amount` | Payment amount |
| `sender` | Sender's phone number |
| `fee` | Always `0` (not included in Nagad SMS) |
| `balance` | Account balance after transaction |
| `trxId` | Transaction ID |
| `ref` | Optional reference note, or `null` |
| `dateReceived` | UTC Date |

---

### Rocket / DBBL (`src/services/rocketParser.js`)

Handles the single-line received-money notification. The sender is a masked account number, not a phone number. The date format is `dd-MON-yy` with a 12-hour clock.

```
Tk99.00 received from A/C:***515 Fee:Tk0, Your A/C Balance: Tk1,145.85
TxnId:6606781284 Date:08-JUN-26 06:21:43 am. Download https://bit.ly/nexuspay
```

**Returned fields:**

| Field | Description |
|---|---|
| `platform` | `"rocket"` |
| `amount` | Payment amount |
| `sender` | Masked account number (e.g. `"***515"`) |
| `fee` | Transaction fee |
| `balance` | Account balance after transaction |
| `trxId` | Transaction ID |
| `dateReceived` | UTC Date |

---

## Database

MongoDB with Mongoose. Each platform has its own collection:

| Collection | Model file |
|---|---|
| `bkash` | `src/models/Bkash.js` |
| `nagad` | `src/models/Nagad.js` |
| `rocket` | `src/models/Rocket.js` |

All three share the same base schema (defined in `src/models/createPaymentModel.js`):

| Field | Type | Notes |
|---|---|---|
| `amount` | Number | Payment amount |
| `sender` | String | Phone number or masked account |
| `fee` | Number | Transaction fee (default `0`) |
| `balance` | Number | Account balance after transaction |
| `trxId` | String | **Unique index** — idempotency key |
| `dateReceived` | Date | UTC timestamp of the transaction |
| `timeReceived` | String | Raw local time string from the SMS |
| `rawDate` | String | Raw local date string from the SMS |
| `simNumber` | Number | SIM slot (1, 2, …) or `null` |
| `rawMessage` | String | The original SMS text, verbatim |
| `createdAt` | Date | Auto-added by Mongoose |
| `updatedAt` | Date | Auto-added by Mongoose |

Nagad adds one extra field:

| Field | Type | Notes |
|---|---|---|
| `ref` | String | Optional reference note from the SMS |

---

## Project structure

```
src/
├── app.js                      # Express app setup, middleware, routes
├── server.js                   # Local dev entry point (binds to PORT)
├── config/
│   └── db.js                   # Mongoose connection
├── middleware/
│   └── verifySignature.js      # Token auth via ?token= query param
├── models/
│   ├── createPaymentModel.js   # Schema factory shared by all platforms
│   ├── Bkash.js
│   ├── Nagad.js
│   └── Rocket.js
├── routes/
│   └── webhook.js              # POST /webhooks/sms handler
└── services/
    ├── parsePayment.js         # Platform dispatcher
    ├── bkashParser.js          # bKash SMS regex parser
    ├── nagadParser.js          # Nagad SMS regex parser
    ├── rocketParser.js         # Rocket SMS regex parser
    └── timeUtil.js             # BDT → UTC conversion helpers
api/
└── index.js                    # Vercel serverless entry point
```

---

## Security

- All webhook requests must include `?token=<WEBHOOK_SECRET>` in the URL. Requests without a valid token are rejected with HTTP 401.
- Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks.
- The server will refuse to start (return 503) in production if `WEBHOOK_SECRET` is not set or is left as the placeholder value.
