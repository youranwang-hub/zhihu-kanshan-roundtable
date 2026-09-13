import { createSSEParser } from './stream-utils.mjs';
const seats = document.querySelectorAll('.seat');
const hostMessage = document.querySelector('#host-message');
const hostImage = document.querySelector('#host-image');
const userSeat = document.querySelector('#user-seat');
const userSeatSubtitle = document.querySelector('#user-seat-subtitle');
const focusButton = document.querySelector('#focus-mode');
const conversation = document.querySelector('#conversation');
const composer = document.querySelector('#composer');
const userInput = document.querySelector('#user-input');
const sendButton = document.querySelector('#send-button');
const nextRound = document.querySelector('#next-round');
const roundNote = document.querySelector('#round-note');
const composerHint = document.querySelector('#composer-hint');
const roundLabel = document.querySelector('.round-label');
const roundSteps = document.querySelectorAll('.round-step');
const drawer = document.querySelector('#evidence-drawer');
const roundGuide = document.querySelector('#round-guide');
const guideStep = document.querySelector('#guide-step');
const guideText = document.querySelector('#guide-text');
const guideTips = document.querySelector('#guide-tips');
const toastStack = document.querySelector('#toast-stack');

const debateLayout = document.querySelector('.debate-layout');
const mentionPicker = document.querySelector('#mention-picker');
const mentionChips = document.querySelectorAll('.mention-chip');
const refreshButton = document.querySelector('#refresh-sources');
let round = 1;
let userHasSpoken = false;
let userHasQuestioned = false;
let userHasSummarized = false;
let currentMode = 'participant';

let lines = {
  a: '基础优先派正在陈述：理解原理，才有能力验证与修正工具的输出。',
  b: '工具实践派正在陈述：真实任务带来的反馈，能让学习不脱离实际。',
  c: '双轨整合派正在陈述：用项目发现缺口，再系统地补上对应基础。',
};
let roleNames = { a: '基础优先派', b: '工具实践派', c: '双轨整合派' };
let debatePlan = null;
let evidence = {
  a: { title: '基础优先派 · 关键依据', claim: '理解程序运行机制，是验证、调试和修正 AI 输出的前提。', boundary: '当任务边界清晰、结果可快速验证时，工具实践能显著提升起步效率。', sources: [['AI 时代还需要系统学编程基础吗？', '基础能力决定了面对陌生问题时的排查和迁移能力。'], ['用 AI 写代码会削弱程序员能力吗？', '生成代码后仍需理解依赖、边界条件与异常路径。']] },
  b: { title: '工具实践派 · 关键依据', claim: '尽早进入真实任务，才能让知识学习围绕真实问题发生。', boundary: '若只追求快速完成而不复盘，项目经验会停留在“会用”而非“会判断”。', sources: [['初学编程应该先做项目还是先打基础？', '项目会自然暴露知识缺口，形成主动学习动机。'], ['AI 编程对新人最大的帮助是什么？', '完成第一个可运行的作品，有助于获得持续学习的反馈。']] },
  c: { title: '双轨整合派 · 关键依据', claim: '项目与基础应并行：以任务发现缺口，再针对性补足原理。', boundary: '需要可执行的复盘机制，否则“并行”容易变成两头都浅尝辄止。', sources: [['如何平衡刷题、项目和 AI 工具学习？', '建议用项目周报记录每次遇到的概念缺口。'], ['AI 时代的编程学习路径应该如何调整？', '让工具承担重复劳动，把时间留给理解和验证。']] },
};

let busy = false;
let loadingPlan = false;
let initialPosition = '';
let finalPosition = '';
let completed = false;
let skipSpeech = false;
const demoOpenings = Object.fromEntries([...document.querySelectorAll('.message[data-seat]')].map(article => [article.dataset.seat, article.querySelector('p').textContent]));
const speechControl = document.createElement('button');
speechControl.type = 'button';
speechControl.className = 'speech-control is-hidden';
speechControl.textContent = '直接显示本轮全文';
roundGuide.append(speechControl);
speechControl.addEventListener('click', () => { skipSpeech = true; speechControl.classList.add('is-hidden'); });

const waitingCard = document.createElement('section');
waitingCard.className = 'kanshan-waiting is-hidden';
waitingCard.setAttribute('aria-label', '和刘看山一起等开场');
waitingCard.innerHTML = '<img src="public/assets/kanshan-thinking.gif" alt="刘看山正在思考"><div><span class="waiting-caption">看山的开场时间</span><h3>好问题，值得多听几种声音。</h3><p class="waiting-thought" aria-live="polite"></p><div class="waiting-actions"><button type="button">换个思考角度 ↻</button><small class="waiting-elapsed"></small></div></div>';
roundGuide.after(waitingCard);
let waitingTimer;
const thoughts = [
  '先在心里选一边：什么证据，会让你改变现在的想法？',
  '如果对方也有道理，最可能是哪一点？',
  '把“对不对”换成“适合谁”，答案会不会变？',
  '经验不同的人，可能在回答同一个问题的不同部分。',
  '等会儿挑一个最想追问的观点，我帮你把话递过去。',
];
let thoughtIndex = 0;
function nextThought() {
  const thought = thoughts[thoughtIndex++ % thoughts.length];
  waitingCard.querySelector('.waiting-thought').textContent = thought;
  hostMessage.textContent = thought;
  hostImage.src = thoughtIndex % 2 ? 'public/assets/kanshan-thinking.gif' : 'public/assets/kanshan-wave.gif';
  waitingCard.querySelector('img').src = hostImage.src;
}
waitingCard.querySelector('button').addEventListener('click', nextThought);
function startWaiting() {
  clearInterval(waitingTimer);
  const started = Date.now();
  waitingCard.classList.remove('is-hidden');
  document.querySelector('.roundtable-scene').classList.add('is-searching');
  setSeatSpeaking(null);
  nextThought();
  waitingCard.querySelector('.waiting-elapsed').textContent = '正在检索与整理';
  let ticks = 0;
  waitingTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    waitingCard.querySelector('.waiting-elapsed').textContent = `已等待 ${seconds} 秒`;
    if (++ticks % 7 === 0) nextThought();
    if (seconds >= 30) waitingCard.querySelector('h3').textContent = '还在整理，感谢你等我一下。';
  }, 1000);
}
function stopWaiting() {
  clearInterval(waitingTimer);
  waitingCard.classList.add('is-hidden');
  waitingCard.querySelector('h3').textContent = '好问题，值得多听几种声音。';
  document.querySelector('.roundtable-scene').classList.remove('is-searching');
}

// Pace cached/validated speeches, and smooth real network deltas with the same renderer.
function createWriter(article, id) {
  const paragraph = article.querySelector('p');
  let buffer = '';
  let shown = 0;
  let finished = false;
  let resolve;
  let speaking = false;
  const done = new Promise(r => { resolve = r; });
  paragraph.textContent = '';
  article.classList.add('is-streaming');
  article.setAttribute('aria-busy', 'true');
  const tick = () => {
    const follow = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 90;
    const instant = skipSpeech || matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden;
    shown = Math.min(buffer.length, instant ? buffer.length : shown + 2);
    if (buffer && !speaking) { speaking = true; setSeatSpeaking(id); hostMessage.textContent = `${roleNames[id]}正在发言，先听听这一席的理由。`; hostImage.src = 'public/assets/kanshan-wave.gif'; }
    paragraph.textContent = buffer.slice(0, shown);
    if (follow) conversation.scrollTop = conversation.scrollHeight;
    if (finished && shown === buffer.length) {
      clearInterval(timer);
      article.classList.remove('is-streaming');
      article.setAttribute('aria-busy', 'false');
      resolve();
    }
  };
  const timer = setInterval(tick, 28);
  return {
    push(text) { buffer += text; },
    async finish() { finished = true; tick(); await done; },
  };
}
async function speak(article, text, id) {
  const writer = createWriter(article, id);
  writer.push(text);
  await writer.finish();
}
async function playOpenings() {
  skipSpeech = false;
  speechControl.classList.remove('is-hidden');
  for (const id of ['a', 'b', 'c']) {
    const article = document.querySelector(`.message[data-seat="${id}"]`);
    article.classList.remove('is-hidden');
    await speak(article, debatePlan?.positions.find(p => p.id === id)?.opening || demoOpenings[id] || lines[id], id);
  }
  speechControl.classList.add('is-hidden');
  setSeatSpeaking(null);
}

function toast(message, tone = 'host') {
  if (!toastStack) return;
  const node = document.createElement('div');
  node.className = `toast tone-${tone}`;
  node.textContent = message;
  toastStack.append(node);
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 320);
  }, 2600);
}

function setSeatSpeaking(id, state = 'speaking') {
  seats.forEach((seat) => {
    const isThis = seat.dataset.seat === id;
    seat.classList.toggle('is-speaking', state === 'speaking' && isThis);
    seat.classList.toggle('is-thinking', state === 'thinking' && isThis);
    seat.setAttribute('aria-pressed', String(state === 'speaking' && isThis));
    const character = seat.querySelector('.character');
    if (character) {
      const target = state === 'thinking' && isThis ? 'thinking' : (state === 'speaking' && isThis ? 'speaking' : 'default');
      character.src = character.dataset[target];
    }
    const statusEl = seat.querySelector('.seat-status');
    if (statusEl) statusEl.textContent = state === 'thinking' && isThis ? '● 正在思考' : '● 正在发言';
  });
  if (id && lines[id]) {
    hostMessage.textContent = lines[id];
    hostImage.src = state === 'thinking' ? 'public/assets/kanshan-thinking.gif' : 'public/assets/kanshan-wave.gif';
  }
}

function updateRoundGuide() {
  const observer = currentMode === 'observer';
  guideStep.textContent = ['01 · 听见不同立场', '02 · 把问题问清楚', '03 · 带走自己的判断'][round - 1];
  guideText.textContent = completed ? '讨论已结束。点击引用可继续阅读原文。' : loadingPlan ? '刘看山正在整理知乎来源，请稍候。' : busy ? '嘉宾正在回应，稍后可继续追问。' : round === 1 ? (observer ? '先听三方陈述，准备好后进入质询。' : '初始观点已记录。读完三方陈述，再提出你的疑问。') : round === 2 ? (observer ? '选择一位嘉宾追问，也可以直接看总结。' : '选择一位嘉宾，提出一个追问后进入总结。') : (observer ? '看看各方保留的判断与边界，生成纪要带走。' : userHasSummarized ? '最终观点已记录，可以生成圆桌纪要。' : '写下现在的判断：你坚持什么，又改变了什么？');
  guideTips.replaceChildren();
  roundGuide.dataset.round = String(round);
  composer.classList.toggle('is-hidden', completed || round === 1 || (observer && round === 3));
  mentionPicker.classList.toggle('is-hidden', round !== 2);
  userInput.disabled = busy || loadingPlan || completed;
  sendButton.disabled = busy || loadingPlan || completed;
  mentionChips.forEach(chip => { chip.disabled = busy || loadingPlan || completed; });
  refreshButton.disabled = busy || loadingPlan || completed || round !== 1;
  nextRound.disabled = busy || loadingPlan || completed || (round === 2 && !observer && !userHasQuestioned) || (round === 3 && !observer && !userHasSummarized);
  nextRound.textContent = completed ? '本场讨论已完成' : round === 1 ? '进入质询 →' : round === 2 ? '进入总结 →' : '生成圆桌纪要';
  userSeat.classList.toggle('is-speaking', !observer && !busy && !completed && round > 1);
  document.querySelector('.seat-legend').textContent = observer ? '三种立场 · 你在旁听' : '三种立场 · 你的第四席';
  document.querySelector('.roundtable-scene').classList.toggle('is-observer', observer);
  hostImage.src = busy || loadingPlan ? 'public/assets/kanshan-thinking.gif' : 'public/assets/kanshan-wave.gif';
}

function selectSeat(id) { if (busy || loadingPlan) return; setSeatSpeaking(id, 'speaking'); }
function addMessage(name, text, type = 'user') {
  const article = document.createElement('article');
  article.className = `message message-${type}`;
  article.innerHTML = '<span class="message-name"></span><p></p>';
  article.querySelector('.message-name').textContent = name;
  article.dataset.round = String(round);
  article.querySelector('p').textContent = text;
  conversation.append(article);
  conversation.scrollTop = conversation.scrollHeight;
  return article;
}
function updateRoundUI() {
  roundLabel.textContent = ['第 1 / 3 回合 · 立场陈述', '第 2 / 3 回合 · 交叉质询', '第 3 / 3 回合 · 立场总结'][round - 1];
  roundSteps.forEach((step) => {
    const value = Number(step.dataset.round);
    step.classList.toggle('is-current', value === round);
    step.classList.toggle('is-complete', value < round);
  });
}
function startSecondRound() {
  round = 2;
  updateRoundUI();
  addMessage('刘看山', `第二回合开始。点击下方任一 @角色 按钮，即可向其提出追问。`, 'host');
  roundNote.textContent = '请至少 @ 一位角色，提出一个具体的追问、反例或批评。';
  userInput.placeholder = `从下方选择 @ 角色，然后补充你的具体追问……`;
  composerHint.textContent = '第二回合 · 点击 @ 角色';
  sendButton.textContent = '插话质询';
  userInput.disabled = false;
  sendButton.disabled = false;
  nextRound.textContent = '完成质询后进入总结';
  nextRound.disabled = true;
  hostMessage.textContent = '现在进入交叉质询：理解对方最强的论据，再提出你的问题。';
  if (mentionPicker) mentionPicker.classList.remove('is-hidden');
  updateRoundGuide();
  userInput.focus();
}
async function startThirdRound() {
  busy = true;
  skipSpeech = false;
  round = 3;
  updateRoundUI();
  addMessage('刘看山', '第三回合开始。请每一席总结：仍坚持什么、承认什么边界、接下来如何行动。', 'host');
  updateRoundGuide();
  speechControl.classList.remove('is-hidden');
  for (const id of ['a', 'b', 'c']) {
    await speak(addMessage(roleNames[id], '', 'guest'), debatePlan?.positions.find(p => p.id === id)?.closing || evidence[id].boundary, id);
  }
  speechControl.classList.add('is-hidden');
  setSeatSpeaking(null);
  busy = false;
  roundNote.textContent = '写下你讨论后的最终立场，刘看山会将它与初始观点并列收录。';
  userInput.placeholder = '讨论后，我的最终立场是……';
  composerHint.textContent = '第三回合 · 更新最终立场';
  sendButton.textContent = '确认最终立场';
  nextRound.textContent = '生成圆桌纪要';
  nextRound.disabled = true;
  hostMessage.textContent = currentMode === 'observer' ? '听过不同的理由，哪些值得带走？我把各方的判断整理在右侧。' : '请把争论变成自己的判断：你保留了什么，又改变了什么？';
  if (mentionPicker) mentionPicker.classList.add('is-hidden');
  updateRoundGuide();
  userInput.focus();
}
function findMention(text) {
  return Object.entries(roleNames).find(([, name]) => text.includes(`@${name}`));
}
async function replyToQuestion(target, userMessage) {
  busy = true; updateRoundGuide();
  const replies = {
    a: '即使 AI 能生成测试，也需要人判断测试是否覆盖了真正的边界条件。',
    b: '不必等“学完”再做。把每次卡住的地方变成复盘清单，会更有效。',
    c: '把复盘设为项目的固定步骤：功能完成、验证结果、补齐原理，三者缺一不可。',
  };
  const names = roleNames;
  skipSpeech = false;
  setSeatSpeaking(target, 'thinking');
  hostMessage.textContent = `${names[target]}正在基于知乎证据组织回应……`;
  let response = debatePlan?.positions.find((item) => item.id === target)?.counter || replies[target];
  const article = addMessage(names[target], '', 'guest');
  const writer = createWriter(article, target);
  let received = false;
  try {
    const question = document.querySelector('#topic-question').textContent.trim();
    const result = await fetch(`/api/reply?stream=1&question=${encodeURIComponent(question)}&position=${target}&message=${encodeURIComponent(userMessage)}`, { signal: AbortSignal.timeout(85000) });
    if (!result.ok) throw new Error('REPLY_FAILED');
    if (result.headers.get('content-type')?.includes('text/event-stream')) {
      let complete = false;
      const parser = createSSEParser(({ event, data }) => {
        const packet = JSON.parse(data);
        if (event === 'error') throw new Error('STREAM_INTERRUPTED');
        if (event === 'delta' && packet.text) { received = true; writer.push(packet.text); }
        if (event === 'done') complete = true;
      });
      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        if (!complete || !received) throw new Error('STREAM_INCOMPLETE');
      } finally { await reader.cancel().catch(() => {}); }
    } else {
      const payload = await result.json();
      if (!payload.ok || !payload.reply) throw new Error('REPLY_FAILED');
      received = true; writer.push(payload.reply);
    }
  } catch {
    writer.push(received ? '\n（连接中断，以上为已收到的内容，可重新追问。）' : '（预设回应）' + response);
  }
  await writer.finish();
  busy = false;
  userHasQuestioned = true;
  setSeatSpeaking(null);
  hostMessage.textContent = '这席的回应已送达。你可以继续追问，或看看大家的总结。';
  updateRoundGuide();
}

seats.forEach((seat) => seat.addEventListener('click', () => selectSeat(seat.dataset.seat)));
roundSteps.forEach((step) => step.addEventListener('click', () => {
  const target = Number(step.dataset.round);
  if (target === round || target > round) return; // 只允许回看已完成的回合
  const hostMsgs = conversation.querySelectorAll('.message-host');
  const firstOfRound = conversation.querySelector(`[data-round="${target}"]`) || (target === 1 ? conversation.firstElementChild : null);
  if (firstOfRound) firstOfRound.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast(`正在回看第 ${target} 回合 · 当前仍在第 ${round} 回合`, 'host');
}));
document.querySelector('#toggle-host').addEventListener('click', () => {
  hostMessage.textContent = '刘看山提醒：先理解对方最强的论据，再提出你的质疑。';
  hostImage.src = 'public/assets/kanshan-wave.gif';
});
focusButton.addEventListener('click', () => {
  const scene = document.querySelector('.roundtable-scene');
  scene.classList.toggle('focus-on');
  focusButton.textContent = scene.classList.contains('focus-on') ? '退出聚焦' : '聚焦发言者';
});
userSeat.addEventListener('click', () => {
  if (currentMode === 'observer' && round === 1) {
    hostMessage.textContent = '你是旁观者，第一回合不开放发言。进入第二回合后可 @ 角色质询。';
    return;
  }
  userInput.focus();
  hostMessage.textContent = '你的席位已准备好。请先写下你的观点，刘看山会把它传达到圆桌。';
  userSeat.classList.add('is-ready');
});
document.querySelectorAll('.citation').forEach((button) => button.addEventListener('click', () => {
  const item = evidence[button.dataset.evidence];
  document.querySelector('#drawer-title').textContent = item.title;
  document.querySelector('#drawer-claim').textContent = item.claim;
  document.querySelector('#drawer-boundary-text').textContent = item.boundary;
  document.querySelector('#drawer-sources').replaceChildren(...item.sources.map(([title, summary, url]) => {
    const card = document.createElement('article');
    card.className = 'source-card';
    const heading = document.createElement('h4');
    const excerpt = document.createElement('p');
    const link = document.createElement('a');
    heading.textContent = title;
    excerpt.textContent = summary;
    link.textContent = '查看知乎原回答 ↗';
    link.href = url || '#';
    if (url) { link.target = '_blank'; link.rel = 'noreferrer'; }
    card.append(heading, excerpt, link);
    return card;
  }));
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
}));
document.querySelector('#close-drawer').addEventListener('click', () => {
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
});
function applyPlan(payload) {
  debatePlan = payload.plan;
  roleNames = Object.fromEntries(payload.plan.positions.map((item) => [item.id, item.name]));
  lines = Object.fromEntries(payload.plan.positions.map((item) => [item.id, item.opening]));
  evidence = Object.fromEntries(payload.plan.positions.map((position) => {
    const sources = payload.sources.filter((source) => position.sourceIds.includes(source.id));
    return [position.id, { title: `${position.name} · 知乎真实依据`, claim: position.stance, boundary: '此立场仅代表本次检索中被引用的观点与条件，不代表唯一正确答案。', sources: sources.map((source) => [source.title, `${source.author} · ${source.excerpt}`, source.url]) }];
  }));
  payload.plan.positions.forEach((position) => {
    const message = document.querySelector(`.message[data-seat="${position.id}"]`);
    message.querySelector('.message-name').textContent = position.name;
    message.querySelector('p').textContent = '';
    const citation = message.querySelector('.citation');
    citation.textContent = `知乎真实回答 ${evidence[position.id].sources.length} 篇`;
    const seat = document.querySelector(`.seat[data-seat="${position.id}"]`);
    seat.querySelector('.seat-card strong').textContent = position.name;
    seat.querySelector('.seat-card small').textContent = position.stance.slice(0, 14);
    seat.querySelector('.seat-card em').textContent = `引用 ${evidence[position.id].sources.length} 篇知乎回答`;
  });
  // 同步更新 @ 按钮上的角色名
  if (mentionChips && mentionChips.length) {
    mentionChips.forEach((chip) => {
      const target = chip.dataset.target;
      const name = roleNames[target];
      if (name) chip.lastChild.textContent = name;
    });
  }
  updateRoundGuide();
}

async function refreshZhihuSources(silent = false) {
  if (loadingPlan || busy || round !== 1) return;
  const question = document.querySelector('#topic-question').textContent.trim();
  if (!question) return;
  loadingPlan = true; updateRoundGuide();
  document.querySelectorAll('.message[data-seat]').forEach(article => { article.classList.add('is-hidden'); article.querySelector('p').textContent = ''; });
  startWaiting();
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.textContent = '正在检索…';
  }
  if (!silent) {
    hostMessage.textContent = `正在从知乎检索与"${truncate(question, 18)}"相关的真实讨论……`;
  }
  try {
    const response = await fetch(`/api/roundtable?question=${encodeURIComponent(question)}`, { signal: AbortSignal.timeout(100000) });
    const payload = await response.json();
    if (!response.ok || !payload.ok || payload.sources.length === 0) throw new Error('NO_SOURCES');
    applyPlan(payload);
    stopWaiting();
    guideText.textContent = '来源已就绪，三位嘉宾依次开场。';
    await playOpenings();
    hostMessage.textContent = `刘看山已从知乎召集 ${payload.sources.length} 条公开讨论，并整理出三种可讨论的立场。`;
    addMessage('刘看山', `已基于 ${payload.sources.length} 条知乎公开回答更新本场立场与论据。`, 'host');
    toast(`已自动载入 ${payload.sources.length} 条知乎真实依据`, 'host');
  } catch (error) {
    stopWaiting();
    const fallbackNotice = debatePlan ? '刷新暂时不可用，继续使用本场已加载的资料。' : '知乎搜索暂时不可用；当前继续使用本地演示资料。';
    hostMessage.textContent = fallbackNotice;
    addMessage('刘看山', fallbackNotice, 'host');
    toast(fallbackNotice, 'host');
    guideText.textContent = '正在用现有资料开场。';
    await playOpenings();
  } finally {
    stopWaiting();
    loadingPlan = false;
    updateRoundGuide();
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = '刷新知乎来源';
    }
  }
}

if (refreshButton) {
  refreshButton.addEventListener('click', () => refreshZhihuSources(true));
}
function truncate(text, max = 18) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}
composer.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy || loadingPlan || completed) return;
  const text = userInput.value.trim();
  if (!text) { roundNote.textContent = '先写下一句话，让刘看山知道你的想法。'; return; }
  if (round === 1) {
    addMessage('你的初始立场', text);
    userHasSpoken = true;
    userSeat.classList.add('is-ready');
    if (userSeatSubtitle) userSeatSubtitle.textContent = truncate(text, 16);
    hostMessage.textContent = '你的立场已入席。现在请听完其他席位的论据，再进入交叉质询。';
    roundNote.textContent = '你的初始立场已记录。准备好后，进入第二回合质询。';
    nextRound.disabled = false;
    toast('初始立场已记录', 'user');
  } else if (round === 2) {
    const mention = findMention(text);
    if (!mention) { roundNote.textContent = `请先点击下方 @${roleNames.a} / @${roleNames.b} / @${roleNames.c} 任一按钮，再补充你的具体追问。`; return; }
    addMessage('你 · 交叉质询', text);
    userHasQuestioned = true;
    nextRound.disabled = false;
    roundNote.textContent = `问题已送达 ${mention[1]}。对方正在回应；你可以继续追问，或进入第三回合总结。`;
    updateRoundGuide({ mentioned: mention[1] });
    toast(`已向 ${mention[1]} 发出质询`, 'user');
    replyToQuestion(mention[0], text);
  } else {
    addMessage('你的最终立场', text);
    userHasSummarized = true;
    finalPosition = text;
    nextRound.disabled = false;
    roundNote.textContent = '最终立场已记录。圆桌纪要将呈现你的观点变化与延伸阅读。';
    if (userSeatSubtitle) userSeatSubtitle.textContent = `最终：${truncate(text, 12)}`;
    toast('最终立场已记录', 'user');
  }
  userInput.value = '';
  updateRoundGuide();
});
nextRound.addEventListener('click', () => {
  if (busy || loadingPlan || completed) return;
  if (round === 1) startSecondRound();
  else if (round === 2 && (userHasQuestioned || currentMode === 'observer')) startThirdRound();
  else if (round === 3 && (userHasSummarized || currentMode === 'observer')) {
    addMessage('刘看山 · 圆桌纪要', Object.entries(roleNames).map(([id, name]) => `${name}：${debatePlan?.positions.find(p => p.id === id)?.closing || evidence[id].claim}`).join('\n\n'), 'host');
    if (currentMode === 'participant') addMessage('我的观点变化', `最初：${initialPosition}\n\n现在：${finalPosition}`, 'user');
    completed = true;
    hostMessage.textContent = '谢谢你把不同的声音听完。带着自己的判断，继续探索吧。';
    setSeatSpeaking(null);
    updateRoundGuide();
  }
});

const onboarding = document.querySelector('#onboarding');
const questionStep = document.querySelector('#question-step');
const modeStep = document.querySelector('#mode-step');
const initialViewForm = document.querySelector('#initial-view-form');
const questionInput = document.querySelector('#question-input');

function setQuestion(question) {
  document.querySelector('#topic-question').textContent = question;
}
function enterDebate(mode, initialView = '') {
  currentMode = mode;
  initialPosition = initialView;
  onboarding.classList.add('is-hidden');
  document.querySelector('.topbar').classList.remove('is-hidden');
  document.querySelector('.debate-layout').classList.remove('is-hidden');
  document.querySelector('.mode-badge').textContent = mode === 'participant' ? '置身事内' : '置身事外';
  if (mentionPicker) mentionPicker.classList.add('is-hidden');
  if (mode === 'participant') {
    userHasSpoken = true;
    addMessage('你的初始立场', initialView);
    userSeat.classList.add('is-ready');
    if (userSeatSubtitle) userSeatSubtitle.textContent = truncate(initialView, 16);
    roundNote.textContent = '你的初始立场已记录。听完各方陈述后，可进入第二回合质询。';
    nextRound.disabled = false;
  } else {
    userInput.disabled = true;
    sendButton.disabled = true;
    userInput.placeholder = '第二回合开放插话与 @ 角色质询。';
    roundNote.textContent = '你正在旁听第一回合。进入第二回合后可随时插话、@ 角色追问。';
    nextRound.disabled = false;
    nextRound.textContent = '进入第二回合质询';
  }
  updateRoundUI();
  updateRoundGuide();
  // 自动刷新知乎来源（无需点击按钮）
  setTimeout(() => userInput.focus(), 200);
  return refreshZhihuSources();
}
document.querySelector('#question-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (question.length < 4) { questionInput.focus(); return; }
  setQuestion(question);
  questionStep.classList.add('is-hidden');
  modeStep.classList.remove('is-hidden');
});
document.querySelector('#back-to-question').addEventListener('click', () => {
  modeStep.classList.add('is-hidden');
  initialViewForm.classList.add('is-hidden');
  document.querySelector('.mode-options').classList.remove('is-hidden');
  questionStep.classList.remove('is-hidden');
});
document.querySelector('#observer-mode').addEventListener('click', () => enterDebate('observer'));
document.querySelector('#participant-mode').addEventListener('click', () => {
  document.querySelector('.mode-options').classList.add('is-hidden');
  initialViewForm.classList.remove('is-hidden');
  document.querySelector('#initial-view-input').focus();
});
initialViewForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const initialView = document.querySelector('#initial-view-input').value.trim();
  if (!initialView) { document.querySelector('#initial-view-input').focus(); return; }
  enterDebate('participant', initialView);
});

// Dev demo: ?demo=1 直接进入辩论页（生成截图用）
const params = new URLSearchParams(location.search);
if (params.get('demo') === '1') {
  const sample = params.get('q') || 'AI 编程工具普及后，初学者还应系统学习编程基础吗？';
  setQuestion(sample);
  onboarding.classList.add('is-hidden');
  document.querySelector('.topbar').classList.remove('is-hidden');
  document.querySelector('.debate-layout').classList.remove('is-hidden');
  const opening = enterDebate(params.get('mode') === 'observer' ? 'observer' : 'participant', '先用 AI 完成项目，再针对项目里卡壳的地方补基础。');
  const target = Number(params.get('round')) || 1;
  opening.then(() => { if (target >= 2) {
    startSecondRound();
    if (target >= 3) startThirdRound();
  } });
}

// 进入页面即初始化引导卡（圆桌未开启前不展示）
updateRoundGuide();

/* ====== @ 提及按钮：点击插入 @角色名 到输入框 ====== */
function initMentionPicker() {
  if (!mentionChips.length || !userInput) return;
  mentionChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const target = chip.dataset.target;
      const name = roleNames[target];
      if (!name) return;
      const tag = `@${name} `;
      const current = userInput.value;
      const start = userInput.selectionStart ?? current.length;
      const end = userInput.selectionEnd ?? current.length;
      // 如果光标前已有 @角色名 则不重复插入
      const before = current.slice(0, start);
      if (before.endsWith(tag.trim())) {
        userInput.focus();
        return;
      }
      userInput.value = current.slice(0, start) + tag + current.slice(end);
      const cursor = start + tag.length;
      userInput.setSelectionRange(cursor, cursor);
      userInput.focus();
      roundNote.textContent = `已为你插入 @${name}。请补充具体的追问内容。`;
      toast(`已插入 @${name}`, 'user');
    });
  });
}

initMentionPicker();
