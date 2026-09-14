import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createServer, isPublicIp, normalizeIp, readConfig } from '../server.mjs';

let fixture;
let distDir;
let socketServer;
let proxyServer;
const servers = [];

async function listen(options = {}, host = '127.0.0.1') {
  const server = createServer({ distDir, ...options });
  server.listen(0, host);
  await once(server, 'listening');
  servers.push(server);
  return server;
}

function request(server, pathname = '/api/whoami', { method = 'GET', headers = {} } = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      host: address.address,
      port: address.port,
      path: pathname,
      method,
      headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString(),
      }));
      response.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

before(async () => {
  // Keep isolated fixtures inside the repository, never in a system temporary directory.
  fixture = await mkdtemp(path.join(import.meta.dirname, '.server-fixture-'));
  distDir = path.join(fixture, 'dist');
  await mkdir(path.join(distDir, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Whoami fixture</title>'),
    writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log("fixture");'),
    writeFile(path.join(distDir, 'assets', 'app.css'), 'body { color: green; }'),
    writeFile(path.join(distDir, 'assets', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    writeFile(path.join(distDir, 'data.json'), '{"fixture":true}'),
    writeFile(path.join(fixture, 'secret.txt'), 'DO NOT LEAK'),
  ]);
  socketServer = await listen();
  proxyServer = await listen({ trustProxy: true });
});

after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  })));
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

test('socket identity ignores spoofed forwarding headers and returns only diagnostic metadata', async () => {
  const result = await request(socketServer, '/api/whoami?ignored=secret', {
    headers: {
      'X-Forwarded-For': '8.8.8.8, 1.1.1.1',
      Forwarded: 'for=9.9.9.9',
      'X-Real-IP': '8.8.4.4',
      Cookie: 'private-cookie',
      Authorization: 'Bearer private-token',
      'User-Agent': 'Whoami test',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://untrusted.example',
    },
  });
  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.deepEqual(Object.keys(body).sort(), ['family', 'ip', 'observedAt', 'public', 'request', 'source']);
  assert.equal(body.ip, '127.0.0.1');
  assert.equal(body.family, 'IPv4');
  assert.equal(body.public, false);
  assert.equal(body.source, 'socket');
  assert.equal(new Date(body.observedAt).toISOString(), body.observedAt);
  assert.deepEqual(body.request, {
    httpVersion: '1.1',
    userAgent: 'Whoami test',
    acceptLanguage: 'en-US,en;q=0.9',
  });
  assert.ok(!result.body.includes('private-'));
  assert.equal(result.headers['access-control-allow-origin'], undefined);
});

test('trusted proxy validates the first X-Forwarded-For token', async () => {
  for (const [forwarded, expectedIp, family, publicIp] of [
    [' 8.8.8.8 , 192.168.1.1', '8.8.8.8', 'IPv4', true],
    ['::ffff:8.8.4.4, 127.0.0.1', '8.8.4.4', 'IPv4', true],
    ['0:0:0:0:0:ffff:0808:0404', '8.8.4.4', 'IPv4', true],
    ['2606:4700:4700::1111, 10.0.0.1', '2606:4700:4700::1111', 'IPv6', true],
    ['2001:db8::1', '2001:db8::1', 'IPv6', false],
    ['10.0.0.1', '10.0.0.1', 'IPv4', false],
  ]) {
    const result = await request(proxyServer, '/api/whoami', { headers: { 'X-Forwarded-For': forwarded } });
    assert.equal(result.status, 200, forwarded);
    const body = JSON.parse(result.body);
    assert.equal(body.ip, expectedIp);
    assert.equal(body.family, family);
    assert.equal(body.public, publicIp);
    assert.equal(body.source, 'trusted-proxy');
    assert.deepEqual(body.request, { httpVersion: '1.1', userAgent: null, acceptLanguage: null });
  }
});

test('trusted proxy fails closed for missing or invalid authoritative addresses', async () => {
  for (const invalid of [undefined, '', 'unknown', 'bad, 8.8.8.8', ', 8.8.8.8', '999.1.1.1', '8.8.8.8:443', '[::1]', 'fe80::1%eth0', '1.2.3', '01.2.3.4']) {
    const headers = invalid === undefined ? {} : { 'X-Forwarded-For': invalid };
    const result = await request(proxyServer, '/api/whoami', { headers });
    assert.equal(result.status, 400, String(invalid));
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(typeof JSON.parse(result.body).error, 'string');
    assert.ok(!Object.hasOwn(JSON.parse(result.body), 'ip'));
  }
  assert.equal((await request(socketServer, '/api/whoami', {
    headers: { 'X-Forwarded-For': 'not an IP' },
  })).status, 200);
});

test('IPv6 socket identity is retained when IPv6 loopback is available', async (context) => {
  let server;
  try {
    server = await listen({}, '::1');
  } catch (error) {
    if (['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code)) {
      context.skip('IPv6 loopback is unavailable on this host.');
      return;
    }
    throw error;
  }
  const result = await request(server);
  const body = JSON.parse(result.body);
  assert.equal(body.ip, '::1');
  assert.equal(body.family, 'IPv6');
  assert.equal(body.public, false);
});

test('IP helpers reject invalid, private, reserved, documentation, and test ranges', () => {
  for (const ip of [
    '', 'invalid', '1.2.3', '256.1.1.1', '127.1', '01.2.3.4', '8.8.8.8:80',
    '0.1.2.3', '10.1.2.3', '100.64.0.1', '100.127.255.255', '127.0.0.1',
    '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.1',
    '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.19.255.255', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:c000:201', 'fc00::1', 'fdff::1',
    'fe80::1', 'febf::1', 'fec0::1', 'ff02::1', '2001:db8::1', '2001:2::1',
    '2001:10::1', '2001:20::1', '2002:7f00:1::', '3fff::1', '3fff:fff::1',
    '4000::1', '100::1', '5f00::1',
  ]) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of [
    '8.8.8.8', '1.1.1.1', '100.63.255.255', '100.128.0.1', '172.15.255.255',
    '172.32.0.1', '192.0.0.9', '192.0.0.10', '198.17.255.255', '198.20.0.1',
    '::ffff:8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888',
  ]) assert.equal(isPublicIp(ip), true, ip);
  assert.equal(normalizeIp('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(normalizeIp('0:0:0:0:0:ffff:c000:201'), '192.0.2.1');
  assert.throws(() => normalizeIp('untrusted'));
});

test('API and errors carry privacy and security headers', async () => {
  const result = await request(socketServer);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.equal(result.headers['referrer-policy'], 'no-referrer');
  assert.match(result.headers['content-type'], /^application\/json/);
  const csp = result.headers['content-security-policy'];
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /font-src 'self';/);
  assert.match(csp, /img-src 'self' data:;/);
  for (const hostname of ['api.ipify.org', 'api6.ipify.org', 'api64.ipify.org', 'icanhazip.com', 'ipv4.icanhazip.com', 'ipv6.icanhazip.com', 'v4.ident.me', 'v6.ident.me', 'ip4only.me', 'ip6only.me', 'ipapi.co']) {
    assert.ok(csp.includes(`https://${hostname}`));
  }
  assert.ok(!csp.includes('unsafe-inline'));
  assert.ok(!csp.includes('*'));
});

test('HEAD has the corresponding GET headers without a response body', async () => {
  for (const pathname of ['/', '/api/whoami', '/assets/app.js', '/index.html', '/missing.js']) {
    const get = await request(socketServer, pathname);
    const head = await request(socketServer, pathname, { method: 'HEAD' });
    assert.equal(head.status, get.status);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-type'], get.headers['content-type']);
    assert.equal(head.headers['content-length'], get.headers['content-length']);
    assert.equal(head.headers['cache-control'], get.headers['cache-control']);
  }
});

test('only GET and HEAD are allowed, without permissive CORS preflight', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    for (const pathname of ['/api/whoami', '/assets/app.js']) {
      const result = await request(socketServer, pathname, { method });
      assert.equal(result.status, 405);
      assert.equal(result.headers.allow, 'GET, HEAD');
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.headers['access-control-allow-origin'], undefined);
    }
  }
});

test('static resources have correct MIME types', async () => {
  for (const [pathname, mime] of [
    ['/', 'text/html; charset=utf-8'],
    ['/assets/app.js', 'text/javascript; charset=utf-8'],
    ['/assets/app.css', 'text/css; charset=utf-8'],
    ['/assets/icon.svg', 'image/svg+xml'],
    ['/data.json', 'application/json; charset=utf-8'],
    ['/index.html', 'text/html; charset=utf-8'],
  ]) {
    const result = await request(socketServer, `${pathname}?version=123`);
    assert.equal(result.status, 200, pathname);
    assert.equal(result.headers['content-type'], mime);
    assert.equal(Number(result.headers['content-length']), Buffer.byteLength(result.body));
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
  }
});

test('SPA fallback is limited to HTML navigation, never missing assets or API routes', async () => {
  for (const pathname of ['/', '/diagnostics', '/diagnostics/network']) {
    const result = await request(socketServer, pathname, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'Sec-Fetch-Mode': 'navigate' },
    });
    assert.equal(result.status, 200);
    assert.match(result.body, /Whoami fixture/);
  }
  for (const pathname of ['/missing.js', '/missing.css', '/missing.svg', '/assets/not-built', '/api/missing']) {
    const result = await request(socketServer, pathname, { headers: { Accept: 'text/html' } });
    assert.equal(result.status, 404, pathname);
    assert.ok(!result.body.includes('<!doctype'));
  }
  for (const headers of [
    {}, { Accept: '*/*' }, { Accept: 'application/json' }, { Accept: 'text/html;q=0' },
    { Accept: 'text/html', 'Sec-Fetch-Mode': 'cors' },
    { Accept: 'text/html', 'Sec-Fetch-Dest': 'script' },
  ]) {
    assert.equal((await request(socketServer, '/missing', { headers })).status, 404);
  }
});

test('raw, encoded, backslash, malformed, and Windows traversal cannot leak outside dist', async () => {
  for (const pathname of [
    '/../secret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt',
    '/..%5csecret.txt', '/assets%5c..%5c..%5csecret.txt', '/C:%5csecret.txt',
    '/index.html::$DATA', '/%00', '/%E0%A4%A', '/%',
    '/%252e%252e/secret.txt',
  ]) {
    const result = await request(socketServer, pathname, { headers: { Accept: 'text/html' } });
    assert.ok([400, 403, 404].includes(result.status), `${pathname}: ${result.status}`);
    assert.ok(!result.body.includes('DO NOT LEAK'), pathname);
    assert.ok(!result.body.includes(fixture), pathname);
  }
});

test('symlinks outside the static root cannot leak files', async (context) => {
  const linkedDirectory = path.join(distDir, 'linked');
  try {
    await symlink(fixture, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      context.skip('Symlink creation is not permitted on this host.');
      return;
    }
    throw error;
  }
  const result = await request(socketServer, '/linked/secret.txt');
  assert.equal(result.status, 403);
  assert.ok(!result.body.includes('DO NOT LEAK'));
});

test('configuration defaults are local-only and invalid settings fail helpfully', () => {
  assert.deepEqual(readConfig({}), { port: 3001, host: '127.0.0.1', trustProxy: false });
  assert.deepEqual(readConfig({ PORT: '8080', HOST: '0.0.0.0', TRUST_PROXY: 'true' }), {
    port: 8080, host: '0.0.0.0', trustProxy: true,
  });
  for (const PORT of ['', '-1', '1.5', '65536', '3e3', ' 3001', 'hello']) {
    assert.throws(() => readConfig({ PORT }), /PORT/);
  }
  assert.throws(() => readConfig({ HOST: '' }), /HOST/);
  assert.throws(() => readConfig({ TRUST_PROXY: 'yes' }), /TRUST_PROXY/);
  assert.throws(() => createServer({ trustProxy: 'true' }), /boolean/);
});
