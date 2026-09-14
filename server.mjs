import { createServer as createHttpServer } from 'node:http';
import { isIP } from 'node:net';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_DIST_DIR = path.resolve(import.meta.dirname, 'dist');
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.ipify.org https://api6.ipify.org https://api64.ipify.org https://icanhazip.com https://ipv4.icanhazip.com https://ipv6.icanhazip.com https://v4.ident.me https://v6.ident.me https://ip4only.me https://ip6only.me https://ipapi.co",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function ipv6Value(address) {
  let expanded = address;
  if (expanded.includes('.')) {
    const lastColon = expanded.lastIndexOf(':');
    const octets = expanded.slice(lastColon + 1).split('.').map(Number);
    expanded = `${expanded.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const [left, right] = expanded.split('::');
  const first = left ? left.split(':') : [];
  const last = right ? right.split(':') : [];
  const words = right === undefined
    ? first
    : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
  return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function ipv4Value(address) {
  return address.split('.').reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

function inPrefix(value, network, prefixLength, bits) {
  const shift = BigInt(bits - prefixLength);
  return (value >> shift) === (network >> shift);
}

/** Return a validated IP literal, normalizing both forms of IPv4-mapped IPv6. */
export function normalizeIp(address) {
  if (typeof address !== 'string' || address.includes('%') || !isIP(address)) {
    throw new TypeError('Expected an IPv4 or IPv6 address literal.');
  }
  if (isIP(address) === 6) {
    const value = ipv6Value(address);
    if (value >> 32n === 0xffffn) {
      return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join('.');
    }
  }
  return address.toLowerCase();
}

const NON_PUBLIC_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].map(([network, prefix]) => [ipv4Value(network), prefix]);

/** Conservative global-unicast classification, not proof of Internet reachability. */
export function isPublicIp(address) {
  let ip;
  try {
    ip = normalizeIp(address);
  } catch {
    return false;
  }
  if (isIP(ip) === 4) {
    // These anycast addresses are exceptions within the IETF protocol-assignment block.
    if (ip === '192.0.0.9' || ip === '192.0.0.10') return true;
    const value = ipv4Value(ip);
    return !NON_PUBLIC_V4.some(([network, prefix]) => inPrefix(value, network, prefix, 32));
  }
  const value = ipv6Value(ip);
  if (!inPrefix(value, ipv6Value('2000::'), 3, 128)) return false;
  return ![
    ['2001::', 23], // Protocol assignments, including Teredo, benchmarking, and ORCHID.
    ['2001:db8::', 32], // Documentation.
    ['2002::', 16], // Deprecated 6to4, which may embed a non-public IPv4 address.
    ['3fff::', 20], // Documentation.
  ].some(([network, prefix]) => inPrefix(value, ipv6Value(network), prefix, 128));
}

function respond(request, response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  const bytes = Buffer.from(body);
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': bytes.length,
  });
  response.end(request.method === 'HEAD' ? undefined : bytes);
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isNavigation(request, pathname) {
  const mode = request.headers['sec-fetch-mode'];
  const destination = request.headers['sec-fetch-dest'];
  return !path.posix.extname(pathname)
    && !pathname.startsWith('/assets/')
    && (!mode || mode === 'navigate')
    && (!destination || destination === 'document')
    && (request.headers.accept ?? '').split(',').some((part) => {
      const [type, ...parameters] = part.trim().split(';');
      return type.toLowerCase() === 'text/html'
        && !parameters.some((parameter) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/i.test(parameter));
    });
}

async function findFile(distDir, filename) {
  try {
    const [root, target] = await Promise.all([realpath(distDir), realpath(filename)]);
    if (!isWithin(root, target)) return { forbidden: true };
    const file = await open(target, 'r');
    try {
      const info = await file.stat();
      if (info.isFile()) return { file, size: info.size, filename: target };
    } catch (error) {
      await file.close();
      throw error;
    }
    await file.close();
    return {};
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return {};
    if (['EACCES', 'EPERM', 'ELOOP'].includes(error.code)) return { forbidden: true };
    throw error;
  }
}

/**
 * TRUST_PROXY=true is safe ONLY behind a proxy that strips/replaces untrusted
 * X-Forwarded-For headers. The first comma-separated IP is then authoritative.
 * A missing or malformed authoritative header fails closed with HTTP 400.
 * The library defaults to socket identity; only the executable reads environment.
 */
export function createRequestHandler({ distDir = DEFAULT_DIST_DIR, trustProxy = false } = {}) {
  if (typeof trustProxy !== 'boolean') throw new TypeError('trustProxy must be a boolean.');
  if (typeof distDir !== 'string' || !distDir) throw new TypeError('distDir must be a directory path.');
  const root = path.resolve(distDir);

  return async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', CSP);
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD');
        respond(request, response, 405, 'Method not allowed.\n');
        return;
      }

      // Inspect the original target before URL normalization can hide dot segments.
      let pathname;
      try {
        pathname = decodeURIComponent((request.url ?? '').split('?')[0]);
      } catch {
        respond(request, response, 400, 'Malformed request path.\n');
        return;
      }
      if (!pathname.startsWith('/') || pathname.includes('\0')) {
        respond(request, response, 400, 'Invalid request path.\n');
        return;
      }
      // Colons also prevent Windows drive paths and NTFS alternate data streams.
      if (/[\\:]/.test(pathname) || pathname.split('/').some((part) => part === '..' || part === '.')) {
        respond(request, response, 403, 'Forbidden path.\n');
        return;
      }
      if (pathname === '/api/whoami') {
        let ip;
        try {
          const authoritative = trustProxy
            ? request.headers['x-forwarded-for']?.split(',')[0].trim()
            : request.socket.remoteAddress?.split('%')[0];
          ip = normalizeIp(authoritative);
        } catch {
          respond(request, response, trustProxy ? 400 : 503, JSON.stringify({
            error: trustProxy ? 'A valid X-Forwarded-For IP address is required.' : 'Socket IP address unavailable.',
          }), 'application/json; charset=utf-8');
          return;
        }
        respond(request, response, 200, JSON.stringify({
          ip,
          family: isIP(ip) === 4 ? 'IPv4' : 'IPv6',
          public: isPublicIp(ip),
          source: trustProxy ? 'trusted-proxy' : 'socket',
          observedAt: new Date().toISOString(),
          request: {
            httpVersion: request.httpVersion,
            userAgent: request.headers['user-agent'] ?? null,
            acceptLanguage: request.headers['accept-language'] ?? null,
          },
        }), 'application/json; charset=utf-8');
        return;
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        respond(request, response, 404, 'Not found.\n');
        return;
      }

      const filename = pathname === '/' ? path.join(root, 'index.html') : path.resolve(root, `.${pathname}`);
      if (!isWithin(root, filename)) {
        respond(request, response, 403, 'Forbidden path.\n');
        return;
      }
      let found = await findFile(root, filename);
      if (!found.file && !found.forbidden && isNavigation(request, pathname)) {
        found = await findFile(root, path.join(root, 'index.html'));
      }
      if (!found.file) {
        respond(request, response, found.forbidden ? 403 : 404, found.forbidden ? 'Forbidden path.\n' : 'Not found.\n');
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(found.filename).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': found.size,
        'Cache-Control': 'no-cache',
      });
      if (request.method === 'HEAD') {
        await found.file.close();
        response.end();
        return;
      }
      const stream = found.file.createReadStream();
      response.once('close', () => stream.destroy());
      stream.once('error', () => response.destroy());
      stream.pipe(response);
    } catch {
      // Never log request data: IP addresses are personal diagnostic information.
      if (response.headersSent) response.destroy();
      else respond(request, response, 500, 'Internal server error.\n');
    }
  };
}

export function createServer(options) {
  return createHttpServer(createRequestHandler(options));
}

export function readConfig(environment = process.env) {
  const rawPort = environment.PORT ?? '3001';
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(Number(rawPort)) || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }
  const host = environment.HOST ?? '127.0.0.1';
  if (!host.trim() || host !== host.trim()) throw new Error('HOST must be a nonempty hostname or IP address without surrounding whitespace.');
  const proxy = environment.TRUST_PROXY ?? 'false';
  if (!['true', 'false'].includes(proxy)) throw new Error('TRUST_PROXY must be exactly "true" or "false".');
  return { port: Number(rawPort), host, trustProxy: proxy === 'true' };
}

async function main() {
  const { port, host, trustProxy } = readConfig();
  try {
    if (!(await stat(path.join(DEFAULT_DIST_DIR, 'index.html'))).isFile()) throw new Error('Not a file.');
  } catch {
    throw new Error('The production build is missing. Run npm run build before starting the server.');
  }
  const server = createServer({ trustProxy });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const bound = server.address();
  console.log(`Whoami server listening at http://${isIP(bound.address) === 6 ? `[${bound.address}]` : bound.address}:${bound.port}`);
  if (trustProxy) console.log('Trusted proxy mode enabled; the proxy must replace untrusted X-Forwarded-For headers.');
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
    deadline.unref();
    server.close(() => clearTimeout(deadline));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Unable to start Whoami server: ${error.message}`);
    process.exitCode = 1;
  });
}
