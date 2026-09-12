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

const GUIDE_CONTENT = {
  1: {
    step: '第 1 回合 · 立场陈述',
    text: '先向三位嘉宾亮明你的立场，再听他们各自的陈述。',
    tips: [
      () => `✍️ 在下方输入框写下你的<b>初始观点</b>，然后点击"发表立场"。`,
      () => `💡 点击任一角色名帖，可查看他们的<b>核心立场</b>与引用来源。`,
    ],
    speaker: '你',
  },
  2: {
    step: '第 2 回合 · 交叉质询',
    text: ({ mentioned }) => mentioned
      ? `已向 <span class="guide-speaker">${mentioned}</span> 发出质询，等待回应。`
      : `用 @ 角色名向任一嘉宾追问。`,
    tips: [
      ({ names }) => `🎯 在输入框中输入 <b>@${names[0]} 你提出的做法在什么条件下会失效？</b>`,
      () => `💬 回应会出现在右侧对话区，目标嘉宾的徽标会显示"正在思考"。`,
    ],
    speaker: '你',
  },
  3: {
    step: '第 3 回合 · 立场总结',
    text: '三席已发表最终立场。请写下你讨论后的判断。',
    tips: [
      () => `✍️ 写下<b>你的最终立场</b>，与初始立场对比即可生成纪要。`,
      () => `📜 点击"生成圆桌纪要"将看到你的观点变化、核心依据与延伸阅读。`,
    ],
    speaker: '你',
  },
};

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
    hostImage.src = state === 'thinking' ? 'public/assets/kanshan-thinking.gif' : 'public/assets/kanshan-thinking.gif';
  }
}

function updateRoundGuide(extra = {}) {
  if (!roundGuide || !guideStep || !guideText || !guideTips) return;
  const config = GUIDE_CONTENT[round];
  if (!config) return;
  guideStep.textContent = config.step;
  roundGuide.dataset.round = String(round);
  guideText.innerHTML = typeof config.text === 'function' ? config.text(extra) : config.text;
  const tips = config.tips.map((fn) => `<div class="guide-tip">${fn({ names: Object.values(roleNames), ...extra })}</div>`).join('');
  guideTips.innerHTML = tips;
  const speaker = config.speaker;
  if (speaker === '你') {
    userSeat.classList.add('is-speaking');
    const statusEl = userSeat.querySelector('.seat-status');
    if (statusEl) statusEl.textContent = round === 1 ? '✎ 等你亮立场' : round === 2 ? '✎ 等你质询' : '✎ 等你总结';
  } else {
    userSeat.classList.remove('is-speaking');
  }
}

function selectSeat(id) { setSeatSpeaking(id, 'speaking'); }
function addMessage(name, text, type = 'user') {
  const article = document.createElement('article');
  article.className = `message message-${type}`;
  article.innerHTML = `<span class="message-name">${name}</span><p></p>`;
  article.querySelector('p').textContent = text;
  conversation.append(article);
  conversation.scrollTop = conversation.scrollHeight;
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
  addMessage('刘看山', `第二回合开始。你可以在观点中 @${roleNames.a}、@${roleNames.b} 或 @${roleNames.c}，提出质疑。`, 'host');
  roundNote.textContent = '请至少 @ 一位角色，提出一个具体的追问、反例或批评。';
  userInput.placeholder = `@${roleNames.a} 你提出的做法在什么条件下会失效？`;
  composerHint.textContent = '第二回合 · @ 一位角色';
  sendButton.textContent = '插话质询';
  userInput.disabled = false;
  sendButton.disabled = false;
  nextRound.textContent = '完成质询后进入总结';
  nextRound.disabled = true;
  hostMessage.textContent = '现在进入交叉质询：理解对方最强的论据，再提出你的问题。';
  updateRoundGuide();
  userInput.focus();
}
function startThirdRound() {
  round = 3;
  updateRoundUI();
  addMessage('刘看山', '第三回合开始。请每一席总结：仍坚持什么、承认什么边界、接下来如何行动。', 'host');
  ['a', 'b', 'c'].forEach((id) => addMessage(roleNames[id], debatePlan?.positions.find((item) => item.id === id)?.closing || '我保留核心判断，也承认它有适用边界。', 'host'));
  roundNote.textContent = '写下你讨论后的最终立场，刘看山会将它与初始观点并列收录。';
  userInput.placeholder = '讨论后，我的最终立场是……';
  composerHint.textContent = '第三回合 · 更新最终立场';
  sendButton.textContent = '确认最终立场';
  nextRound.textContent = '生成圆桌纪要';
  nextRound.disabled = true;
  hostMessage.textContent = '请把争论变成自己的判断：你保留了什么，又改变了什么？';
  updateRoundGuide();
  userInput.focus();
}
function findMention(text) {
  return Object.entries(roleNames).find(([, name]) => text.includes(`@${name}`));
}
async function replyToQuestion(target, userMessage) {
  const replies = {
    a: '即使 AI 能生成测试，也需要人判断测试是否覆盖了真正的边界条件。',
    b: '不必等“学完”再做。把每次卡住的地方变成复盘清单，会更有效。',
    c: '把复盘设为项目的固定步骤：功能完成、验证结果、补齐原理，三者缺一不可。',
  };
  const names = roleNames;
  const targetSeat = document.querySelector(`.seat[data-seat="${target}"]`);
  setSeatSpeaking(target, 'thinking');
  hostMessage.textContent = `${names[target]}正在基于知乎证据组织回应……`;
  let response = debatePlan?.positions.find((item) => item.id === target)?.counter || replies[target];
  try {
    const question = document.querySelector('#topic-question').textContent.trim();
    const result = await fetch(`/api/reply?question=${encodeURIComponent(question)}&position=${target}&message=${encodeURIComponent(userMessage)}`);
    const payload = await result.json();
    if (result.ok && payload.ok && payload.reply) response = payload.reply;
  } catch {}
  selectSeat(target); addMessage(names[target], response, 'host');
}

seats.forEach((seat) => seat.addEventListener('click', () => selectSeat(seat.dataset.seat)));
roundSteps.forEach((step) => step.addEventListener('click', () => {
  const target = Number(step.dataset.round);
  if (target === round || target > round) return; // 只允许回看已完成的回合
  const hostMsgs = conversation.querySelectorAll('.message-host');
  const firstOfRound = Array.from(hostMsgs).find((node) => node.textContent.includes(`第 ${target} 回合`));
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
    message.querySelector('p').textContent = position.opening;
    const citation = message.querySelector('.citation');
    citation.textContent = `知乎真实回答 ${evidence[position.id].sources.length} 篇`;
    const seat = document.querySelector(`.seat[data-seat="${position.id}"]`);
    seat.querySelector('.seat-card strong').textContent = position.name;
    seat.querySelector('.seat-card small').textContent = position.stance.slice(0, 14);
    seat.querySelector('.seat-card em').textContent = `引用 ${evidence[position.id].sources.length} 篇知乎回答`;
  });
  updateRoundGuide();
}
document.querySelector('#refresh-sources').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const question = document.querySelector('.topic').textContent.replace('本场问题', '').trim();
  button.disabled = true;
  button.textContent = '正在检索…';
  try {
    const response = await fetch(`/api/roundtable?question=${encodeURIComponent(question)}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok || payload.sources.length === 0) throw new Error('NO_SOURCES');
    applyPlan(payload);
    hostMessage.textContent = `刘看山已从知乎召集 ${payload.sources.length} 条公开讨论，并整理出三种可讨论的立场。`;
    addMessage('刘看山', `已基于 ${payload.sources.length} 条知乎公开回答更新本场立场与论据。`, 'host');
    toast(`已载入 ${payload.sources.length} 条知乎真实依据`, 'host');
  } catch {
    hostMessage.textContent = '暂时无法加载知乎来源，请确认页面通过 node server.mjs 打开。';
    addMessage('刘看山', '知乎搜索暂时不可用；当前继续使用本地演示资料。', 'host');
    toast('知乎搜索暂不可用，已回退到本地资料', 'host');
  } finally {
    button.disabled = false;
    button.textContent = '刷新知乎来源';
  }
});
function truncate(text, max = 18) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}
composer.addEventListener('submit', (event) => {
  event.preventDefault();
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
    if (!mention) { roundNote.textContent = `本回合请用 @${roleNames.a}、@${roleNames.b} 或 @${roleNames.c} 点名质询。`; return; }
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
    nextRound.disabled = false;
    roundNote.textContent = '最终立场已记录。圆桌纪要将呈现你的观点变化与延伸阅读。';
    if (userSeatSubtitle) userSeatSubtitle.textContent = `最终：${truncate(text, 12)}`;
    toast('最终立场已记录', 'user');
  }
  userInput.value = '';
});
nextRound.addEventListener('click', () => {
  if (round === 1 && (userHasSpoken || currentMode === 'observer')) startSecondRound();
  else if (round === 2 && userHasQuestioned) startThirdRound();
  else if (round === 3 && userHasSummarized) {
    const initial = conversation.querySelector('.message-user');
    const final = Array.from(conversation.querySelectorAll('.message-user')).pop();
    const summary = `圆桌纪要已生成：你从"${truncate(initial?.textContent || '初始立场', 14)}"调整为"${truncate(final?.textContent || '最终立场', 14)}"。`;
    addMessage('刘看山', summary, 'host');
    nextRound.textContent = '本场讨论已完成';
    nextRound.disabled = true;
    hostMessage.textContent = '本场圆桌已结束。你可以从右侧对话区回看任一回合的内容。';
    userSeat.classList.remove('is-speaking');
    userInput.disabled = true;
    sendButton.disabled = true;
    toast('本场讨论已完成', 'host');
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
  onboarding.classList.add('is-hidden');
  document.querySelector('.topbar').classList.remove('is-hidden');
  document.querySelector('.debate-layout').classList.remove('is-hidden');
  document.querySelector('.mode-badge').textContent = mode === 'participant' ? '置身其中' : '置身事外';
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
  setTimeout(() => userInput.focus(), 200);
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
  enterDebate('participant', '先用 AI 完成项目，再针对项目里卡壳的地方补基础。');
  const target = Number(params.get('round')) || 1;
  if (target >= 2) {
    startSecondRound();
    if (target >= 3) startThirdRound();
  }
}

// 进入页面即初始化引导卡（圆桌未开启前不展示）
updateRoundGuide();
