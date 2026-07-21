# Deploy — Cloudflare Pages, private repo, custom domain

Goal: serve the app from your own domain with **nothing linking back to your GitHub identity**. Cloudflare Pages hosts a **private** repo for free, serves from Cloudflare's edge (so DNS shows Cloudflare, never `github.io`), and gives you the custom domain + TLS in one place.

## Why not GitHub Pages + a proxy
GitHub Pages on a private repo needs a paid plan, and its required `_github-pages-challenge-<username>` DNS record leaks your username. Cloudflare Pages avoids both: private repo is free, and there is no github.io anywhere in DNS.

---

## What's already done (repo side)
- `npm run build` emits a clean `_site/` — only `index.html`, `sw.js`, `manifest.webmanifest`, and the three icons. No `src/`, `tools/`, `node_modules/`, or `.git/` are ever served.
- `_site/_headers` ships a strict CSP (script-src locked to per-build hashes; connect-src limited to self + the Supabase project), plus `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`.
- The served files contain **no** reference to your GitHub username or repo. README's live-URL line is scrubbed.
- Relative asset paths (`./sw.js`, `manifest.webmanifest`, icons) work at a domain root, so no `/leak-lab/` subpath assumptions remain.

## What only you can do (needs your accounts / a purchase)

**1. Buy a domain** (~$12/yr). Any registrar. Pick a name with no tie to your handle. Cloudflare Registrar sells at cost if you want it all in one dashboard.

**2. Create a free Cloudflare account** and add the domain (Cloudflare will give you two nameservers to set at the registrar — this moves DNS to Cloudflare).

**3. Cloudflare Pages → Create → Connect to Git.** Authorize Cloudflare's GitHub app **scoped to only the `leak-lab` repo** (not all repos). Build settings:
- Framework preset: **None**
- Build command: `npm ci && npm test && npm run build`
- Build output directory: `_site`
- Node version: set env var `NODE_VERSION` = `20`

**4. Add the custom domain** in the Pages project (Custom domains → Set up). Cloudflare creates the proxied DNS record automatically — orange cloud ON, so `dig yourdomain.com` returns Cloudflare IPs, not github.io.

**5. Point Supabase auth at the new domain** (magic-link login breaks otherwise). Supabase dashboard → Authentication → URL Configuration → add `https://yourdomain.com` (and `https://yourdomain.com/**`) to **Redirect URLs**, and set it as the **Site URL**. The app derives its redirect from `window.location`, so no code change — but the allowlist must include the new origin. (The old github.io URL can be removed once the cutover is confirmed.)

**6. Make the repo private** — GitHub → Settings → Danger Zone → Change visibility → Private. **Do this only after Cloudflare Pages is confirmed serving**, because it immediately stops the free GitHub Pages deploy.

**7. Retire GitHub Pages** — Settings → Pages → Source → None, and delete `.github/workflows/pages.yml` (Cloudflare now owns the build). Optional: keep the workflow as a test-only CI on private repos (free Actions minutes).

## What I verify after (send me the domain)
- `dig yourdomain.com` shows Cloudflare, not github.io — no username in any DNS record.
- The site serves, CSP + security headers are live as real HTTP headers, fonts load, the service worker registers, and a Supabase telemetry ping succeeds.
- Magic-link login round-trips on the new origin.
- `github.com/<username>` is not reachable from anywhere on the site, and the repo no longer appears in public search.

## Residual exposure (honest note)
- **Certificate Transparency** logs the domain publicly (crt.sh) — unavoidable for any TLS site; it reveals the domain, not the GitHub link.
- The embedded Supabase publishable key ties the app to that Supabase project. Isolating Leak Lab into its **own** Supabase project (separate from the trading bot) is the remaining separation step — tracked in the commercialization plan.
