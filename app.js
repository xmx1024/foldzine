'use strict';
// Fold Zine: everything runs in the browser. No network calls; see SECURITY-REVIEW.md.

// ---------- constants ----------
const N = 8;
const PAPER = { letter: [11, 8.5], a4: [11.69, 8.27], a3: [16.54, 11.69] };   // landscape inches
// sheet layout: 4 columns x 2 rows; the top row is printed upside down
const LAYOUT = [[5, 4, 3, 2], [6, 7, 8, 1]];
const MAX_PIXELS = 16000000;        // iOS Safari and some mobile browsers cap canvas area near 16.7 MP
const MAX_SIDE = 4096;              // photos are downscaled to this on load to save memory
const MAX_PROJECT_BYTES = 250 * 1024 * 1024;
const IMG_TYPES = /^image\/(jpeg|png|webp|gif|avif|bmp)$/;
const FONTS = { sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, Menlo, Consolas, monospace', hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' };
const SIZES = { s: 0.045, m: 0.065, l: 0.095, xl: 0.15 };      // text size as a fraction of the page height
const ALIGNS = ['left', 'center', 'right'];
const COLOR = /^#[0-9a-fA-F]{6}$/;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- state ----------
function newPanel() {
  return { mode: 'photo', blob: null, img: null, iw: 0, ih: 0, caption: '', fit: 'cover', zoom: 1, px: 0, py: 0, rot: 0,
           text: '', font: 'sans', size: 'm', align: 'center', pbg: null, pfg: null };
}
let panels = Array.from({ length: N }, newPanel);

function settings() {
  return { paper: $('paper').value, margin: $('margin').value, bg: $('bg').value, fg: $('fg').value, ticks: $('ticks').checked };
}
function opts() { const s = settings(); return { margin: parseFloat(s.margin), bg: s.bg, fg: s.fg, guides: $('guides').checked, ticks: s.ticks }; }

// ---------- drawing ----------
function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}
function captionLayout(ctx, w, h, p, o) {
  const m = o.margin * Math.min(w, h), fs = h * 0.034;
  let lines = [], capH = 0;
  if (p.mode === 'photo' && p.caption.trim()) {
    ctx.font = fs + 'px ' + FONTS.sans;
    lines = wrapText(ctx, p.caption.trim(), w - 2 * m - fs).slice(0, 4);
    capH = lines.length * fs * 1.3 + fs * 0.8;
  }
  return { m, fs, lines, capH, box: { x: m, y: m, w: w - 2 * m, h: h - 2 * m - capH } };
}
// how far the picture may be panned (in pixels) before it would leave a gap
function panLimits(box, p) {
  const swap = p.rot % 180 !== 0, ew = swap ? p.ih : p.iw, eh = swap ? p.iw : p.ih;
  if (!ew || !eh) return { x: 0, y: 0 };
  const s0 = p.fit === 'cover' ? Math.max(box.w / ew, box.h / eh) : Math.min(box.w / ew, box.h / eh), s = s0 * p.zoom;
  return { x: Math.max(0, (ew * s - box.w) / 2), y: Math.max(0, (eh * s - box.h) / 2), s };
}
function drawPhoto(ctx, box, p) {
  if (!p.img || box.w <= 0 || box.h <= 0) return;
  const lim = panLimits(box, p), ox = clamp(p.px * box.w, -lim.x, lim.x), oy = clamp(p.py * box.h, -lim.y, lim.y);
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  ctx.translate(box.x + box.w / 2 + ox, box.y + box.h / 2 + oy);
  ctx.rotate(p.rot * Math.PI / 180);
  ctx.drawImage(p.img, -p.iw * lim.s / 2, -p.ih * lim.s / 2, p.iw * lim.s, p.ih * lim.s);
  ctx.restore();
}
function drawTextPage(ctx, w, h, p, o) {
  const m = Math.max(o.margin, 0.05) * Math.min(w, h), maxW = w - 2 * m, maxH = h - 2 * m;
  let fs = h * SIZES[p.size], lines;
  for (;;) {                                         // shrink until the text fits the page
    ctx.font = fs + 'px ' + FONTS[p.font];
    lines = wrapText(ctx, p.text.trim(), maxW);
    if (lines.length * fs * 1.25 <= maxH || fs < h * 0.02) break;
    fs *= 0.92;
  }
  ctx.fillStyle = p.pfg || o.fg; ctx.textAlign = p.align; ctx.textBaseline = 'top';
  const x = p.align === 'left' ? m : p.align === 'right' ? w - m : w / 2;
  const top = m + Math.max(0, (maxH - lines.length * fs * 1.25) / 2);
  lines.slice(0, 40).forEach((l, i) => ctx.fillText(l, x, top + i * fs * 1.25));
}
function drawPanel(ctx, w, h, p, o) {
  ctx.save();
  ctx.fillStyle = p.pbg || o.bg; ctx.fillRect(0, 0, w, h);
  if (p.mode === 'text') { if (p.text.trim()) drawTextPage(ctx, w, h, p, o); ctx.restore(); return; }
  const L = captionLayout(ctx, w, h, p, o);
  drawPhoto(ctx, L.box, p);
  if (L.lines.length) {
    ctx.fillStyle = p.pfg || o.fg; ctx.font = L.fs + 'px ' + FONTS.sans; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    L.lines.forEach((l, i) => ctx.fillText(l, w / 2, h - L.m - L.capH + L.fs * 0.5 + i * L.fs * 1.3));
  }
  ctx.restore();
}
function drawSheet(ctx, W, H, o, pnls = panels) {
  const pw = W / 4, ph = H / 2;
  ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H);
  LAYOUT.forEach((row, r) => row.forEach((pageNo, c) => {
    ctx.save();
    ctx.translate(c * pw + pw / 2, r * ph + ph / 2);
    if (r === 0) ctx.rotate(Math.PI);
    ctx.translate(-pw / 2, -ph / 2);
    ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
    drawPanel(ctx, pw, ph, pnls[pageNo - 1], o);
    ctx.restore();
  }));
  const lw = Math.max(1, W / 1400);
  if (o.guides) {
    ctx.save(); ctx.lineWidth = lw; ctx.strokeStyle = '#999'; ctx.setLineDash([lw * 6, lw * 5]);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, H); }
    ctx.moveTo(0, ph); ctx.lineTo(W, ph); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = '#d6381f'; ctx.lineWidth = lw * 2.5;
    ctx.beginPath(); ctx.moveTo(pw, ph); ctx.lineTo(3 * pw, ph); ctx.stroke();   // cut slit across the middle two panels
    ctx.restore();
  }
  if (o.ticks) {                       // short marks on the paper edge at every fold line (and the slit ends)
    const t = Math.min(pw, ph) * 0.05;
    ctx.save(); ctx.lineWidth = lw * 1.5; ctx.strokeStyle = '#555'; ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, t); ctx.moveTo(i * pw, H); ctx.lineTo(i * pw, H - t); }
    ctx.moveTo(0, ph); ctx.lineTo(t, ph); ctx.moveTo(W, ph); ctx.lineTo(W - t, ph); ctx.stroke();
    ctx.strokeStyle = '#d6381f'; ctx.beginPath(); ctx.moveTo(pw - t, ph); ctx.lineTo(pw + t, ph); ctx.moveTo(3 * pw - t, ph); ctx.lineTo(3 * pw + t, ph); ctx.stroke();
    ctx.restore();
  }
}
// numbered sheet for a dry-run fold
function testPanels() {
  const tint = ['#fde2e2', '#fdeccf', '#fbf5c4', '#dff5d2', '#d2f0f0', '#d6e4fb', '#e6d9f8', '#f8d9ee'];
  return tint.map((c, i) => ({ ...newPanel(), mode: 'text', pbg: c, pfg: '#111111', size: 'xl', font: 'sans',
    text: String(i + 1) + '\n' + (i === 0 ? 'FRONT' : i === 7 ? 'BACK' : 'page') }));
}

// ---------- images ----------
function decode(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read the picture')); };
    im.src = url;
  });
}
const toBlob = (cv, type, q) => new Promise(r => cv.toBlob(r, type, q));
async function prepareImage(file) {                // returns {blob, img, iw, ih}; validates the type, downsizes huge photos
  if (!IMG_TYPES.test(file.type)) throw new Error('Unsupported file type: ' + (file.type || 'unknown') + ' (use JPG, PNG, WebP, GIF, AVIF or BMP)');
  const im = await decode(file), w = im.naturalWidth, h = im.naturalHeight;
  if (!w || !h) throw new Error('Could not read ' + (file.name || 'the picture'));
  if (Math.max(w, h) <= MAX_SIDE) return { blob: file, img: im, iw: w, ih: h };
  const k = MAX_SIDE / Math.max(w, h), cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height);
  const blob = await toBlob(cv, 'image/jpeg', 0.92);
  if (!blob) throw new Error('Not enough memory to shrink that picture');
  return { blob, img: cv, iw: cv.width, ih: cv.height };
}
async function setPhoto(p, file) { const r = await prepareImage(file); Object.assign(p, r, { mode: 'photo', zoom: 1, px: 0, py: 0, rot: 0 }); }

// ---------- UI: page cards ----------
const grid = $('grid');
let dragFrom = null;
function panelAspect() { const [w, h] = PAPER[$('paper').value] || PAPER.letter; return (w / 4) / (h / 2); }
function sheetSize(dpi) {
  const [w, h] = PAPER[$('paper').value] || PAPER.letter;
  let k = dpi; while (Math.round(w * k) * Math.round(h * k) > MAX_PIXELS && k > 72) k -= 5;   // lower the DPI rather than fail on big paper
  return [Math.round(w * k), Math.round(h * k)];
}
function pageLabel(i) { return 'Page ' + (i + 1) + (i === 0 ? ' (front cover)' : i === 7 ? ' (back cover)' : ''); }
const roleOf = i => i === 0 ? 'Cover' : i === 7 ? 'Back' : 'Inside';
const isFilled = p => p.mode === 'text' ? !!p.text.trim() : !!(p.img || p.caption.trim());
function buildGrid(focus) {
  grid.innerHTML = '';
  const asp = panelAspect();
  panels.forEach((p, i) => {
    const card = document.createElement('div'); card.className = 'card'; card.dataset.i = i;
    card.innerHTML = `<div class="top"><span class="lbl"></span><span class="handle" draggable="true" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span></div>
      <button type="button" class="thumbbtn"><canvas class="thumb" width="300"></canvas></button>
      <div class="row"><button type="button" class="small mv l" title="Move earlier">&#9664;</button><button type="button" class="small ed" title="Edit this page">&#9998;</button><button type="button" class="small mv r" title="Move later">&#9654;</button><button type="button" class="small rm" title="Clear this page">&#10005;</button></div>`;
    const cv = card.querySelector('.thumb'); cv.height = Math.round(300 / asp);
    const lbl = card.querySelector('.lbl'); lbl.textContent = 'Page ' + (i + 1); const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = roleOf(i); lbl.appendChild(chip);
    const tb = card.querySelector('.thumbbtn'); tb.setAttribute('aria-label', 'Edit ' + pageLabel(i));
    tb.addEventListener('click', () => openEditor(i));
    const ed = card.querySelector('.ed'); ed.setAttribute('aria-label', 'Edit ' + pageLabel(i)); ed.addEventListener('click', () => openEditor(i));
    const l = card.querySelector('.l'), r = card.querySelector('.r');
    l.setAttribute('aria-label', 'Move ' + pageLabel(i) + ' earlier'); r.setAttribute('aria-label', 'Move ' + pageLabel(i) + ' later');
    l.disabled = i === 0; r.disabled = i === N - 1;
    l.addEventListener('click', () => movePanel(i, -1)); r.addEventListener('click', () => movePanel(i, 1));
    const rm = card.querySelector('.rm'); rm.setAttribute('aria-label', 'Clear ' + pageLabel(i));
    rm.addEventListener('click', () => { panels[i] = newPanel(); refresh(i); changed(); });
    const h = card.querySelector('.handle');
    h.addEventListener('dragstart', e => { dragFrom = i; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'p' + i); e.dataTransfer.setDragImage(card, 20, 20); });
    h.addEventListener('dragend', () => { dragFrom = null; card.classList.remove('dragging'); document.querySelectorAll('.card.over').forEach(c => c.classList.remove('over')); });
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('over'); });
    card.addEventListener('dragleave', () => card.classList.remove('over'));
    card.addEventListener('drop', e => {
      e.preventDefault(); card.classList.remove('over');
      const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));     // type is re-checked in prepareImage
      e.stopPropagation();
      if (files.length) { loadInto(i, files); return; }
      if (dragFrom !== null && dragFrom !== i) { [panels[dragFrom], panels[i]] = [panels[i], panels[dragFrom]]; buildGrid(); refresh(); changed(); }
    });
    grid.appendChild(card);
  });
  refresh();
  if (focus) grid.children[focus.i]?.querySelector(focus.sel)?.focus();
}
function movePanel(i, d) {
  const j = i + d; if (j < 0 || j >= N) return;
  [panels[i], panels[j]] = [panels[j], panels[i]];
  buildGrid({ i: j, sel: d < 0 ? '.l' : '.r' }); changed();
  status('Moved to page ' + (j + 1));
}
function drawThumb(i) {
  const cv = grid.children[i]?.querySelector('.thumb'); if (!cv) return;
  const o = opts(), ctx = cv.getContext('2d'), p = panels[i], filled = isFilled(p);
  drawPanel(ctx, cv.width, cv.height, p, o);
  grid.children[i].classList.toggle('empty', !filled);
  if (!filled) {                                      // friendly empty state
    const cx = cv.width / 2, cy = cv.height / 2 - 14, r = cv.width * 0.11;
    ctx.save(); ctx.strokeStyle = '#9b9585'; ctx.fillStyle = '#9b9585'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r / 2, cy); ctx.lineTo(cx + r / 2, cy); ctx.moveTo(cx, cy - r / 2); ctx.lineTo(cx, cy + r / 2); ctx.stroke();
    ctx.font = '600 ' + Math.round(cv.width * 0.06) + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Add a picture', cx, cy + r + 30); ctx.font = Math.round(cv.width * 0.048) + 'px system-ui, sans-serif'; ctx.fillText('or click to write text', cx, cy + r + 56); ctx.restore();
  }
}
let raf = 0;
function refresh(i) {
  if (typeof i === 'number') drawThumb(i); else for (let k = 0; k < N; k++) drawThumb(k);
  const n = panels.filter(isFilled).length;
  $('progText').textContent = n + ' of ' + N + ' pages filled'; $('progBar').style.width = (n / N * 100) + '%';
  schedulePreview();
}
function schedulePreview() { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawPreview); }
const pv = { hover: 0, from: 0, over: 0, down: null };     // page numbers (1-8) for the interactive preview
function drawPreview() {
  const cv = $('preview'), [pwIn, phIn] = PAPER[$('paper').value] || PAPER.letter, wrap = cv.parentElement, ratio = pwIn / phIn;
  const sideBySide = window.matchMedia('(min-width:1000px) and (min-height:620px)').matches;
  const availW = Math.max(200, wrap.clientWidth || 800), availH = sideBySide ? Math.max(150, wrap.clientHeight) : Infinity;
  const cssW = Math.floor(Math.min(availW, availH * ratio)), cssH = Math.floor(cssW / ratio), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.min(2600, Math.round(cssW * dpr)), H = Math.round(W / ratio);
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; cv.dataset.ready = '1';
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); drawSheet(ctx, W, H, { ...opts(), guides: true });
  const cw = W / 4, ch = H / 2, rad = Math.max(12, W * 0.016);
  LAYOUT.forEach((row, r) => row.forEach((page, c) => {
    const x = c * cw, y = r * ch;
    if (pv.from === page) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y, cw, ch); }
    if (pv.over === page && pv.from && pv.from !== page) { ctx.fillStyle = 'rgba(214,56,31,.28)'; ctx.fillRect(x, y, cw, ch); ctx.strokeStyle = '#d6381f'; ctx.lineWidth = Math.max(3, W / 400); ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4); }
    else if (pv.hover === page && !pv.from) { ctx.fillStyle = 'rgba(214,56,31,.14)'; ctx.fillRect(x, y, cw, ch); ctx.strokeStyle = '#d6381f'; ctx.lineWidth = Math.max(2, W / 600); ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4); }
    const bx = x + rad + 8, by = y + rad + 8;                  // page-number badge (always upright)
    ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.fillStyle = pv.hover === page ? '#d6381f' : 'rgba(17,17,17,.78)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(rad * 1.15) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(page), bx, by + 1);
    if (pv.hover === page && !pv.from) { ctx.font = '600 ' + Math.round(rad * 0.85) + 'px system-ui, sans-serif'; ctx.fillStyle = 'rgba(17,17,17,.85)'; ctx.fillText('Click to edit, drag to swap', x + cw / 2, y + ch - rad); }
  }));
}
function previewCell(e) {
  const rc = $('preview').getBoundingClientRect(), c = clamp(Math.floor((e.clientX - rc.left) / rc.width * 4), 0, 3), r = clamp(Math.floor((e.clientY - rc.top) / rc.height * 2), 0, 1);
  return LAYOUT[r][c];
}
(() => {
  const cv = $('preview');
  cv.addEventListener('pointerdown', e => { pv.down = { page: previewCell(e), x: e.clientX, y: e.clientY, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    const page = previewCell(e);
    if (pv.down) {
      if (!pv.down.moved && Math.hypot(e.clientX - pv.down.x, e.clientY - pv.down.y) > 8) { pv.down.moved = true; pv.from = pv.down.page; }
      pv.over = page;
    }
    pv.hover = page; schedulePreview();
  });
  cv.addEventListener('pointerup', e => {
    const d = pv.down, over = previewCell(e); pv.down = null; const from = pv.from; pv.from = pv.over = 0;
    if (d && d.moved && from && over && from !== over) {
      const a = from - 1, b = over - 1; [panels[a], panels[b]] = [panels[b], panels[a]]; buildGrid(); changed(); status('Swapped page ' + from + ' and page ' + over);
    } else if (d && !d.moved) openEditor(d.page - 1);
    schedulePreview();
  });
  cv.addEventListener('pointercancel', () => { pv.down = null; pv.from = pv.over = 0; schedulePreview(); });
  cv.addEventListener('pointerleave', () => { if (!pv.down) { pv.hover = 0; schedulePreview(); } });
  if ('ResizeObserver' in window) new ResizeObserver(() => schedulePreview()).observe(cv.parentElement);
  window.addEventListener('resize', schedulePreview);
})();
let statusTimer = 0;
function status(t) { $('status').textContent = t; clearTimeout(statusTimer); if (t) statusTimer = setTimeout(() => { $('status').textContent = ''; }, 12000); }

async function loadInto(start, files) {
  let k = start, failed = 0;
  for (const f of files) {
    if (k >= N) break;
    try { await setPhoto(panels[k], f); refresh(k); k++; } catch (e) { failed++; status(e.message); }
  }
  refresh(); changed();
  if (!failed && files.length > N - start) status('Only ' + (N - start) + ' pages were free; the rest were skipped.');
}
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
grid.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); grid.classList.add('filedrop'); } });
grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) grid.classList.remove('filedrop'); });
grid.addEventListener('drop', e => {
  grid.classList.remove('filedrop'); const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return; e.preventDefault();
  let first = panels.findIndex(p => !isFilled(p)); if (first < 0) first = 0; loadInto(first, files);
});
['dragover', 'drop'].forEach(t => window.addEventListener(t, e => { if (hasFiles(e)) e.preventDefault(); }));   // a missed drop must not open the file in the tab
$('file').addEventListener('change', e => {
  const files = [...e.target.files]; if (!files.length) return;
  let first = panels.findIndex(p => !isFilled(p)); if (first < 0) first = 0;
  loadInto(first, files);
});
$('addBtn').addEventListener('click', () => { $('file').value = ''; $('file').click(); });
let clearArmed = 0;
$('clearBtn').addEventListener('click', e => {
  if (!clearArmed) { e.target.textContent = 'Click again to clear everything'; clearArmed = setTimeout(() => { clearArmed = 0; e.target.textContent = 'New project'; }, 4000); return; }
  clearTimeout(clearArmed); clearArmed = 0; e.target.textContent = 'New project';
  panels = Array.from({ length: N }, newPanel); buildGrid(); changed(); status('Cleared. Your previous work is no longer saved in this browser.');
});
['paper', 'margin', 'bg', 'fg', 'guides', 'ticks', 'singles'].forEach(id => $(id).addEventListener('input', () => {
  if (id === 'paper') buildGrid(); else refresh();
  changed();
}));

// ---------- editor dialog ----------
const ed = { dlg: $('editor'), cv: $('edCanvas'), i: 0, drag: null };
function P() { return panels[ed.i]; }
function openEditor(i) {
  ed.i = i; const p = P();
  $('edTitle').textContent = 'Edit ' + pageLabel(i);
  syncEditor(); ed.dlg.showModal(); (p.mode === 'text' ? $('edText') : $('edPick')).focus();
}
function syncEditor() {
  const p = P(), asp = panelAspect();
  ed.cv.width = 360; ed.cv.height = Math.round(360 / asp);
  $('modePhoto').checked = p.mode === 'photo'; $('modeText').checked = p.mode === 'text';
  $('photoCtl').hidden = p.mode !== 'photo'; $('textCtl').hidden = p.mode !== 'text';
  $('fitFill').checked = p.fit === 'cover'; $('fitWhole').checked = p.fit === 'contain';
  $('edZoom').value = p.zoom; $('edCaption').value = p.caption;
  $('edText').value = p.text; $('edFont').value = p.font; $('edSize').value = p.size; $('edAlign').value = p.align;
  $('edPbg').value = p.pbg || $('bg').value; $('edPfg').value = p.pfg || $('fg').value;
  drawEditor();
}
function drawEditor() { const ctx = ed.cv.getContext('2d'); drawPanel(ctx, ed.cv.width, ed.cv.height, P(), opts()); refresh(ed.i); }
function edChanged() { drawEditor(); changed(); }
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { P().mode = r.value; syncEditor(); changed(); }));
document.querySelectorAll('input[name=fit]').forEach(r => r.addEventListener('change', () => { P().fit = r.value; P().px = P().py = 0; edChanged(); }));
$('edZoom').addEventListener('input', e => { P().zoom = clamp(parseFloat(e.target.value) || 1, 1, 4); edChanged(); });
$('edRot').addEventListener('click', () => { const p = P(); p.rot = (p.rot + 90) % 360; p.px = p.py = 0; edChanged(); });
$('edReset').addEventListener('click', () => { const p = P(); p.zoom = 1; p.px = p.py = 0; p.rot = 0; $('edZoom').value = 1; edChanged(); });
$('edCaption').addEventListener('input', e => { P().caption = e.target.value.slice(0, 200); edChanged(); });
$('edText').addEventListener('input', e => { P().text = e.target.value.slice(0, 1500); edChanged(); });
$('edFont').addEventListener('input', e => { if (FONTS[e.target.value]) P().font = e.target.value; edChanged(); });
$('edSize').addEventListener('input', e => { if (SIZES[e.target.value]) P().size = e.target.value; edChanged(); });
$('edAlign').addEventListener('input', e => { if (ALIGNS.includes(e.target.value)) P().align = e.target.value; edChanged(); });
$('edPbg').addEventListener('input', e => { P().pbg = COLOR.test(e.target.value) ? e.target.value : null; edChanged(); });
$('edPfg').addEventListener('input', e => { P().pfg = COLOR.test(e.target.value) ? e.target.value : null; edChanged(); });
$('edColorReset').addEventListener('click', () => { P().pbg = P().pfg = null; syncEditor(); changed(); });
$('edPick').addEventListener('click', () => { $('fileOne').value = ''; $('fileOne').click(); });
$('fileOne').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { await setPhoto(P(), f); syncEditor(); changed(); } catch (err) { status(err.message); }
});
$('edDone').addEventListener('click', () => ed.dlg.close());
ed.dlg.addEventListener('close', () => { refresh(ed.i); grid.children[ed.i]?.querySelector('.thumbbtn')?.focus(); });
// drag to pan, wheel to zoom, arrow keys to nudge
function boxNow() { return captionLayout(ed.cv.getContext('2d'), ed.cv.width, ed.cv.height, P(), opts()).box; }
function pan(dx, dy) {                    // dx, dy in canvas pixels
  const p = P(), box = boxNow(), lim = panLimits(box, p);
  p.px = clamp(p.px + dx / box.w, -lim.x / box.w, lim.x / box.w); p.py = clamp(p.py + dy / box.h, -lim.y / box.h, lim.y / box.h);
  edChanged();
}
ed.cv.addEventListener('pointerdown', e => { if (P().mode !== 'photo') return; ed.drag = { x: e.clientX, y: e.clientY }; ed.cv.setPointerCapture(e.pointerId); });
ed.cv.addEventListener('pointermove', e => {
  if (!ed.drag) return; const k = ed.cv.width / ed.cv.getBoundingClientRect().width;
  pan((e.clientX - ed.drag.x) * k, (e.clientY - ed.drag.y) * k); ed.drag = { x: e.clientX, y: e.clientY };
});
['pointerup', 'pointercancel'].forEach(ev => ed.cv.addEventListener(ev, () => { ed.drag = null; }));
ed.cv.addEventListener('wheel', e => { if (P().mode !== 'photo') return; e.preventDefault(); const p = P(); p.zoom = clamp(p.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 4); $('edZoom').value = p.zoom; edChanged(); }, { passive: false });
ed.cv.addEventListener('keydown', e => {
  const d = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
  if (d && P().mode === 'photo') { e.preventDefault(); pan(d[0], d[1]); }
});

// ---------- autosave (IndexedDB, this browser only) and project files ----------
const DB = { open() { return new Promise((res, rej) => { const r = indexedDB.open('foldzine', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); } };
let saveTimer = 0, saveOk = true;
function changed() { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 700); }
function cleanPanel(o) {              // accept only known fields with valid values (used for saved work and imported files)
  const p = newPanel(); if (!o || typeof o !== 'object') return p;
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const num = (v, a, b, d) => typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : d;
  p.mode = o.mode === 'text' ? 'text' : 'photo';
  p.caption = str(o.caption, 200); p.text = str(o.text, 1500);
  p.fit = o.fit === 'contain' ? 'contain' : 'cover';
  p.zoom = num(o.zoom, 1, 4, 1); p.px = num(o.px, -2, 2, 0); p.py = num(o.py, -2, 2, 0);
  p.rot = [0, 90, 180, 270].includes(o.rot) ? o.rot : 0;
  p.font = FONTS[o.font] ? o.font : 'sans'; p.size = SIZES[o.size] ? o.size : 'm'; p.align = ALIGNS.includes(o.align) ? o.align : 'center';
  p.pbg = COLOR.test(o.pbg) ? o.pbg : null; p.pfg = COLOR.test(o.pfg) ? o.pfg : null;
  return p;
}
function cleanSettings(s) {
  const out = {}; if (!s || typeof s !== 'object') return out;
  for (const k of ['paper', 'margin']) { const el = $(k); if (typeof s[k] === 'string' && [...el.options].some(o => o.value === s[k])) out[k] = s[k]; }
  for (const k of ['bg', 'fg']) if (COLOR.test(s[k])) out[k] = s[k];
  if (typeof s.ticks === 'boolean') out.ticks = s.ticks;
  return out;
}
function applySettings(s) { for (const [k, v] of Object.entries(s)) { if (k === 'ticks') $('ticks').checked = v; else $(k).value = v; } }
async function autosave() {
  try {
    await DB.set('project', { v: 1, settings: settings(), panels: panels.map(p => ({ ...p, img: undefined, blob: p.blob || null })) });
    if (!saveOk) { saveOk = true; status(''); }
  } catch (e) { if (saveOk) { saveOk = false; status('Autosave is unavailable in this browser (private mode?). Use Save project to keep your work.'); } }
}
async function restore() {
  let rec; try { rec = await DB.get('project'); } catch (_) { return; }
  if (!rec || rec.v !== 1 || !Array.isArray(rec.panels)) return;
  applySettings(cleanSettings(rec.settings));
  const next = [];
  for (let i = 0; i < N; i++) {
    const raw = rec.panels[i], p = cleanPanel(raw);
    if (raw && raw.blob instanceof Blob && IMG_TYPES.test(raw.blob.type)) { try { const r = await prepareImage(raw.blob); Object.assign(p, r); } catch (_) {} }
    next.push(p);
  }
  panels = next; buildGrid();
}
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
$('saveProj').addEventListener('click', async () => {
  status('Saving…');
  const out = { app: 'foldzine', version: 1, settings: settings(), panels: [] };
  for (const p of panels) { const { img, blob, iw, ih, ...rest } = p; out.panels.push({ ...rest, image: blob ? await blobToDataURL(blob) : null }); }
  download(new Blob([JSON.stringify(out)], { type: 'application/json' }), 'zine-project.json'); status('Saved zine-project.json');
});
$('openProj').addEventListener('click', () => { $('projFile').value = ''; $('projFile').click(); });
$('projFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    if (f.size > MAX_PROJECT_BYTES) throw new Error('That file is too large to be a zine project.');
    const j = JSON.parse(await f.text());
    if (!j || j.app !== 'foldzine' || j.version !== 1 || !Array.isArray(j.panels)) throw new Error('That is not a Fold Zine project file.');
    const next = []; let skipped = 0;
    for (let i = 0; i < N; i++) {
      const raw = j.panels[i], p = cleanPanel(raw);
      const m = raw && typeof raw.image === 'string' && /^data:(image\/(?:jpeg|png|webp|gif|avif|bmp));base64,([A-Za-z0-9+/=]+)$/.exec(raw.image);
      if (m) {
        try { const bin = atob(m[2]), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); Object.assign(p, await prepareImage(new Blob([u], { type: m[1] }))); }
        catch (_) { skipped++; }
      } else if (raw && raw.image) skipped++;        // an image in an unsupported or malformed format is dropped, never loaded
      next.push(p);
    }
    applySettings(cleanSettings(j.settings)); panels = next; buildGrid(); changed();
    status('Opened ' + f.name + (skipped ? ' (' + skipped + ' picture' + (skipped > 1 ? 's' : '') + ' skipped: unsupported format)' : ''));
  } catch (err) { status(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message); }
});

// ---------- export ----------
async function stamp(blob, dpi) {         // stamp the real DPI into the JFIF header so print tools size the JPG correctly
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[2] === 0xFF && b[3] === 0xE0 && b[6] === 0x4A && b[7] === 0x46) { b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255; }
  return new Blob([b], { type: 'image/jpeg' });
}
const dpiOf = cv => Math.round(cv.width / (PAPER[$('paper').value] || PAPER.letter)[0]);
async function renderSheet(pnls = panels) {
  const [W, H] = sheetSize(300), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  drawSheet(cv.getContext('2d'), W, H, opts(), pnls); return cv;
}
async function renderPage(i, pnls = panels) {
  const [W, H] = sheetSize(300), cv = document.createElement('canvas'); cv.width = Math.round(W / 4); cv.height = Math.round(H / 2);
  drawPanel(cv.getContext('2d'), cv.width, cv.height, pnls[i], opts()); return cv;
}
$('jpg').addEventListener('click', async () => {
  status('Rendering…'); const cv = await renderSheet(), blob = await toBlob(cv, 'image/jpeg', 0.95);
  if (!blob) return status('Could not create the image (out of memory?). Try a smaller paper size.');
  download(await stamp(blob, dpiOf(cv)), 'zine-sheet.jpg'); status('Saved zine-sheet.jpg (' + dpiOf(cv) + ' DPI)');
});
$('png').addEventListener('click', async () => {
  status('Rendering…'); const cv = await renderSheet(), blob = await toBlob(cv, 'image/png');
  if (!blob) return status('Could not create the image (out of memory?). Try a smaller paper size.');
  download(blob, 'zine-sheet.png'); status('Saved zine-sheet.png');
});
// minimal PDF writer: one JPEG per page
function buildPDF(pages) {                // pages: [{wPt,hPt,wPx,hPx,jpeg:Uint8Array}]
  const enc = new TextEncoder(), parts = [], offs = []; let pos = 0;
  const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; };
  const obj = (id, body) => { offs[id] = pos; put(id + ' 0 obj\n'); body(); put('\nendobj\n'); };
  put('%PDF-1.4\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] >>'));
  pages.forEach((p, i) => {
    const pg = 3 + 3 * i, ct = pg + 1, im = pg + 2;
    obj(pg, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.wPt.toFixed(2)} ${p.hPt.toFixed(2)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    const c = `q ${p.wPt.toFixed(2)} 0 0 ${p.hPt.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(ct, () => put(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`));
    obj(im, () => { put(`<< /Type /XObject /Subtype /Image /Width ${p.wPx} /Height ${p.hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`); put(p.jpeg); put('\nendstream'); });
  });
  const n = 3 + 3 * pages.length, xref = pos;
  put('xref\n0 ' + n + '\n0000000000 65535 f \n');
  for (let i = 1; i < n; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function pdfPage(cv, wIn, hIn) {
  const b = await toBlob(cv, 'image/jpeg', 0.92); if (!b) throw new Error('Out of memory while building the PDF');
  return { wPt: wIn * 72, hPt: hIn * 72, wPx: cv.width, hPx: cv.height, jpeg: new Uint8Array(await b.arrayBuffer()) };
}
async function makePDF(pnls, withSingles) {
  const [inW, inH] = PAPER[$('paper').value] || PAPER.letter, pages = [await pdfPage(await renderSheet(pnls), inW, inH)];
  if (withSingles) for (let i = 0; i < N; i++) pages.push(await pdfPage(await renderPage(i, pnls), inW / 4, inH / 2));
  return { blob: buildPDF(pages), count: pages.length };
}
$('pdf').addEventListener('click', async () => {
  status('Rendering…');
  try { const r = await makePDF(panels, $('singles').checked); download(r.blob, 'zine.pdf'); status('Saved zine.pdf (' + r.count + ' page' + (r.count > 1 ? 's' : '') + ')'); }
  catch (e) { status(e.message); }
});
$('testSheet').addEventListener('click', async () => {
  status('Rendering…');
  try { const r = await makePDF(testPanels(), false); download(r.blob, 'zine-fold-test.pdf'); status('Saved zine-fold-test.pdf: print it and fold it before printing your own.'); }
  catch (e) { status(e.message); }
});
// store-only ZIP writer (no compression; the pages are already JPEGs)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {                 // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length;
  }
  const csize = central.reduce((s, b) => s + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
$('zip').addEventListener('click', async () => {
  status('Rendering…');
  try {
    const files = [];
    for (let i = 0; i < N; i++) {
      const cv = await renderPage(i), b = await toBlob(cv, 'image/jpeg', 0.95); if (!b) throw new Error('Out of memory while building the pages');
      files.push({ name: 'page-' + (i + 1) + '.jpg', data: new Uint8Array(await (await stamp(b, dpiOf(cv))).arrayBuffer()) });
    }
    download(makeZip(files), 'zine-pages.zip'); status('Saved zine-pages.zip (8 pictures, one per page, upright)');
  } catch (e) { status(e.message); }
});

// ---------- start ----------
buildGrid();
restore();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
