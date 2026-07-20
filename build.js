// Inlines the esbuild bundle into a single self-contained index.html
const fs = require("fs");
const js = fs.readFileSync(".build/leak-lab.bundle.js", "utf8").replace(/<\/script>/g, "<\\/script>");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
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
<script>if("serviceWorker" in navigator){addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(function(){})})}</script>
<script>
${js}
</script>
</body>
</html>`;
fs.writeFileSync("index.html", html);
console.log("Built index.html (" + Math.round(html.length / 1024) + "kb)");
