// Serveur statique minimal pour le développement et les tests (npm start, PORT=8000 par défaut).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

var root = fileURLToPath(new URL('..', import.meta.url));
var port = Number(process.env.PORT) || 8000;
var types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
};

createServer(async function (req, res) {
  var path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  var file = normalize(join(root, path));
  if (!file.startsWith(root) || /[\\/](node_modules|\.git)[\\/]/.test(file)) {
    res.writeHead(403).end();
    return;
  }
  try {
    var body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end('Introuvable');
  }
}).listen(port, function () {
  console.log('Debrief drone ESAM : http://localhost:' + port);
});
