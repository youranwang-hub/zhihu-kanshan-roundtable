import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zhihuRequest, streamZhihuReply } from './zhihu-client.mjs';

const run = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const cli = process.env.ZHIHU_CLI_PATH || 'C:\\Users\\WX-WY\\AppData\\Local\\ZhihuCLI\\current\\zhihu-cli.exe';
const types = new Map([['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.png', 'image/png'], ['.gif', 'image/gif']]);
const plans = new Map();
const directApi = process.env.ZHIHU_PROVIDER === 'http' || Boolean(process.env.ZHIHU_ACCESS_SECRET);
const pendingPlans = new Map();
const cacheTtl = 30 * 60 * 1000;
let activeRequests = 0;
const publicFiles = new Set(['index.html', 'styles.css', 'refinement.css', 'app.js', 'stream-utils.mjs']);
types.set('.mjs', 'text/javascript; charset=utf-8');

function send(response, status, body, type = 'application/json; charset=utf-8', cache = 'no-store') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}
function plain(value = '') { return String(value ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

async function search(question) {
  const result = directApi
    ? await zhihuRequest('/api/v1/content/zhihu_search', { query: { Query: question, Count: '10' }, timeout: 30000 })
    : JSON.parse((await run(cli, ['search', 'zhihu', '--query', question, '--count', '10'], { timeout: 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })).stdout);
  if (result.Code !== 0) throw new Error(result.Message || 'SEARCH_FAILED');
  return (result.Data?.Items || []).filter((item) => item.Url && item.ContentText).slice(0, 9).map((item) => ({
    id: String(item.ContentID), title: plain(item.Title), excerpt: plain(item.ContentText).slice(0, 260),
    author: plain(item.AuthorName) || '知乎用户', url: item.Url, votes: Number(item.VoteUpCount || 0),
  }));
}
async function ask(prompt) {
  const result = directApi
    ? await zhihuRequest('/v1/chat/completions', { body: { model: 'zhida-fast-1p5', messages: [{ role: 'user', content: prompt }], stream: false } })
    : JSON.parse((await run(cli, ['answer', '--query', prompt, '--model', 'zhida-fast-1p5'], { timeout: 60000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })).stdout);
  const text = result.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('EMPTY_MODEL_RESPONSE');
  return text;
}
function jsonFrom(text) {
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('MODEL_JSON_INVALID');
  return JSON.parse(text.slice(start, end + 1));
}
function fallbackPlan(sources) {
  const names = ['基础与验证派', '实践与反馈派', '整合学习派'];
  return { positions: names.map((name, index) => ({ id: ['a', 'b', 'c'][index], name, stance: '基于本次检索结果，先从可验证的证据出发，再决定学习投入。', opening: sources[index]?.excerpt.slice(0, 120) || '暂未找到足够的相关来源。', counter: '请先说明你的判断依据，以及这一做法在哪些条件下可能失效。', closing: '保留自己的核心判断，同时把对方提出的限制纳入下一步行动。', sourceIds: sources.slice(index * 3, index * 3 + 3).map((item) => item.id) })) };
}
async function buildPlan(question, sources) {
  const compact = sources.map(({ id, title, excerpt }) => ({ id, title, excerpt: excerpt.slice(0, 180) }));
  const prompt = `你是“看山圆桌”的论证编辑。仅根据提供的知乎搜索摘要，为问题形成三种有实际分歧、但不虚构事实的观点。\n问题：${question}\n来源：${JSON.stringify(compact)}\n\n只返回合法 JSON，绝不使用 Markdown。schema：{"positions":[{"id":"a|b|c","name":"不超过8字","stance":"不超过38字","opening":"不超过90字，包含结论和理由","counter":"不超过90字，回应质疑时应强调的论证","closing":"不超过70字，承认一个边界并给建议","sourceIds":["仅使用给定id"]}]}。规则：三位必须分别为 a、b、c；每位至少引用一条 sourceIds；没有足够分歧时改写为不同条件下的取舍，不要编造对立。`;
  const result = jsonFrom(await ask(prompt));
  const validIds = new Set(sources.map((item) => item.id));
  if (!Array.isArray(result.positions) || result.positions.length !== 3) throw new Error('PLAN_SHAPE_INVALID');
  const positions = result.positions.map((item) => ({
    id: String(item.id), name: plain(item.name).slice(0, 12), stance: plain(item.stance).slice(0, 60), opening: plain(item.opening).slice(0, 140), counter: plain(item.counter).slice(0, 140), closing: plain(item.closing).slice(0, 110), sourceIds: [...new Set((item.sourceIds || []).map(String).filter((id) => validIds.has(id)))],
  }));
  if (new Set(positions.map((item) => item.id)).size !== 3 || positions.some((item) => !['a', 'b', 'c'].includes(item.id) || !item.name || !item.opening || !item.sourceIds.length)) throw new Error('PLAN_VALIDATION_FAILED');
  return { positions };
}
function replyPrompt(question, plan, sources, positionId, userMessage) {
  const position = plan.positions.find((item) => item.id === positionId);
  if (!position) throw new Error('POSITION_NOT_FOUND');
  const evidence = sources.filter((item) => position.sourceIds.includes(item.id)).map(({ title, excerpt }) => ({ title, excerpt }));
  const prompt = `你在看山圆桌中代表“${position.name}”。问题：${question}。用户质询：${userMessage}。你的既有立场：${position.stance}。可用知乎摘要：${JSON.stringify(evidence)}。请只用不超过120字回答：先直接回应用户，再说明理由，最后承认一个适用边界。不能虚构来源或事实。`;
  return prompt;
}
async function reply(question, plan, sources, positionId, userMessage) {
  return plain(await ask(replyPrompt(question, plan, sources, positionId, userMessage))).slice(0, 160);
}

const server = http.createServer(async (request, response) => {
 try {
  const url = new URL(request.url, 'http://127.0.0.1:4173');
  if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, JSON.stringify({ ok: true, source: directApi ? 'zhihu-http' : 'zhihu-cli-keychain', configured: directApi ? Boolean(process.env.ZHIHU_ACCESS_SECRET) : undefined }));
  if (url.pathname.startsWith('/api/')) {
    if (activeRequests >= 4) return send(response, 429, JSON.stringify({ ok: false, error: 'BUSY' }));
    activeRequests++;
    let released = false;
    const release = () => { if (!released) { released = true; activeRequests--; } };
    response.once('finish', release);
    response.once('close', release);
  }
  if (request.method === 'GET' && url.pathname === '/api/sources') {
    const question = (url.searchParams.get('question') || '').trim();
    if (question.length < 4 || question.length > 120) return send(response, 400, JSON.stringify({ ok: false, error: 'QUESTION_LENGTH_INVALID' }));
    try { return send(response, 200, JSON.stringify({ ok: true, question, sources: await search(question) })); }
    catch { console.error('ZHihu_SEARCH_UNAVAILABLE'); return send(response, 502, JSON.stringify({ ok: false, error: 'ZHihu_SEARCH_UNAVAILABLE', message: '暂时无法从知乎获取讨论。' })); }
  }
  if (request.method === 'GET' && url.pathname === '/api/roundtable') {
    const question = (url.searchParams.get('question') || '').trim();
    if (question.length < 4 || question.length > 120) return send(response, 400, JSON.stringify({ ok: false, error: 'QUESTION_LENGTH_INVALID' }));
    try {
      const cached = plans.get(question);
      if (cached && Date.now() - cached.createdAt < cacheTtl) return send(response, 200, JSON.stringify({ ok: true, question, ...cached }));
      if (!pendingPlans.has(question)) {
        const promise = (async () => {
          const sources = await search(question);
          if (!sources.length) throw new Error('NO_SOURCES');
          let generated = true;
          const plan = await buildPlan(question, sources).catch(() => { generated = false; return fallbackPlan(sources); });
          const data = { sources, plan, generated, createdAt: Date.now() };
          if (plans.size >= 100) plans.delete(plans.keys().next().value);
          plans.set(question, data);
          return data;
        })().finally(() => pendingPlans.delete(question));
        pendingPlans.set(question, promise);
      }
      return send(response, 200, JSON.stringify({ ok: true, question, ...await pendingPlans.get(question) }));
    } catch { console.error('ROUND_TABLE_UNAVAILABLE'); return send(response, 502, JSON.stringify({ ok: false, error: 'ROUND_TABLE_UNAVAILABLE', message: '暂时无法生成本场圆桌。' })); }
  }
  if (request.method === 'GET' && url.pathname === '/api/reply') {
    const question = (url.searchParams.get('question') || '').trim();
    const positionId = (url.searchParams.get('position') || '').trim();
    const userMessage = (url.searchParams.get('message') || '').trim();
    const cached = plans.get(question);
    if (!cached || !['a', 'b', 'c'].includes(positionId) || !userMessage || userMessage.length > 1000 || question.length > 120) return send(response, 400, JSON.stringify({ ok: false, error: 'REPLY_INPUT_INVALID' }));
    if (url.searchParams.get('stream') === '1' && directApi) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
      response.flushHeaders();
      const abort = new AbortController();
      response.once('close', () => abort.abort());
      const emit = (event, data) => { if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      const heartbeat = setInterval(() => { if (!response.destroyed) response.write(': keep-alive\n\n'); }, 10000);
      let output = '';
      try {
        emit('status', { message: 'thinking' });
        await streamZhihuReply(replyPrompt(question, cached.plan, cached.sources, positionId, userMessage), delta => {
          const part = delta.slice(0, Math.max(0, 500 - output.length));
          output += part;
          if (part) emit('delta', { text: part });
        }, abort.signal);
        emit('done', { reply: output });
      } catch { emit('error', { message: '回应暂时中断，请稍后重试。' }); }
      finally { clearInterval(heartbeat); response.end(); }
      return;
    }
    try { return send(response, 200, JSON.stringify({ ok: true, reply: await reply(question, cached.plan, cached.sources, positionId, userMessage) })); }
    catch { console.error('REPLY_UNAVAILABLE'); return send(response, 502, JSON.stringify({ ok: false, error: 'REPLY_UNAVAILABLE' })); }
  }
  if (request.method !== 'GET') return send(response, 405, JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }));
  const relative = url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^[/\\]+/, '');
  if (!publicFiles.has(relative) && !/^public[\\/]assets[\\/][\w-]+\.(png|gif)$/.test(relative)) return send(response, 404, JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
  const target = path.join(root, relative);
  if (!target.startsWith(root) || !existsSync(target)) return send(response, 404, JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
  const imageAsset = ['.png', '.gif'].includes(path.extname(target));
  return send(response, 200, await readFile(target), types.get(path.extname(target)) || 'application/octet-stream', imageAsset ? 'public, max-age=3600' : 'no-store');
 } catch {
   if (!response.headersSent) send(response, 500, JSON.stringify({ ok: false, error: 'INTERNAL_ERROR' }));
   else response.end();
 }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => process.stdout.write(`看山圆桌: http://127.0.0.1:${port}/\n`));
