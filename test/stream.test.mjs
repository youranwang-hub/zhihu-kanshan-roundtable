import test from 'node:test';
import assert from 'node:assert/strict';
import { createSSEParser } from '../stream-utils.mjs';
import { streamZhihuReply } from '../zhihu-client.mjs';

test('SSE parser handles fragmented CRLF frames and ignores heartbeats', () => {
  const events = [];
  const parser = createSSEParser(event => events.push(event));
  for (const char of ': keep-alive\r\n\r\nevent: delta\r\ndata: first\r\ndata: second\r\n\r\n') parser.push(char);
  assert.deepEqual(events, [{ event: 'delta', data: 'first\nsecond' }]);
});

test('upstream stream preserves split UTF-8, omits reasoning, and detects incomplete/error streams', async () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.ZHIHU_ACCESS_SECRET;
  process.env.ZHIHU_ACCESS_SECRET = 'test-only-secret';
  const frame = choice => `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
  const content = frame({ delta: { reasoning_content: 'hidden' } }) + frame({ delta: { content: '你好🐻' } });
  function mock(text) {
    globalThis.fetch = async (_, options) => {
      assert.equal(JSON.parse(options.body).stream, true);
      return new Response(new ReadableStream({ start(controller) {
        for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      } }));
    };
  }
  try {
    mock(content + frame({ finish_reason: 'stop' }) + 'data: [DONE]\n\n');
    const deltas = [];
    assert.equal(await streamZhihuReply('test', delta => deltas.push(delta)), '你好🐻');
    assert.deepEqual(deltas, ['你好🐻']);
    mock(content);
    await assert.rejects(streamZhihuReply('test', () => {}), /INCOMPLETE/);
    mock('data: {"error":{"message":"private upstream detail"}}\n\n');
    await assert.rejects(streamZhihuReply('test', () => {}), /^Error: ZHIHU_STREAM_ERROR$/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.ZHIHU_ACCESS_SECRET;
    else process.env.ZHIHU_ACCESS_SECRET = originalSecret;
  }
});
