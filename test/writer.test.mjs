import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('writer avoids layout reads while waiting and completes without changing speech pacing', async () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const code = app.slice(app.indexOf('function createWriter('), app.indexOf('async function speak('));
  let now = 0;
  let tick;
  let reads = 0;
  const paragraph = { textContent: '' };
  const states = [];
  const context = vm.createContext({
    performance: { now: () => now }, matchMedia: () => ({ matches: false }),
    document: { hidden: false }, skipSpeech: false,
    conversation: { get scrollHeight() { reads++; return 100; }, scrollTop: 0, clientHeight: 100 },
    setSeatSpeaking: (...state) => states.push(state), playSound: () => {},
    roleNames: { a: '嘉宾' }, hostMessage: {}, hostImage: {},
    setInterval: callback => { tick = callback; return 1; }, clearInterval: () => {},
    article: { querySelector: () => paragraph, classList: { add() {}, remove() {} }, setAttribute() {} },
  });
  vm.runInContext(code + '\nvar writer = createWriter(article, "a");', context);
  tick();
  now = 500;
  tick();
  assert.equal(reads, 0);
  context.writer.push('你好');
  tick();
  assert.equal(paragraph.textContent, '你');
  const previousReads = reads;
  now = 520;
  tick();
  assert.equal(reads, previousReads);
  now = 560;
  await context.writer.finish();
  assert.equal(paragraph.textContent, '你好');
  assert.deepEqual(states, [['a', 'thinking'], ['a'], [null]]);
});
