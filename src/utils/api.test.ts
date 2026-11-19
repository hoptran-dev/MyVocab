import test from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl, normalizeApiBase, normalizeBasePath, parseApiJson, STATIC_HOST_AI_NOTICE } from './api';

test('normalizeBasePath handles root, repo subpaths, double slashes, and relative paths', () => {
  assert.equal(normalizeBasePath(undefined), '/');
  assert.equal(normalizeBasePath('/'), '/');
  assert.equal(normalizeBasePath('//'), '/');
  assert.equal(normalizeBasePath('/my-vocab'), '/my-vocab/');
  assert.equal(normalizeBasePath('/my-vocab/'), '/my-vocab/');
  assert.equal(normalizeBasePath('my-vocab'), '/my-vocab/');
  assert.equal(normalizeBasePath('./'), './');
});

test('normalizeApiBase and apiUrl join external backend URLs cleanly', () => {
  assert.equal(normalizeApiBase('https://api.example.com///'), 'https://api.example.com');
  assert.equal(apiUrl('/api/dict/stats', ''), '/api/dict/stats');
  assert.equal(apiUrl('api/ai/extract-passage', 'https://api.example.com/'), 'https://api.example.com/api/ai/extract-passage');
});

test('parseApiJson detects static host HTML 404 and returns friendly Vietnamese notice', async () => {
  const html404 = new Response('<!doctype html><html><body>404</body></html>', {
    status: 404,
    headers: { 'content-type': 'text/html' },
  });
  await assert.rejects(() => parseApiJson(html404, 'Fallback error'), {
    message: STATIC_HOST_AI_NOTICE,
  });

  const okJson = new Response(JSON.stringify({ ok: true, count: 5 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const parsed = await parseApiJson<{ ok: boolean; count: number }>(okJson, 'Err');
  assert.deepEqual(parsed, { ok: true, count: 5 });
});
