import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';

const root = resolve(process.env.BUNDLE_BUILD_DIR ?? 'build');
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  let file = resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}/`)) {
    response.writeHead(403).end();
    return;
  }
  if (!extname(file)) {
    file = resolve(root, 'index.html');
  }
  try {
    const body = await readFile(file);
    response
      .writeHead(200, {
        'content-type':
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.html': 'text/html',
            '.json': 'application/json',
            '.woff2': 'font/woff2',
            '.svg': 'image/svg+xml',
          }[extname(file)] ?? 'application/octet-stream',
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(4178, '127.0.0.1', () => process.send?.('ready'));
