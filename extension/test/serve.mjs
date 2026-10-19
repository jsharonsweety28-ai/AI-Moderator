// Test bench for the extension: serves the local copies of the YouTube/Reddit comment
// boxes plus content.js, and forwards /api/* to the Redraft dev server (localhost:3000).
// Run: node extension/test/serve.mjs  →  http://localhost:8792
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = { '/': ['fixtures.html', 'text/html'], '/content.js': ['../content.js', 'text/javascript'] };
const API = process.env.REDRAFT_API || 'http://localhost:3000';
const port = Number(process.env.PORT || 8792);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const upstream = await fetch(API + url.pathname + url.search, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: req.method === 'GET' ? undefined : body,
      });
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(await upstream.text());
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Redraft server is not running.' }));
    }
    return;
  }
  const file = FILES[url.pathname];
  if (!file) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' });
  res.end(fs.readFileSync(path.join(HERE, file[0])));
}).listen(port, '127.0.0.1', () => console.log(`Extension test bench on http://localhost:${port}`));
