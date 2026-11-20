/* Exercise the game controller and HKEmbed bridge without a browser or score API. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const script = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'http://localhost';
const submitted = [];
let receive, exitScore, started = 0;
const child = { postMessage() {} };
const host = { addEventListener(type, fn) { if (type === 'message') receive = fn; } };
// The parent tracks whether a play is running and owns the actual ranking write.
vm.runInNewContext(script('web/_shared/hk-embed.js'), {
  window: host,
  HKUI: { escapeHtml: value => value },
  HKPlay: {
    mountGame({ setup }) {
      setup({
        querySelector: selector => selector === 'iframe'
          ? { contentWindow: child, addEventListener() {} }
          : { remove() {} },
      }, {
        game: { title: '도토리 새총단' },
        started() { started++; },
        onPause() {},
        onRestart() {},
        onScore(fn) { exitScore = fn; },
        async submit(score) { submitted.push(score); },
      });
    },
  },
});
host.HKEmbed.mount({ key: 'acornshot', src: '/game', origin });

const elements = new Map(), saved = new Map();
const element = () => ({
  addEventListener() {}, append() {}, focus() {}, getContext() {},
  replaceChildren() {}, setAttribute() {},
});
function get(id) {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
}
let complete;
const window = { addEventListener() {}, AcornPhysics: {
  SLING: { x: 205, y: 432 }, SCORE_MAX: 20_000,
  LEVELS: Array.from({ length: 8 }, (_, i) => ({ name: String(i + 1), ammo: ['seed'] })),
  create(_index, notify) {
    const state = { score: 0, spent: 0, targets: [{}], phase: 'aim' };
    complete = (won, score) => {
      state.score = score;
      state.phase = won ? 'won' : 'lost';
      notify({ type: 'finish', won, score, stars: won ? 3 : 0 });
    };
    return { state, dispose() {} };
  },
} };
vm.runInNewContext(script('web/games/embed/acornshot/game.js'), {
  window,
  parent: { postMessage(data) { receive({ data, origin, source: child }); } },
  location: { origin, search: '?hk=1' },
  document: { getElementById: get, createElement: element, addEventListener() {} },
  localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame() {},
  URLSearchParams,
});

get('start').onclick();
complete(true, 5_120);
assert.deepEqual(submitted, [], 'Intermediate clear does not submit');
assert.equal(JSON.parse(saved.get('acornshot.v1')).stars[0], 3);
assert.equal(exitScore(), 5_120, 'Arcade exit sees completed-stage score');
get('next').onclick();
assert.equal(started, 1, 'Next stage continues the current play');
assert.equal(exitScore(), 5_120, 'Starting a stage does not reset the exit score');
complete(false, 800);
get('select-level').onclick();
assert.deepEqual(submitted, [5_120], 'Failure submits the best score once');

get('start').onclick();
complete(true, 6_900);
assert.equal(submitted.length, 1);
get('select-level').onclick();
assert.deepEqual(submitted, [5_120, 6_900], 'Leaving from a clear screen submits once');

get('start').onclick();
for (let i = 2; i < 7; i++) {
  complete(true, 10_000 + i);
  assert.equal(submitted.length, 2, 'Advancing through intermediate stages does not submit');
  get('next').onclick();
}
complete(true, 9_000);
get('next').onclick();
assert.deepEqual(submitted, [5_120, 6_900, 10_006], 'Final clear submits once, even if an earlier stage scored higher');
console.log('PASS: ranked submission waits for failure, campaign clear, or exit; intermediate clears still save progress.');
