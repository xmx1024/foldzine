# Fold Zine

Live at https://foldzine.systm32.xyz (GitHub Pages).

A small static web app that turns up to eight pictures into a printable one-sheet, 8-page folded zine.
Runs entirely in the browser (no server code, no uploads, no accounts) and works offline after the first load.

- Upload or drop pictures per page, add captions, choose fill/fit, drag to reorder pages
- Paper: US Letter, A4, A3 (landscape); margin, paper and caption colours; optional fold and cut guides
- Export: JPG at 300 DPI (DPI stamped in the file) and PDF (print sheet, optionally plus each page on its own)
- Layout: 4 x 2 panels, top row rotated 180 degrees: top 5 4 3 2, bottom 6 7 8 1; cut slit across the middle two panels

Files: `index.html` (all code), `sw.js` (offline cache), `manifest.webmanifest`, `icon.svg`. Serve the folder with any static
web server (`python3 -m http.server`); the service worker needs https or localhost.
Own implementation, written from a feature description of similar tools; no third-party code or assets.
