// Official API documentation: https://developer.zhihu.com/console/api/v3/docs
const origin = 'https://developer.zhihu.com';

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
