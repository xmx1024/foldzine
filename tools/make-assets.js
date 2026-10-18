// Regenerates og.png (share card) and apple-touch-icon.png using the app's own renderer.
// Usage: PW_CHANNEL=chrome node tools/make-assets.js   (needs `node tests/serve.js` or any static server on :8087)
const { chromium } = require('@playwright/test'); const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:8087/index.html');
  const out = await page.evaluate(() => {
    // share card 1200x630: a sample sheet beside the title
    const og = document.createElement('canvas'); og.width = 1200; og.height = 630; const g = og.getContext('2d');
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 1200, 630);
    const tints = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#8338ec', '#06d6a0', '#ef476f', '#118ab2'];
    const pn = tints.map((c, i) => ({ ...newPanel(), mode: 'text', pbg: c, pfg: '#ffffff', size: 'xl', text: String(i + 1) }));
    const sw = 620, sh = Math.round(sw * 8.5 / 11), sheet = document.createElement('canvas'); sheet.width = sw * 2; sheet.height = sh * 2;
    drawSheet(sheet.getContext('2d'), sheet.width, sheet.height, { margin: 0.03, bg: '#f4f1ea', fg: '#fff', guides: true, ticks: false }, pn);
    g.save(); g.translate(540, 76); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 24; g.shadowOffsetY = 10; g.drawImage(sheet, 0, 0, sw, sh); g.restore();
    g.fillStyle = '#16140f'; g.font = 'bold 92px system-ui, sans-serif'; g.fillText('Fold', 60, 250);
    g.fillStyle = '#d6381f'; g.fillText('Zine', 60, 350);
    g.fillStyle = '#16140f'; g.font = '30px system-ui, sans-serif'; g.fillText('One sheet. Eight pages.', 60, 430);
    g.fillStyle = '#6b665a'; g.font = '24px system-ui, sans-serif'; g.fillText('Runs in your browser. Nothing is uploaded.', 60, 480);
    // touch icon 180x180
    const ic = document.createElement('canvas'); ic.width = 180; ic.height = 180; const x = ic.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, 180, 180); x.strokeStyle = '#f4f1ea'; x.lineWidth = 5; x.strokeRect(28, 52, 124, 76);
    x.setLineDash([8, 6]); x.lineWidth = 3; x.beginPath(); for (const px of [59, 90, 121]) { x.moveTo(px, 52); x.lineTo(px, 128); } x.moveTo(28, 90); x.lineTo(152, 90); x.stroke();
    x.setLineDash([]); x.strokeStyle = '#d6381f'; x.lineWidth = 7; x.beginPath(); x.moveTo(59, 90); x.lineTo(121, 90); x.stroke();
    return { og: og.toDataURL('image/png'), icon: ic.toDataURL('image/png') };
  });
  const root = path.join(__dirname, '..');
  fs.writeFileSync(path.join(root, 'og.png'), Buffer.from(out.og.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(root, 'apple-touch-icon.png'), Buffer.from(out.icon.split(',')[1], 'base64'));
  await browser.close(); console.log('wrote og.png and apple-touch-icon.png');
})();
