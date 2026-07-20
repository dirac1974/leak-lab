// Inlines the esbuild bundle into a single self-contained index.html
const fs = require("fs");
const js = fs.readFileSync("/tmp/leak-lab.bundle.js", "utf8").replace(/<\/script>/g, "<\\/script>");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<meta name="theme-color" content="#101418" />
<meta name="description" content="Leak Lab — a mobile-first No-Limit Hold'em GTO trainer. Seat opponent profiles, drill pre- and postflop decisions, and see every leak priced in your stakes." />
<meta property="og:title" content="Leak Lab — Poker GTO Trainer" />
<meta property="og:description" content="Find the leaks in your poker game. Profile the table, drill the spots, see every mistake priced in dollars." />
<meta property="og:type" content="website" />
<title>Leak Lab — Poker GTO Trainer</title>
<style>html,body{margin:0;padding:0;background:#101418}</style>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
</body>
</html>`;
fs.writeFileSync("index.html", html);
console.log("Built index.html (" + Math.round(html.length / 1024) + "kb)");
