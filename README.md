# Fold Zine

Turn up to eight pictures into a printable zine made from a single folded sheet of paper.

**Use it:** https://foldzine.systm32.xyz

## What it does

- Eight pages on one sheet: add photos or text pages, then print, cut one slit and fold.
- Move, zoom and rotate each picture, add captions, or make a page text-only (font, size, alignment, colours).
- Reorder pages with the arrow buttons, by dragging, or by dragging panels around the print-sheet preview.
- Pick US Letter, A4 or A3, a page margin, paper and caption colours, and optional fold/cut guides and edge tick marks.
- Export a 300 DPI JPG, a PNG, a PDF (optionally with each page on its own), a ZIP of the eight pages, or a numbered
  test sheet for a practice fold.
- Save your work as a project file and open it again later. It also autosaves in your browser.

## Your pictures stay on your device

Everything happens in your browser. Nothing is uploaded, there are no accounts, no analytics and no outside requests (the page's
Content Security Policy forbids them). Autosave uses your browser's own storage on your device only; "New project" erases it.
The feedback button opens a pre-filled GitHub issue in a new tab and includes only the app version and your browser details.

## Print and fold

1. Print the sheet at actual size (100%), landscape. Plain 24 lb / 90 gsm paper is a good choice.
2. Crease it into eight panels, cut the slit across the middle two, and push the ends together into a booklet.
   The page has step-by-step instructions, and a numbered test sheet so you can practise the fold first.

## Run your own copy

It is a static site with no build step. Put these files on any web server, or try it locally:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Offline use needs `https://` or `localhost` (it uses a service worker).

## Feedback

Use the Send feedback button in the app, or open an issue in this repository.
