import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { zhihuRequest } from '../zhihu-client.mjs';

test('HTTP client sends official authentication and parameters without leaking upstream errors', async () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.ZHIHU_ACCESS_SECRET;
  process.env.ZHIHU_ACCESS_SECRET = 'test-only-secret';
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.origin, 'https://developer.zhihu.com');
      assert.equal(url.searchParams.get('Query'), '学习编程');
      assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
      assert.match(options.headers['X-Request-Timestamp'], /^\d{10}$/);
      return { ok: true, json: async () => ({ Code: 0, Data: { Items: [] } }) };
    };
    assert.equal((await zhihuRequest('/api/v1/content/zhihu_search', { query: { Query: '学习编程' } })).Code, 0);
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(zhihuRequest('/v1/chat/completions'), /^Error: ZHIHU_HTTP_401$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.ZHIHU_ACCESS_SECRET;
    else process.env.ZHIHU_ACCESS_SECRET = originalSecret;
  }
});

test('public server exposes only frontend assets and validates API input', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '4273', ZHIHU_PROVIDER: 'http', ZHIHU_ACCESS_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited'); }), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('Startup timeout')), 5000); t.unref(); })]);
    for (const path of ['/', '/app.js', '/refinement.css', '/public/assets/single-roundtable.png']) assert.equal((await fetch('http://127.0.0.1:4273' + path)).status, 200, path);
    for (const path of ['/server.mjs', '/zhihu-client.mjs', '/.env', '/.git/config', '/deploy/kanshan.service', '/public/assets/../../server.mjs']) assert.equal((await fetch('http://127.0.0.1:4273' + path)).status, 404, path);
    const imageResponse = await fetch('http://127.0.0.1:4273/public/assets/single-roundtable.png');
    assert.equal(imageResponse.headers.get('cache-control'), 'public, max-age=3600');
    await imageResponse.arrayBuffer();
    assert.equal((await fetch('http://127.0.0.1:4273/app.js')).headers.get('cache-control'), 'no-store');
    assert.equal((await fetch('http://127.0.0.1:4273/api/roundtable?question=a')).status, 400);
    assert.equal((await fetch('http://127.0.0.1:4273/api/reply?message=a')).status, 400);
    assert.equal((await (await fetch('http://127.0.0.1:4273/api/health')).json()).configured, false);
  } finally {
    child.kill();
    await once(child, 'exit');
  }
});
