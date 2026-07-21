// Inlines the esbuild bundle into a single self-contained index.html with a
// strict Content-Security-Policy, then assembles a clean _site/ deploy folder
// (the only files that should ever be served) plus a _headers file of real HTTP
// security headers. _site/ is what both GitHub Actions and Cloudflare Pages
// publish; _headers is consumed by Cloudflare Pages (ignored, harmlessly, by
// GitHub Pages). Nothing else in the repo is served.
const fs = require("fs");
const crypto = require("crypto");

// Must match SB_URL in src/leak-lab.jsx — the only cross-origin endpoint.
const SB_ORIGIN = "https://digcgqltrlmhgmzgmvwc.supabase.co";
const RUNTIME_FILES = ["sw.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

const js = fs.readFileSync(".build/leak-lab.bundle.js", "utf8").replace(/<\/script>/g, "<\\/script>");
const swReg = `if("serviceWorker" in navigator){addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(function(){})})}`;

// The browser hashes the exact text between <script> and </script>. Interpolate
// each content string directly against the tags (no surrounding whitespace) so
// the hash we compute is the hash the browser computes.
const sha256 = (s) => "'sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64") + "'";
const cspDirectives = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  `script-src ${sha256(swReg)} ${sha256(js)}`,
  "style-src 'self' 'unsafe-inline'", // React-injected <style> + head reset; styles can't execute JS
  "img-src 'self' data:",
  "font-src data:",                    // fonts are embedded data: URIs
  `connect-src 'self' ${SB_ORIGIN}`,   // Supabase REST + Auth, nothing else
  "manifest-src 'self'",
  "worker-src 'self'",
  "form-action 'none'",
];
const cspMeta = cspDirectives.join("; ");
// Headers can enforce frame-ancestors (meta cannot) — add anti-clickjacking there.
const cspHeader = [...cspDirectives, "frame-ancestors 'none'"].join("; ");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${cspMeta}" />
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

// Assemble the clean deploy folder.
fs.rmSync("_site", { recursive: true, force: true });
fs.mkdirSync("_site", { recursive: true });
fs.writeFileSync("_site/index.html", html);
for (const f of RUNTIME_FILES) fs.copyFileSync(f, "_site/" + f);
// Real security headers for Cloudflare Pages (frame-ancestors, nosniff, etc.).
fs.writeFileSync("_site/_headers", `/*
  Content-Security-Policy: ${cspHeader}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
`);

console.log("Built index.html + _site/ (" + Math.round(html.length / 1024) + "kb) — CSP hashes locked, security headers written");
