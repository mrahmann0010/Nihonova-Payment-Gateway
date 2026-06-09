module.exports = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Payment SMS Webhook</title>
<meta name="description" content="Receives bKash, Nagad, and Rocket payment SMS, parses them, and stores clean records in MongoDB." />
<meta name="color-scheme" content="dark" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" />
<link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" /></noscript>
<style>
  :root {
    --bg:        #090D18;
    --bg-elev:   #0E1426;
    --surface:   #121A30;
    --surface-2: #16203A;
    --border:    #1E2A47;
    --border-soft:#18233D;
    --text:      #EDF1F8;
    --text-dim:  #94A2BE;
    --text-faint:#5C6A86;
    --accent:    #4F7BFF;
    --accent-deep:#2B4FD8;
    --accent-soft:rgba(79,123,255,0.12);
    --ok:        #3DDC97;
    --ok-soft:   rgba(61,220,151,0.12);
    --warn:      #FFB54F;
    --down:      #FF6B6B;
    --down-soft: rgba(255,107,107,0.12);
    --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    --display: "Space Grotesk", system-ui, sans-serif;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    line-height: 1.6;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    background-image: radial-gradient(circle at 50% -10%, rgba(79,123,255,0.10), transparent 55%);
    background-repeat: no-repeat;
  }

  .wrap { width: 100%; max-width: 680px; margin: 0 auto; padding: 0 22px; }

  /* header */
  header { border-bottom: 1px solid var(--border-soft); }
  .bar { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; }
  .brand { display: flex; align-items: center; gap: 11px; }
  .mark {
    width: 30px; height: 30px; border-radius: 8px;
    background: linear-gradient(150deg, var(--accent), var(--accent-deep));
    box-shadow: 0 2px 14px rgba(79,123,255,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
    display: grid; place-items: center;
    color: #fff; font-family: var(--mono); font-size: 15px; font-weight: 500;
  }
  .brand .name { font-family: var(--mono); font-size: 13.5px; letter-spacing: 0.01em; color: var(--text); }
  .brand .name span { color: var(--text-faint); }
  .tag {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em;
    color: var(--text-dim); border: 1px solid var(--border);
    border-radius: 999px; padding: 4px 11px;
  }

  /* hero */
  .hero { padding: 58px 0 36px; }
  .eyebrow {
    font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 18px;
  }
  h1 {
    font-family: var(--display); font-weight: 600;
    font-size: clamp(2.05rem, 7.5vw, 3.1rem);
    line-height: 1.07; letter-spacing: -0.025em; color: var(--text);
  }
  h1 .soft { color: var(--text-dim); }
  .lede { margin-top: 20px; font-size: clamp(1rem, 2.4vw, 1.08rem); color: var(--text-dim); max-width: 33em; }

  /* status card */
  .status {
    position: relative;
    background: radial-gradient(140% 120% at 12% -20%, rgba(79,123,255,0.14), transparent 60%), var(--surface);
    border: 1px solid var(--border); border-radius: 16px; padding: 24px 22px; overflow: hidden;
  }
  .status::before {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%);
    pointer-events: none;
  }
  .status-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .status-id  { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .pulse {
    position: relative; width: 11px; height: 11px; flex: none;
    border-radius: 50%; background: var(--text-faint); transition: background 0.3s ease;
  }
  .pulse::after {
    content: ""; position: absolute; inset: -5px;
    border-radius: 50%; border: 2px solid currentColor; opacity: 0;
  }
  .pulse { color: var(--text-faint); }
  .s-ok   .pulse { background: var(--ok);   color: var(--ok); }
  .s-down .pulse { background: var(--down); color: var(--down); }
  .s-warn .pulse { background: var(--warn); color: var(--warn); }
  .s-ok   .pulse::after,
  .s-down .pulse::after { animation: ring 2s ease-out infinite; }
  @keyframes ring {
    0%   { opacity: 0.5; transform: scale(0.7); }
    70%  { opacity: 0;   transform: scale(2.1); }
    100% { opacity: 0; }
  }
  .s-checking .pulse { animation: blink 1s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.3; } }

  .status-label .k { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-faint); }
  .status-label .v { font-family: var(--display); font-weight: 600; font-size: 1.18rem; letter-spacing: -0.01em; color: var(--text); }
  .s-ok   .status-label .v { color: var(--ok); }
  .s-down .status-label .v { color: var(--down); }
  .s-warn .status-label .v { color: var(--warn); }

  .recheck {
    flex: none; font-family: var(--mono); font-size: 12px; color: var(--text-dim);
    background: var(--bg-elev); border: 1px solid var(--border); border-radius: 9px;
    padding: 9px 13px; min-height: 38px; cursor: pointer;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }
  .recheck:hover  { color: var(--text); border-color: var(--accent); }
  .recheck:active { background: var(--surface-2); }
  .recheck:disabled { opacity: 0.5; cursor: default; }

  .status-meta {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin-top: 22px;
    background: var(--border-soft); border: 1px solid var(--border-soft);
    border-radius: 11px; overflow: hidden;
  }
  .metric { background: var(--bg-elev); padding: 13px 15px; }
  .metric .mk { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-faint); }
  .metric .mv { font-family: var(--mono); font-size: 0.95rem; color: var(--text); margin-top: 4px; }

  .status-note { font-family: var(--mono); font-size: 11.5px; color: var(--text-faint); margin-top: 14px; }
  .status-note.err { color: var(--down); }

  /* sections */
  .section { padding: 40px 0; border-top: 1px solid var(--border-soft); }
  .section-head { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 18px; }

  /* platforms */
  .platforms { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .plat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 14px; }
  .plat .pname { font-family: var(--display); font-weight: 600; font-size: 0.98rem; }
  .plat .pmeta { font-family: var(--mono); font-size: 10.5px; color: var(--text-faint); margin-top: 5px; }

  /* endpoints */
  .ep { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .ep-row { display: flex; align-items: center; gap: 12px; padding: 14px 15px; background: var(--surface); }
  .ep-row + .ep-row { border-top: 1px solid var(--border-soft); }
  .verb {
    font-family: var(--mono); font-size: 10.5px; font-weight: 500; letter-spacing: 0.04em;
    padding: 3px 8px; border-radius: 6px; flex: none; border: 1px solid transparent;
  }
  .verb.get  { color: var(--ok);     background: var(--ok-soft);     border-color: rgba(61,220,151,0.25); }
  .verb.post { color: var(--accent); background: var(--accent-soft); border-color: rgba(79,123,255,0.28); }
  .path { font-family: var(--mono); font-size: 13px; color: var(--text); }
  .ep-desc { margin-left: auto; font-size: 12px; color: var(--text-dim); text-align: right; }

  /* code blocks */
  .code-block { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .code-block + .code-block { margin-top: 14px; }
  .cb-head {
    display: flex; align-items: center; gap: 10px; padding: 10px 15px;
    background: var(--surface); border-bottom: 1px solid var(--border-soft);
  }
  .cb-title { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-faint); }
  pre.code {
    margin: 0; padding: 15px 16px; background: var(--bg-elev);
    font-family: var(--mono); font-size: 12.5px; line-height: 1.75; color: var(--text-dim);
    overflow-x: auto; -webkit-overflow-scrolling: touch;
  }
  pre.code .k { color: #8AA8FF; }
  pre.code .s { color: #79D2AC; }
  pre.code .n { color: #FFB54F; }
  .auth-note { font-family: var(--mono); font-size: 11.5px; color: var(--text-faint); margin-top: 14px; }
  .auth-note code { color: var(--accent); }

  /* legend */
  .legend {
    margin-top: 14px; display: grid; gap: 1px;
    background: var(--border-soft); border: 1px solid var(--border-soft);
    border-radius: 11px; overflow: hidden;
  }
  .lg { display: flex; align-items: center; gap: 12px; background: var(--bg-elev); padding: 11px 15px; }
  .lg code {
    font-family: var(--mono); font-size: 11.5px; color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 6px; padding: 2px 9px; flex: none;
  }
  .lg span { font-size: 12.5px; color: var(--text-dim); }

  /* how it works */
  .step { display: flex; gap: 16px; padding: 16px 0; border-top: 1px solid var(--border-soft); }
  .step:first-child { border-top: 0; padding-top: 0; }
  .step .no { font-family: var(--mono); font-size: 12px; color: var(--accent); flex: none; padding-top: 1px; }
  .step .txt { font-size: 14.5px; color: var(--text-dim); }
  .step .txt b { color: var(--text); font-weight: 600; }
  .step .txt code { font-family: var(--mono); font-size: 12.5px; color: var(--accent); }

  /* footer */
  footer { border-top: 1px solid var(--border-soft); padding: 26px 0 40px; }
  .foot {
    font-family: var(--mono); font-size: 11.5px; color: var(--text-faint);
    display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center;
  }
  .foot .dot { color: var(--border); }

  a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  @media (max-width: 460px) {
    .ep-desc { display: none; }
    .status-meta { grid-template-columns: 1fr; }
    .recheck { padding: 9px 11px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
</style>
</head>
<body>

<header>
  <div class="wrap bar">
    <div class="brand">
      <div class="mark">&#8250;_</div>
      <div class="name">sms-webhook<span> /v1</span></div>
    </div>
    <div class="tag">production</div>
  </div>
</header>

<main class="wrap">

  <section class="hero">
    <div class="eyebrow">Payment SMS Webhook</div>
    <h1>Payment SMS in,<br><span class="soft">clean records out.</span></h1>
    <p class="lede">Receives bKash, Nagad, and Rocket notifications forwarded from an Android phone, parses each message, and writes a structured payment record to MongoDB.</p>
  </section>

  <section class="status s-checking" id="status" aria-live="polite">
    <div class="status-top">
      <div class="status-id">
        <span class="pulse" id="pulse"></span>
        <div class="status-label">
          <div class="k">Service status</div>
          <div class="v" id="state">Checking&hellip;</div>
        </div>
      </div>
      <button class="recheck" id="recheck" type="button">Re-check</button>
    </div>
    <div class="status-meta">
      <div class="metric"><div class="mk">Endpoint</div><div class="mv">GET /health</div></div>
      <div class="metric"><div class="mk">Latency</div><div class="mv" id="latency">&mdash;</div></div>
    </div>
    <div class="status-note" id="note">Probing the server&hellip;</div>
  </section>

  <section class="section">
    <div class="section-head">Supported platforms</div>
    <div class="platforms">
      <div class="plat"><div class="pname">bKash</div><div class="pmeta">4 formats</div></div>
      <div class="plat"><div class="pname">Nagad</div><div class="pmeta">money received</div></div>
      <div class="plat"><div class="pname">Rocket</div><div class="pmeta">DBBL &middot; A/C</div></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">Endpoints</div>
    <div class="ep">
      <div class="ep-row">
        <span class="verb get">GET</span>
        <span class="path">/health</span>
        <span class="ep-desc">Liveness probe</span>
      </div>
      <div class="ep-row">
        <span class="verb post">POST</span>
        <span class="path">/webhooks/sms</span>
        <span class="ep-desc">Receives forwarded SMS &middot; token required</span>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">Webhook payload</div>
    <div class="code-block">
      <div class="cb-head">
        <span class="verb post">POST</span>
        <span class="cb-title">Request body &middot; JSON</span>
      </div>
<pre class="code">{
  <span class="k">"from"</span>: <span class="s">"bKash"</span>,
  <span class="k">"text"</span>: <span class="s">"You have received Tk 500.00 from 01712345678 ... TrxID AB1234CDEF at 08/06/2026 14:32"</span>,
  <span class="k">"sim"</span>: <span class="s">"1"</span>,
  <span class="k">"sentStamp"</span>: <span class="n">1749383520000</span>,
  <span class="k">"receivedStamp"</span>: <span class="n">1749383521000</span>
}</pre>
    </div>
    <div class="code-block">
      <div class="cb-head">
        <span class="cb-title">Response &middot; always HTTP 200</span>
      </div>
<pre class="code">{
  <span class="k">"received"</span>: <span class="n">true</span>,
  <span class="k">"processed"</span>: <span class="n">true</span>,
  <span class="k">"platform"</span>: <span class="s">"bkash"</span>,
  <span class="k">"trxId"</span>: <span class="s">"AB1234CDEF"</span>
}</pre>
    </div>
    <div class="legend">
      <div class="lg"><code>processed: true</code><span>Payment saved</span></div>
      <div class="lg"><code>unmatched</code><span>No known SMS pattern matched</span></div>
      <div class="lg"><code>duplicate</code><span>trxId already stored &mdash; delivery retried</span></div>
    </div>
    <p class="auth-note">Authenticate by appending <code>?token=&lt;WEBHOOK_SECRET&gt;</code> to the URL. Missing or invalid tokens are rejected with <code>401</code>.</p>
  </section>

  <section class="section">
    <div class="section-head">How it works</div>
    <div class="flow">
      <div class="step"><span class="no">01</span><span class="txt">A phone receives a payment SMS from <b>bKash, Nagad, or Rocket</b>.</span></div>
      <div class="step"><span class="no">02</span><span class="txt">The forwarder app <b>POSTs the raw text</b> to <code>/webhooks/sms</code>.</span></div>
      <div class="step"><span class="no">03</span><span class="txt">The server detects the platform and <b>parses it into structured fields</b>.</span></div>
      <div class="step"><span class="no">04</span><span class="txt">The record is <b>written to MongoDB</b>; duplicate deliveries are dropped by trxId.</span></div>
    </div>
  </section>

</main>

<footer>
  <div class="wrap foot">
    <span>Express</span><span class="dot">&middot;</span>
    <span>MongoDB</span><span class="dot">&middot;</span>
    <span>Mongoose</span><span class="dot">&middot;</span>
    <span>deployed on Vercel</span>
  </div>
</footer>

<script>
  (function () {
    var card    = document.getElementById('status');
    var stateEl = document.getElementById('state');
    var latEl   = document.getElementById('latency');
    var noteEl  = document.getElementById('note');
    var btn     = document.getElementById('recheck');

    function setClass(name) { card.className = 'status ' + name; }
    function clockNow() {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    async function check() {
      setClass('s-checking');
      stateEl.textContent = 'Checking…';
      latEl.textContent   = '—';
      noteEl.className    = 'status-note';
      noteEl.textContent  = 'Probing the server…';
      btn.disabled        = true;

      var t0 = performance.now();
      try {
        var res  = await fetch('/health', { cache: 'no-store' });
        var ms   = Math.round(performance.now() - t0);
        var data = {};
        try { data = await res.json(); } catch (e) {}

        latEl.textContent = ms + ' ms';

        if (res.ok && data && data.status === 'ok') {
          setClass('s-ok');
          stateEl.textContent = 'Operational';
          noteEl.textContent  = 'All systems normal · checked ' + clockNow();
        } else {
          setClass('s-warn');
          stateEl.textContent = 'Degraded';
          noteEl.textContent  = 'Server responded with HTTP ' + res.status + ' · checked ' + clockNow();
        }
      } catch (e) {
        setClass('s-down');
        stateEl.textContent = 'Unreachable';
        latEl.textContent   = '—';
        noteEl.className    = 'status-note err';
        noteEl.textContent  = "Can’t reach /health — is the server running?";
      } finally {
        btn.disabled = false;
      }
    }

    btn.addEventListener('click', check);
    check();
  })();
</script>

</body>
</html>`;
