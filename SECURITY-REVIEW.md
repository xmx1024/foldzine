# Security review (2026-10-17)

Scope: the whole app (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`). It is a static, client-side-only
tool: no server code, no accounts, no network calls, no third-party scripts, fonts or analytics.

## Findings and what was done
| # | Area | Finding | Result |
|---|---|---|---|
| 1 | XSS | `innerHTML` is used once to build page cards, but only from static strings and the page number; captions and filenames never reach HTML (textarea `.value`, canvas `fillText`, `textContent`). Verified with an HTML caption: rendered as text. | No issue |
| 2 | CSP | Inline script and style would have forced a weak policy. | Fixed: code moved to `app.js`/`style.css`; CSP meta: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'`. Verified: injected inline script does not run, fetch to another host is blocked. |
| 3 | Untrusted files | `accept="image/*"` allowed SVG (script inside SVG cannot run via `<img>`, but it can taint the canvas and break export in some browsers). | Fixed: allow-list JPEG, PNG, WebP, GIF, AVIF, BMP, checked again in `loadImage` (drag-and-drop path included). |
| 4 | Stored settings | `localStorage` values were assigned to controls unchecked; a tampered value could break the app (self-DoS, same origin only). | Fixed: select values must be one of the offered options, colours must match `#rrggbb`. Verified with hostile values. |
| 5 | Memory | Object URLs were never revoked. | Fixed: revoked on load/error. |
| 6 | Robustness | A3 at 300 DPI is 17.4 MP, over the ~16.7 MP canvas limit on iOS Safari (silent blank export). | Fixed: sheet size caps at 16 MP by lowering DPI (A3 exports at about 285 DPI); real DPI is stamped in the JPG and shown in the status line. `toBlob` failure is reported. |
| 7 | Privacy | Exports go through canvas, so EXIF (including GPS) is stripped from the pictures. | Good, no change. |
| 8 | Service worker | Cache-first with versioned cache name. Stale versions persist until `CACHE` is bumped. | Documented: bump `CACHE` in `sw.js` on every release. |
| 9 | Supply chain | No dependencies, no CDN, no build step. | No issue |

## Needs the host (cannot be set by a meta tag)
`frame-ancestors 'none'` (or `X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, HSTS, `Permissions-Policy` (camera,
microphone, geolocation off), and a real CSP header (same policy as the meta tag). GitHub Pages allows none of these; a self-hosted
nginx can set all of them.
