// Inlines the esbuild bundle into a single self-contained index.html, with a
// strict Content-Security-Policy. Both inline scripts are hashed per build so
// script-src stays locked to exactly our code — a future XSS (none exist today)
// could neither execute injected JS nor exfiltrate the auth token, since
// connect-src only permits our own Supabase origin.
const fs = require("fs");
const crypto = require("crypto");

// Must match SB_URL in src/leak-lab.jsx — the only cross-origin endpoint.
const SB_ORIGIN = "https://digcgqltrlmhgmzgmvwc.supabase.co";

const js = fs.readFileSync(".build/leak-lab.bundle.js", "utf8").replace(/<\/script>/g, "<\\/script>");
// Service-worker registration — its own inline script, hashed too.
const swReg = `if("serviceWorker" in navigator){addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(function(){})})}`;

// The browser hashes the exact text between <script> and </script>. Interpolate
// each content string directly against the tags (no surrounding whitespace) so
// the hash we compute is the hash the browser computes.
const sha256 = (s) => "'sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64") + "'";
const csp = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  `script-src ${sha256(swReg)} ${sha256(js)}`,
  "style-src 'self' 'unsafe-inline'", // React-injected <style> + the head reset; styles can't execute JS
  "img-src 'self' data:",
  "font-src data:",                    // fonts are embedded data: URIs
  `connect-src 'self' ${SB_ORIGIN}`,   // Supabase REST + Auth, nothing else
  "manifest-src 'self'",
  "worker-src 'self'",
  "form-action 'none'",
].join("; ");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="referrer" content="strict-origin-when-cross-origin" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<meta name="theme-color" content="#101418" />
<meta name="description" content="Leak Lab — a live poker strategy trainer. You aren't playing a GTO bot: learn what the Nit, the Station, and the Maniac are really doing, and see every leak priced in your stakes." />
<meta property="og:title" content="Leak Lab — Live Poker Strategy Trainer" />
<meta property="og:description" content="Train against real player types, not a solver. Spot the Nit, the Station, the Maniac — and see every mistake priced in dollars at your stakes." />
<meta property="og:type" content="website" />
<title>Leak Lab — Live Poker Strategy Trainer</title>
<link rel="manifest" href="manifest.webmanifest" />
<link rel="icon" type="image/png" href="icon-192.png" />
<link rel="apple-touch-icon" href="icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Leak Lab" />
<style>html,body{margin:0;padding:0;background:#101418}</style>
</head>
<body>
<div id="root"></div>
<script>${swReg}</script>
<script>${js}</script>
</body>
</html>`;
fs.writeFileSync("index.html", html);
console.log("Built index.html (" + Math.round(html.length / 1024) + "kb) — CSP script hashes locked");
