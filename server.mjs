/**
 * Zero-dependency local HTTP server for Wirebench Interactive Electronics Studio.
 * Usage: node server.mjs [--port 3470]
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.cir': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

function parsePort() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--port');
  if (idx !== -1 && args[idx + 1]) {
    const p = Number(args[idx + 1]);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  return Number(process.env.PORT) || 3470;
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    const relPath = urlPath === '/' ? 'public/index.html' : urlPath.replace(/^\/+/, '');
    const fullPath = path.resolve(ROOT, relPath);

    // Prevent directory traversal outside workspace root
    if (!fullPath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Server Error: ${err.message}`);
  }
});

function startListening(port, retries = 8) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      startListening(port + 1, retries - 1);
      return;
    }
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────────┐');
    console.log('  │  Wirebench - Interactive Electronics Studio & IDE   │');
    console.log(`  │  Local URL:  http://127.0.0.1:${String(addr.port).padEnd(22)}│`);
    console.log('  │  Press Ctrl+C to stop                               │');
    console.log('  └─────────────────────────────────────────────────────┘');
    console.log('');
  });
}

startListening(parsePort());
