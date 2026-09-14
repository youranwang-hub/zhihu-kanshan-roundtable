import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('image swaps retain the visible pose and ignore a stale download', async () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const pending = [];
  class Image {
    set src(value) { this.url = value; pending.push(this); }
    decode() { return Promise.resolve(); }
  }
  const context = vm.createContext({ URL, Image, document: { baseURI: 'https://example.test/' },
    setTimeout, clearTimeout, imageRequests: new WeakMap(), failedImages: new Map(), updateArtStatus() {} });
  vm.runInContext(app.slice(app.indexOf('async function setSceneImage('), app.indexOf("document.addEventListener('error'")), context);
  const element = { src: 'https://example.test/default.png', complete: true, naturalWidth: 100 };
  const speaking = context.setSceneImage(element, 'speaking.png');
  assert.equal(element.src, 'https://example.test/default.png');
  await context.setSceneImage(element, 'default.png');
  pending[0].onload();
  await speaking;
  assert.equal(element.src, 'https://example.test/default.png');
  const thinking = context.setSceneImage(element, 'thinking.png');
  pending[1].onload();
  await thinking;
  assert.equal(element.src, 'https://example.test/thinking.png');
});
