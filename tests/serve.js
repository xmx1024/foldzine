// Minimal static file server for the tests (no dependencies).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = Number(process.env.PORT || 8087);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || p.includes('/.') || p.includes('node_modules') || p.startsWith('/tests')) { res.writeHead(404); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(port, '127.0.0.1', () => console.log('serving on http://127.0.0.1:' + port));
