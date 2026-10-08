import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const html = await readFile(new URL('./index.html', import.meta.url));
const pricing = await readFile(new URL('./pricing.html', import.meta.url));
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/pricing') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pricing);
    return;
  }
  if (path !== '/' && path !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Fixture: deliberately missing resource');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
server.listen(4173, '127.0.0.1', () => {
  console.log('Deliberately broken test site: http://127.0.0.1:4173');
});
