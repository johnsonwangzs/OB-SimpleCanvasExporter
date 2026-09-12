import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../qa/async.mjs';

function clock() {
  const pending = new Map();
  let id = 0;
  return {
    setTimeout(fn) { pending.set(++id, fn); return id; },
    clearTimeout(timer) { pending.delete(timer); },
    fire() { for (const callback of [...pending.values()]) callback(); },
    get size() { return pending.size; },
  };
}

test('successful rendering clears its window timer', async () => {
  const win = clock();
  assert.equal(await withTimeout(Promise.resolve('rendered'), 20, new AbortController().signal, win), 'rendered');
  assert.equal(win.size, 0);
});

test('timeouts reject with an Error and remove their timer', async () => {
  const win = clock();
  const result = withTimeout(new Promise(() => {}), 20, new AbortController().signal, win);
  win.fire();
  await assert.rejects(result, /Rendering timed out/);
  assert.equal(win.size, 0);
});

test('cancellation normalizes custom reasons and handles a late rejection', async () => {
  const win = clock(), controller = new AbortController();
  let rejectRender;
  const result = withTimeout(new Promise((_, reject) => { rejectRender = reject; }), 20, controller.signal, win);
  controller.abort('User cancelled');
  await assert.rejects(result, { name: 'Error', message: 'User cancelled' });
  rejectRender('Late renderer error');
  await Promise.resolve();
  assert.equal(win.size, 0);
});

test('already cancelled exports retain AbortError and handle rejected rendering', async () => {
  const win = clock(), controller = new AbortController();
  controller.abort();
  await assert.rejects(withTimeout(Promise.reject('Already failed'), 20, controller.signal, win), { name: 'AbortError' });
  assert.equal(win.size, 0);
});

test('render failures normalize non-Error values and preserve actual Errors', async () => {
  const win = clock(), signal = new AbortController().signal;
  await assert.rejects(withTimeout(Promise.reject('Failed'), 20, signal, win), { name: 'Error', message: 'Failed' });
  const original = new TypeError('Original failure');
  await assert.rejects(withTimeout(Promise.reject(original), 20, signal, win), error => error === original);
  assert.equal(win.size, 0);
});
