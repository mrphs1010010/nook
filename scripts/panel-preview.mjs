// Serves the built side panel as an ordinary web page, with dev/chrome-mock.js standing in
// for the chrome.* APIs — for working on the panel UI without reloading the extension.
// Run `npm run preview:panel`, then open http://127.0.0.1:5178/
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../output/chrome-mv3/', import.meta.url));
const mock = fileURLToPath(new URL('../dev/chrome-mock.js', import.meta.url));
const port = Number(process.env.PORT ?? 5178);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Loaded before the panel's own scripts; also narrows the page to side-panel width.
const injected =
  '<script src="/chrome-mock.js"></script>' +
  '<style>body { max-width: 380px; min-height: 100vh; margin-inline: auto !important; box-shadow: 0 0 0 1px #8884; }</style>';

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  if (path === '/') path = '/sidepanel.html';
  try {
    let body = path === '/chrome-mock.js' ? await readFile(mock) : await readFile(join(root, path));
    if (path === '/sidepanel.html') body = body.toString().replace('<head>', `<head>${injected}`);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Panel preview: http://127.0.0.1:${port}/`));
