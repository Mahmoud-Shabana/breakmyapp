import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const html = await readFile(new URL('./index.html', import.meta.url));
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
server.listen(4173, '127.0.0.1', () => {
  console.log('Deliberately broken test site: http://127.0.0.1:4173');
});
