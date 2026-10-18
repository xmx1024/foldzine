'use strict';
// ---------- state ----------
const N = 8;
const PAPER = { letter: [11, 8.5], a4: [11.69, 8.27], a3: [16.54, 11.69] };   // landscape inches
// sheet layout: 4 columns x 2 rows; top row is printed upside down
const LAYOUT = [[5, 4, 3, 2], [6, 7, 8, 1]];
const panels = Array.from({ length: N }, () => ({ img: null, caption: '', fit: 'cover' }));
const $ = id => document.getElementById(id);
const opts = () => ({ margin: parseFloat($('margin').value), bg: $('bg').value, fg: $('fg').value, guides: $('guides').checked });

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
function drawPanel(ctx, w, h, p, o) {
  ctx.save();
  ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h);
  const m = o.margin * Math.min(w, h);
  const fs = h * 0.034;
  let capLines = [], capH = 0;
  if (p.caption.trim()) {
    ctx.font = fs + 'px system-ui, sans-serif';
    capLines = wrapText(ctx, p.caption.trim(), w - 2 * m - fs).slice(0, 4);
    capH = capLines.length * fs * 1.3 + fs * 0.8;
  }
  const box = { x: m, y: m, w: w - 2 * m, h: h - 2 * m - capH };
  if (p.img && box.w > 0 && box.h > 0) {
    const iw = p.img.naturalWidth, ih = p.img.naturalHeight;
    const s = p.fit === 'cover' ? Math.max(box.w / iw, box.h / ih) : Math.min(box.w / iw, box.h / ih);
    const dw = iw * s, dh = ih * s;
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    ctx.drawImage(p.img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
    ctx.restore();
  }
  if (capLines.length) {
    ctx.fillStyle = o.fg; ctx.font = fs + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    capLines.forEach((l, i) => ctx.fillText(l, w / 2, h - m - capH + fs * 0.5 + i * fs * 1.3));
  }
  ctx.restore();
}
function drawSheet(ctx, W, H, o) {
  const pw = W / 4, ph = H / 2;
  ctx.fillStyle = o.bg; ctx.fillRect(0, 0, W, H);
  LAYOUT.forEach((row, r) => row.forEach((pageNo, c) => {
    ctx.save();
    ctx.translate(c * pw + pw / 2, r * ph + ph / 2);
    if (r === 0) ctx.rotate(Math.PI);
    ctx.translate(-pw / 2, -ph / 2);
    ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
    drawPanel(ctx, pw, ph, panels[pageNo - 1], o);
    ctx.restore();
  }));
  if (o.guides) {
    const lw = Math.max(1, W / 1400);
    ctx.save(); ctx.lineWidth = lw; ctx.strokeStyle = '#999'; ctx.setLineDash([lw * 6, lw * 5]);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(i * pw, 0); ctx.lineTo(i * pw, H); }
    ctx.moveTo(0, ph); ctx.lineTo(W, ph); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = '#d6381f'; ctx.lineWidth = lw * 2.5;
    ctx.beginPath(); ctx.moveTo(pw, ph); ctx.lineTo(3 * pw, ph); ctx.stroke();   // cut slit across the middle two panels
    ctx.restore();
  }
}

// ---------- UI ----------
const grid = $('grid');
let dragFrom = null;
function buildGrid() {
  grid.innerHTML = '';
  panels.forEach((p, i) => {
    const card = document.createElement('div'); card.className = 'card'; card.dataset.i = i;
    card.innerHTML = `<div class="top"><span>Page ${i + 1}${i === 0 ? ' (cover)' : i === 7 ? ' (back)' : ''}</span>
      <span class="handle" draggable="true" title="Drag to reorder">&#8942;&#8942;</span></div>
      <canvas class="thumb" width="220" height="340"></canvas>
      <textarea placeholder="Caption" maxlength="200"></textarea>
      <div class="row"><button class="small fit">${p.fit === 'cover' ? 'Fill' : 'Fit'}</button><button class="small rm">Remove</button></div>`;
    const ta = card.querySelector('textarea'); ta.value = p.caption;
    ta.addEventListener('input', () => { p.caption = ta.value; refresh(i); });
    card.querySelector('.thumb').addEventListener('click', () => pick(i));
    card.querySelector('.fit').addEventListener('click', e => { p.fit = p.fit === 'cover' ? 'contain' : 'cover'; e.target.textContent = p.fit === 'cover' ? 'Fill' : 'Fit'; refresh(i); });
    card.querySelector('.rm').addEventListener('click', () => { p.img = null; refresh(i); });
    const h = card.querySelector('.handle');
    h.addEventListener('dragstart', e => { dragFrom = i; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'p' + i); e.dataTransfer.setDragImage(card, 20, 20); });
    h.addEventListener('dragend', () => { dragFrom = null; card.classList.remove('dragging'); document.querySelectorAll('.card.over').forEach(c => c.classList.remove('over')); });
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('over'); });
    card.addEventListener('dragleave', () => card.classList.remove('over'));
    card.addEventListener('drop', e => {
      e.preventDefault(); card.classList.remove('over');
      const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));  // type is re-checked in loadImage
      if (files.length) { loadInto(i, files); return; }
      if (dragFrom !== null && dragFrom !== i) { [panels[dragFrom], panels[i]] = [panels[i], panels[dragFrom]]; buildGrid(); refresh(); }
    });
    grid.appendChild(card);
  });
  refresh();
}
function drawThumb(i) {
  const cv = grid.children[i]?.querySelector('.thumb'); if (!cv) return;
  const o = opts(), ctx = cv.getContext('2d');
  drawPanel(ctx, cv.width, cv.height, panels[i], o);
  if (!panels[i].img && !panels[i].caption.trim()) {
    ctx.fillStyle = '#9b9585'; ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('+ add picture', cv.width / 2, cv.height / 2);
  }
}
let raf = 0;
function refresh(i) {
  if (typeof i === 'number') drawThumb(i); else for (let k = 0; k < N; k++) drawThumb(k);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(drawPreview);
}
const MAX_PIXELS = 16000000;   // iOS Safari and some mobile browsers cap canvas area near 16.7 MP
function sheetSize(dpi) {
  const [w, h] = PAPER[$('paper').value] || PAPER.letter;
  let k = dpi; while (Math.round(w * k) * Math.round(h * k) > MAX_PIXELS && k > 72) k -= 5;   // lower the DPI rather than fail on big paper
  return [Math.round(w * k), Math.round(h * k)];
}
function drawPreview() {
  const cv = $('preview'); const [W, H] = sheetSize(100);
  cv.width = W; cv.height = H; drawSheet(cv.getContext('2d'), W, H, { ...opts(), guides: true });
}
function pick(i) { pickIndex = i; $('fileOne').value = ''; $('fileOne').click(); }
let pickIndex = 0;
function loadImage(file) {
  return new Promise((res, rej) => {
    if (!/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(file.type)) return rej(new Error('Unsupported file type: ' + (file.type || 'unknown') + ' (use JPG, PNG, WebP, GIF, AVIF or BMP)'));
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read ' + file.name)); };
    im.src = url;
  });
}
async function loadInto(start, files) {
  let k = start;
  for (const f of files) {
    if (k >= N) break;
    try { panels[k].img = await loadImage(f); refresh(k); k++; } catch (e) { status(e.message); }
  }
  refresh();
}
$('fileOne').addEventListener('change', e => { if (e.target.files.length) loadInto(pickIndex, [e.target.files[0]]); });
$('addBtn').addEventListener('click', () => { $('file').value = ''; $('file').click(); });
$('file').addEventListener('change', e => {
  const files = [...e.target.files]; if (!files.length) return;
  let first = panels.findIndex(p => !p.img); if (first < 0) first = 0;
  loadInto(first, files);
});
$('clearBtn').addEventListener('click', () => { panels.forEach(p => { p.img = null; p.caption = ''; p.fit = 'cover'; }); buildGrid(); });
['paper', 'margin', 'bg', 'fg', 'guides'].forEach(id => $(id).addEventListener('input', () => { refresh(); try { localStorage.setItem('foldzine', JSON.stringify({ paper: $('paper').value, margin: $('margin').value, bg: $('bg').value, fg: $('fg').value })); } catch (_) {} }));
// restore saved settings, accepting only values the controls actually offer (guards against tampered storage)
try {
  const s = JSON.parse(localStorage.getItem('foldzine') || 'null');
  if (s && typeof s === 'object') for (const k of ['paper', 'margin', 'bg', 'fg']) {
    const el = $(k), v = typeof s[k] === 'string' ? s[k] : '';
    if (el.tagName === 'SELECT' ? [...el.options].some(o => o.value === v) : /^#[0-9a-fA-F]{6}$/.test(v)) el.value = v;
  }
} catch (_) {}
function status(t) { $('status').textContent = t; }

// ---------- export ----------
const blobOf = (cv, type, q) => new Promise(r => cv.toBlob(r, type, q));
// stamp 300 DPI into the JFIF header so print tools size the image correctly
async function withDpi(blob, dpi = 300) {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[2] === 0xFF && b[3] === 0xE0 && b[6] === 0x4A && b[7] === 0x46) { b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255; }
  return new Blob([b], { type: 'image/jpeg' });
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function renderSheet() {
  const [W, H] = sheetSize(300), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  drawSheet(cv.getContext('2d'), W, H, opts()); return cv;
}
$('jpg').addEventListener('click', async () => {
  status('Rendering…'); const cv = await renderSheet();
  const blob = await blobOf(cv, 'image/jpeg', 0.95); if (!blob) return status('Could not create the image (out of memory?). Try a smaller paper size.');
  const dpi = Math.round(cv.width / (PAPER[$('paper').value] || PAPER.letter)[0]);
  download(await withDpi(blob, dpi), 'zine-sheet.jpg'); status('Saved zine-sheet.jpg (' + dpi + ' DPI)');
});
// minimal PDF writer: one JPEG per page
async function buildPDF(pages) {            // pages: [{wPt,hPt,wPx,hPx,jpeg:Uint8Array}]
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
$('pdf').addEventListener('click', async () => {
  status('Rendering…');
  const [inW, inH] = PAPER[$('paper').value], pages = [];
  const add = async (cv, wIn, hIn) => pages.push({ wPt: wIn * 72, hPt: hIn * 72, wPx: cv.width, hPx: cv.height, jpeg: new Uint8Array(await (await blobOf(cv, 'image/jpeg', 0.92)).arrayBuffer()) });
  await add(await renderSheet(), inW, inH);
  if ($('singles').checked) {
    const [W, H] = sheetSize(300), w = W / 4, h = H / 2;
    for (let i = 0; i < N; i++) {
      const cv = document.createElement('canvas'); cv.width = Math.round(w); cv.height = Math.round(h);
      drawPanel(cv.getContext('2d'), cv.width, cv.height, panels[i], opts()); await add(cv, inW / 4, inH / 2);
    }
  }
  download(await buildPDF(pages), 'zine.pdf'); status('Saved zine.pdf (' + pages.length + ' page' + (pages.length > 1 ? 's' : '') + ')');
});

buildGrid();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
