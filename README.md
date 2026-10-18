# Fold Zine

Live at https://foldzine.systm32.xyz (GitHub Pages).

A small static web app that turns up to eight pictures into a printable one-sheet, 8-page folded zine.
Runs entirely in the browser (no server code, no uploads, no accounts) and works offline after the first load.

- Pictures or text on every page: drop, pick or paste photos; zoom, pan and rotate each one; captions; text pages with font, size, alignment and colours
- Reorder with the arrow buttons (works on touch and keyboard) or drag the handle with a mouse
- Autosaves in the browser (IndexedDB, this device only); Save/Open project files; photos over 4096 px are downscaled on load
- Paper: US Letter, A4, A3 (landscape); margin, paper and caption colours; optional fold and cut guides
- Export: JPG (300 DPI stamped in the file), PNG, PDF (print sheet, optionally plus each page on its own), ZIP of the eight pages, and a numbered fold-test sheet for a dry run
- Layout: 4 x 2 panels, top row rotated 180 degrees: top 5 4 3 2, bottom 6 7 8 1; cut slit across the middle two panels

Files: `index.html` (all code), `sw.js` (offline cache), `manifest.webmanifest`, `icon.svg`. Serve the folder with any static
web server (`python3 -m http.server`); the service worker needs https or localhost.
Own implementation, written from a feature description of similar tools; no third-party code or assets.

## Development

- `npm install`, then `PW_CHANNEL=chrome npx playwright test` (uses your installed Chrome; CI uses Playwright's Chromium).
- The tests cover the fold-order geometry, uploads and file-type rules, reordering, the editor, every export format,
  project save/open, autosave, and the security checks (CSP, hostile project files, tampered saved data).
- `tools/make-assets.js` regenerates `og.png` and `apple-touch-icon.png`. Bump `CACHE` in `sw.js` on every release.
