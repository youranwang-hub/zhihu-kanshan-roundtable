// Official API documentation: https://developer.zhihu.com/console/api/v3/docs
import { createSSEParser } from './stream-utils.mjs';
const origin = 'https://developer.zhihu.com';

export async function streamZhihuReply(prompt, onDelta, signal) {
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) throw new Error('ZHIHU_SECRET_MISSING');
  const response = await fetch(`${origin}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'zhida-fast-1p5', messages: [{ role: 'user', content: prompt }], stream: true }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    redirect: 'error',
  });
  if (!response.ok || !response.body) throw new Error('ZHIHU_STREAM_UNAVAILABLE');
  let ended = false;
  let text = '';
  const parser = createSSEParser(({ data }) => {
    if (data === '[DONE]') { ended = true; return; }
    const packet = JSON.parse(data);
    const choice = packet.choices?.[0];
    if (packet.error || choice?.finish_reason === 'error') throw new Error('ZHIHU_STREAM_ERROR');
    if (choice?.finish_reason === 'stop') ended = true;
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta) { text += delta; onDelta(delta); }
  });
  const decoder = new TextDecoder();
  for await (const chunk of response.body) parser.push(decoder.decode(chunk, { stream: true }));
  parser.push(decoder.decode());
  if (!ended || !text.trim()) throw new Error('ZHIHU_STREAM_INCOMPLETE');
  return text;
}

export async function zhihuRequest(endpoint, { query, body, timeout = 60000 } = {}) {
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) throw new Error('ZHIHU_SECRET_MISSING');
  const url = new URL(endpoint, origin);
  if (query) url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`ZHIHU_HTTP_${response.status}`);
  const result = await response.json();
  if (result.error || (result.Code !== undefined && result.Code !== 0)) throw new Error('ZHIHU_API_ERROR');
  return result;
}
