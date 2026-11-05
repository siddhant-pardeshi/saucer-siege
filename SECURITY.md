# Security policy

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** on this repository (Security tab → Report a vulnerability). Public issues for security problems are discouraged, since they disclose the weakness before a fix ships.

## Scope and posture

This is a **fully static, client-side game site** deployed on GitHub Pages:

- **No backend, no accounts, no secrets.** There is nothing to breach server-side and no credentials to leak.
- **Zero third-party dependencies.** Every line of code is first-party; there is no supply-chain surface, no CDN scripts, no trackers, no ads.
- **Content Security Policy** is deployed via meta tag: scripts load only from the site itself (`script-src 'self'`), no remote code, no inline script handlers, no outbound connections (`connect-src 'none'`).
- **Data storage**: game progress and settings live in `localStorage` under the `sidgames.*` namespace — progress, best scores, audio/quality preferences. No personal data is requested or stored. Clearing site data wipes everything.
- **No cookies, no analytics, no fingerprinting.**

## Hardening notes for contributors

- Never add remote scripts, external fonts, or analytics without revisiting the CSP (`index.html`).
- Never place secrets in client code — there is nowhere safe for them in a static site.
- User-supplied text does not exist in these games; all rendered strings are first-party content. If that ever changes, route dynamic text through `textContent`, not `innerHTML`.
