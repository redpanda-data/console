import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';

const root = resolve(process.env.BUNDLE_BUILD_DIR ?? 'build');

const CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

// Maps a request URL to a file inside the build directory; extensionless paths are SPA
// routes served by index.html. Returns null for paths that escape the build directory.
function resolveRequestFile(url) {
  const { pathname } = new URL(url, 'http://localhost');
  const file = resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}/`)) {
    return null;
  }
  return extname(file) ? file : resolve(root, 'index.html');
}

async function sendFile(response, file) {
  try {
    const body = await readFile(file);
    response
      .writeHead(200, {
        'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
}

const server = createServer(async (request, response) => {
  const file = resolveRequestFile(request.url);
  if (!file) {
    response.writeHead(403).end();
    return;
  }
  await sendFile(response, file);
});
server.listen(4178, '127.0.0.1', () => process.send?.('ready'));
