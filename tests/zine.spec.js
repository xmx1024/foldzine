const { test, expect } = require('@playwright/test');
const fs = require('fs');

// ---- helpers ----
// Put N generated PNG pictures into a file input and fire its change event.
async function addImages(page, inputId, n, { w = 1200, h = 800, type = 'image/png', name = 'pic' } = {}) {
  await page.evaluate(async ({ inputId, n, w, h, type, name }) => {
    const dt = new DataTransfer();
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = `hsl(${i * 45},70%,50%)`; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.font = 'bold 300px sans-serif'; x.fillText(String(i + 1), 40, h / 2 + 100);
      const b = await new Promise(r => c.toBlob(r, type));
      dt.items.add(new File([b], `${name}${i}.png`, { type }));
    }
    const el = document.getElementById(inputId); el.files = dt.files; el.dispatchEvent(new Event('change'));
  }, { inputId, n, w, h, type, name });
}
const loaded = page => page.evaluate(() => panels.filter(p => p.img).length);
async function download(page, selector) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
}
function jpegInfo(b) {           // size from the SOF marker, density from JFIF
  let i = 2, w = 0, h = 0;
  while (i < b.length) { if (b[i] !== 0xFF) break; const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xC0 && m <= 0xC3) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + len; }
  return { w, h, dpi: b.readUInt16BE(14), units: b[13], isJpeg: b[0] === 0xFF && b[1] === 0xD8 };
}
function zipEntries(b) {         // read local headers of a store-only zip
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), count = b.readUInt16LE(eocd + 10), out = []; let off = b.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    const nlen = b.readUInt16LE(off + 28), size = b.readUInt32LE(off + 20), cd = b.readUInt32LE(off + 16);   // central dir entry
    const name = b.slice(off + 46, off + 46 + nlen).toString(), lho = b.readUInt32LE(off + 42), lnlen = b.readUInt16LE(lho + 26);
    out.push({ name, size, data: b.slice(lho + 30 + lnlen, lho + 30 + lnlen + size), crc: cd }); off += 46 + nlen;
  }
  return out;
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', e => { throw e; });
  await page.goto('/index.html');
  await page.evaluate(() => indexedDB.deleteDatabase('foldzine'));
  await page.reload();
});

test('loads with eight empty pages and no console errors', async ({ page }) => {
  const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('sheet geometry: top row 5 4 3 2 upside down, bottom row 6 7 8 1', async ({ page }) => {
  const got = await page.evaluate(() => {
    const colours = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#808080', '#000000'];
    const pn = colours.map(c => ({ ...newPanel(), mode: 'text', pbg: c }));
    const W = 400, H = 200, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); drawSheet(ctx, W, H, { margin: 0, bg: '#fff', fg: '#000', guides: false, ticks: false }, pn);
    const at = (c, r) => [...ctx.getImageData(c * 100 + 10, r * 100 + 10, 1, 1).data.slice(0, 3)];
    const near = (a, hex) => { const t = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return a.every((v, i) => Math.abs(v - t[i]) < 3); };
    const pageAt = (c, r) => colours.findIndex(h => near(at(c, r), h)) + 1;
    return { top: [0, 1, 2, 3].map(c => pageAt(c, 0)), bottom: [0, 1, 2, 3].map(c => pageAt(c, 1)) };
  });
  expect(got.top).toEqual([5, 4, 3, 2]);
  expect(got.bottom).toEqual([6, 7, 8, 1]);
});

test('adds pictures, rejects unsupported types and fills pages in order', async ({ page }) => {
  await addImages(page, 'file', 3);
  await expect.poll(() => loaded(page)).toBe(3);
  await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'x.svg', { type: 'image/svg+xml' })); const el = document.getElementById('file'); el.files = dt.files; el.dispatchEvent(new Event('change')); });
  await expect(page.locator('#status')).toContainText('Unsupported file type');
  expect(await loaded(page)).toBe(3);
});

test('downscales very large photos on load', async ({ page }) => {
  await addImages(page, 'file', 1, { w: 6000, h: 3000 });
  await expect.poll(() => loaded(page)).toBe(1);
  const dims = await page.evaluate(() => [panels[0].iw, panels[0].ih]);
  expect(Math.max(...dims)).toBeLessThanOrEqual(4096);
});

test('reorders pages with the move buttons and keeps keyboard focus', async ({ page }) => {
  await addImages(page, 'file', 3);
  await expect.poll(() => loaded(page)).toBe(3);
  await page.evaluate(() => { panels.forEach((p, i) => { p.caption = 'cap' + (i + 1); }); });
  await page.locator('.card').nth(0).locator('.r').click();
  expect(await page.evaluate(() => panels.slice(0, 3).map(p => p.caption))).toEqual(['cap2', 'cap1', 'cap3']);
  await expect(page.locator('.card').nth(1).locator('.r')).toBeFocused();
  await expect(page.locator('.card').nth(0).locator('.l')).toBeDisabled();
});

test('editor: zoom, pan limits, rotate, text pages', async ({ page }) => {
  await addImages(page, 'file', 1);
  await expect.poll(() => loaded(page)).toBe(1);
  await page.locator('.card').nth(0).locator('.ed').click();
  await expect(page.locator('#editor')).toBeVisible();
  await page.fill('#edZoom', '2');
  await page.locator('#edCanvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  let st = await page.evaluate(() => ({ z: panels[0].zoom, px: panels[0].px }));
  expect(st.z).toBe(2); expect(st.px).not.toBe(0);
  for (let i = 0; i < 400; i++) await page.keyboard.press('ArrowRight');      // push far past the edge
  const lim = await page.evaluate(() => { const p = panels[0], box = boxNow(), l = panLimits(box, p); return { px: p.px * box.w, max: l.x }; });
  expect(Math.abs(lim.px)).toBeLessThanOrEqual(lim.max + 0.5);
  await page.click('#edRot'); expect(await page.evaluate(() => panels[0].rot)).toBe(90);
  await page.click('#edReset'); expect(await page.evaluate(() => [panels[0].zoom, panels[0].rot])).toEqual([1, 0]);
  await page.check('#modeText'); await page.fill('#edText', 'Hello\nzine'); await page.selectOption('#edFont', 'serif'); await page.selectOption('#edSize', 'xl');
  expect(await page.evaluate(() => [panels[0].mode, panels[0].text, panels[0].font, panels[0].size])).toEqual(['text', 'Hello\nzine', 'serif', 'xl']);
  await page.click('#edDone'); await expect(page.locator('#editor')).not.toBeVisible();
});

test('exports: JPG at 300 DPI, PNG, PDF (with and without single pages), ZIP, fold-test sheet', async ({ page }) => {
  await addImages(page, 'file', 8);
  await expect.poll(() => loaded(page)).toBe(8);
  const jpg = await download(page, '#jpg'); const j = jpegInfo(jpg.bytes);
  expect(jpg.name).toBe('zine-sheet.jpg'); expect(j).toMatchObject({ isJpeg: true, w: 3300, h: 2550, dpi: 300, units: 1 });
  const png = await download(page, '#png'); expect(png.bytes.slice(1, 4).toString()).toBe('PNG');
  const pdf1 = await download(page, '#pdf'); expect(pdf1.bytes.slice(0, 5).toString()).toBe('%PDF-'); expect((pdf1.bytes.toString('latin1').match(/\/Type \/Page /g) || []).length).toBe(1);
  await page.check('#singles'); const pdf9 = await download(page, '#pdf'); expect((pdf9.bytes.toString('latin1').match(/\/Type \/Page /g) || []).length).toBe(9);
  const zip = await download(page, '#zip'); const ent = zipEntries(zip.bytes);
  expect(ent.map(e => e.name)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => `page-${n}.jpg`));
  for (const e of ent) { expect(e.data[0]).toBe(0xFF); expect(e.data[1]).toBe(0xD8); }
  const test = await download(page, '#testSheet'); expect(test.bytes.slice(0, 5).toString()).toBe('%PDF-');
});

test('A3 export stays under the canvas limit and reports the real DPI', async ({ page }) => {
  await page.selectOption('#paper', 'a3');
  const jpg = await download(page, '#jpg'); const j = jpegInfo(jpg.bytes);
  expect(j.w * j.h).toBeLessThanOrEqual(16000000); expect(j.dpi).toBeLessThan(300); expect(j.dpi).toBeGreaterThan(250);
});

test('autosave restores work after a reload', async ({ page }) => {
  await addImages(page, 'file', 2);
  await expect.poll(() => loaded(page)).toBe(2);
  await page.evaluate(() => { panels[2].mode = 'text'; panels[2].text = 'kept'; changed(); });
  await page.selectOption('#paper', 'a4');
  await page.waitForTimeout(1500);
  await page.reload();
  await expect.poll(() => loaded(page)).toBe(2);
  expect(await page.evaluate(() => [panels[2].mode, panels[2].text, document.getElementById('paper').value])).toEqual(['text', 'kept', 'a4']);
});

test('project file round trip, and hostile files are refused', async ({ page }) => {
  await addImages(page, 'file', 2);
  await expect.poll(() => loaded(page)).toBe(2);
  await page.evaluate(() => { panels[0].caption = 'hello'; panels[0].zoom = 1.5; panels[3].mode = 'text'; panels[3].text = 'text page'; });
  const saved = await download(page, '#saveProj'); expect(saved.name).toBe('zine-project.json');
  await page.click('#clearBtn'); await page.click('#clearBtn');
  expect(await loaded(page)).toBe(0);
  await page.setInputFiles('#projFile', { name: 'p.json', mimeType: 'application/json', buffer: saved.bytes });
  await expect.poll(() => loaded(page)).toBe(2);
  expect(await page.evaluate(() => [panels[0].caption, panels[0].zoom, panels[3].text])).toEqual(['hello', 1.5, 'text page']);
  const bad = async (buf, msg) => { await page.setInputFiles('#projFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(buf) }); await expect(page.locator('#status')).toContainText(msg); };
  await bad('not json at all', 'not valid JSON');
  await bad(JSON.stringify({ app: 'other', version: 1, panels: [] }), 'not a Fold Zine project');
  // a hostile project: wrong image type, absurd values, script in text; must load as inert data
  await bad(JSON.stringify({ app: 'foldzine', version: 1, settings: { paper: '<img onerror=x>', bg: 'red;}' }, panels: [{ mode: 'text', text: '<img src=x onerror=window.__pwn=1>', zoom: 9999, font: 'x', image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }] }), '1 picture skipped');
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.evaluate(() => ({ paper: document.getElementById('paper').value, z: panels[0].zoom, font: panels[0].font, img: !!panels[0].img }))).toEqual({ paper: 'letter', z: 4, font: 'sans', img: false });
});

test('security: strict CSP, no outside requests, no HTML from captions or text', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const s = document.createElement('script'); s.textContent = 'window.__x=1'; document.body.appendChild(s);
    let ext = 'allowed'; try { await fetch('https://example.com/', { mode: 'no-cors' }); } catch (e) { ext = 'blocked'; }
    panels[0].caption = '<b id="evil">x</b>'; panels[0].mode = 'text'; panels[0].text = '<img src=x onerror=window.__y=1>'; buildGrid();
    return { inline: window.__x === 1, ext, evil: !!document.getElementById('evil'), imgs: document.querySelectorAll('#grid img').length };
  });
  expect(r).toEqual({ inline: false, ext: 'blocked', evil: false, imgs: 0 });
  expect(await page.evaluate(() => window.__y)).toBeUndefined();
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'none'"); expect(csp).not.toContain('unsafe-inline'); expect(csp).not.toContain('unsafe-eval');
});

test('tampered saved data is cleaned, not trusted', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await new Promise(r => { const q = indexedDB.open('foldzine', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => r(q.result); });
    await new Promise(r => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put({ v: 1, settings: { paper: '<x>', margin: '999', bg: 'red;}', fg: '#12345g', ticks: 'yes' }, panels: [{ mode: 'text', text: 'ok', zoom: 1e9, px: NaN, rot: 45, font: 'evil', size: 'huge', pbg: 'javascript:1' }] }, 'project'); t.oncomplete = r; });
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => panels[0].text)).toBe('ok');      // restore() is asynchronous
  expect(await page.evaluate(() => ({ paper: document.getElementById('paper').value, margin: document.getElementById('margin').value, bg: document.getElementById('bg').value, z: panels[0].zoom, rot: panels[0].rot, font: panels[0].font, size: panels[0].size, pbg: panels[0].pbg, text: panels[0].text })))
    .toEqual({ paper: 'letter', margin: '0.03', bg: '#ffffff', z: 4, rot: 0, font: 'sans', size: 'm', pbg: null, text: 'ok' });
});

// ---- interactive preview and engagement features ----
async function cellPoint(page, col, row) {
  await page.waitForSelector('#preview[data-ready="1"]');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));   // let the first draw settle
  const b = await page.locator('#preview').boundingBox();
  return { x: b.x + b.width * (col + 0.5) / 4, y: b.y + b.height * (row + 0.5) / 2 };
}
test('preview: clicking a panel opens the editor for that page (top row is 5 4 3 2, bottom 6 7 8 1)', async ({ page }) => {
  const expectPage = { '0,0': 5, '1,0': 4, '2,0': 3, '3,0': 2, '0,1': 6, '1,1': 7, '2,1': 8, '3,1': 1 };
  for (const [k, n] of Object.entries(expectPage)) {
    const [c, r] = k.split(',').map(Number), p = await cellPoint(page, c, r);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('#edTitle')).toContainText('Page ' + n);
    await page.click('#edDone'); await expect(page.locator('#editor')).not.toBeVisible();
  }
});

test('preview: dragging one panel onto another swaps those pages', async ({ page }) => {
  await page.evaluate(() => { panels.forEach((p, i) => { p.mode = 'text'; p.text = 'p' + (i + 1); }); buildGrid(); });
  const from = await cellPoint(page, 3, 1), to = await cellPoint(page, 1, 0);    // page 1 -> page 4
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 }); await page.mouse.move(to.x, to.y, { steps: 5 }); await page.mouse.up();
  expect(await page.evaluate(() => panels.map(p => p.text).join(','))).toBe('p4,p2,p3,p1,p5,p6,p7,p8');
  await expect(page.locator('#editor')).not.toBeVisible();                        // a drag must not also open the editor
  await expect(page.locator('#status')).toContainText('Swapped page 1 and page 4');
});

test('progress bar and empty states follow the content', async ({ page }) => {
  await expect(page.locator('#progText')).toHaveText('0 of 8 pages filled');
  await expect(page.locator('.card.empty')).toHaveCount(8);
  await addImages(page, 'file', 3);
  await expect(page.locator('#progText')).toHaveText('3 of 8 pages filled');
  await expect(page.locator('.card.empty')).toHaveCount(5);
  expect(await page.evaluate(() => document.getElementById('progBar').style.width)).toBe('37.5%');
});

test('preview is large and sharp: canvas is at least as wide as its display size', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.reload();
  await page.waitForSelector('#preview[data-ready="1"]');
  const m = await page.evaluate(() => { const c = document.getElementById('preview'); return { css: c.getBoundingClientRect().width, px: c.width }; });
  expect(m.css).toBeGreaterThan(600); expect(m.px).toBeGreaterThanOrEqual(Math.floor(m.css));
});

test('files dropped on the pages area fill the next free pages', async ({ page }) => {
  await page.evaluate(async () => {
    const dt = new DataTransfer(); for (let i = 0; i < 2; i++) { const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillRect(0, 0, 400, 300); dt.items.add(new File([await new Promise(r => c.toBlob(r, 'image/png'))], 'd' + i + '.png', { type: 'image/png' })); }
    document.getElementById('grid').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => loaded(page)).toBe(2);
});

test('pages and print sheet are both visible without scrolling on common laptop screens', async ({ page }) => {
  for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.reload(); await page.waitForSelector('#preview[data-ready="1"]');
    const r = await page.evaluate(() => { const q = s => document.querySelector(s).getBoundingClientRect(); return { pages: q('#pagesPanel'), sheet: q('#sheetPanel'), grid: q('#grid'), preview: q('#preview'), vh: innerHeight, vw: innerWidth }; });
    expect(r.pages.bottom, `${w}x${h} pages panel`).toBeLessThanOrEqual(r.vh);
    expect(r.sheet.bottom, `${w}x${h} sheet panel`).toBeLessThanOrEqual(r.vh);
    expect(r.preview.right).toBeLessThanOrEqual(r.vw);
    expect(r.pages.right).toBeLessThanOrEqual(r.sheet.left + 1);                  // side by side
    expect(r.grid.height).toBeGreaterThan(200);
  }
});
