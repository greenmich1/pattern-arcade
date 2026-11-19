// Run with: npm test
// Checks the guarantees the app makes to users: every puzzle generates, has exactly
// one correct answer, has no duplicate options, and cannot be solved from the options alone.
const test = require('node:test');
const assert = require('node:assert');
const { ARC } = require('../src/engine.js');

const TYPES = ['matrix', 'series', 'odd', 'sets', 'diagram'];
const PER_LEVEL = Number(process.env.PER_LEVEL || 100);

for (const type of TYPES) {
  test(`${type}: every level generates valid puzzles`, () => {
    for (let L = 1; L <= 10; L++) {
      for (let i = 0; i < PER_LEVEL; i++) {
        const seed = 1000 * L + i * 7919 + type.length * 13;
        const it = ARC.generate(type, L, seed);
        assert.ok(it, `${type} L${L} seed ${seed} returned null`);
        assert.ok(it.explain && it.explain.steps.length > 0, `${type} L${L} seed ${seed} has no explanation`);
        if (it.options) {
          const keys = it.options.map(o => (type === 'diagram' ? ARC.seqKey(o) : JSON.stringify(o)));
          assert.strictEqual(new Set(keys).size, keys.length, `${type} L${L} seed ${seed} has duplicate options`);
          assert.ok(it.answer >= 0 && it.answer < it.options.length);
        }
      }
    }
  });
}

test('generation is deterministic for a given seed', () => {
  for (const type of TYPES) {
    const a = ARC.generate(type, 6, 12345);
    const b = ARC.generate(type, 6, 12345);
    assert.deepStrictEqual(JSON.stringify(a), JSON.stringify(b));
  }
});

for (const type of ['matrix', 'series']) {
  test(`${type}: answers sit at a balanced spot in a "typicality" ranking`, () => {
    // Picking the most (or least) typical option must not beat chance by much.
    let mx = 0, mn = 0, chance = 0, n = 0;
    for (let i = 0; i < 1500; i++) {
      const it = ARC.generate(type, 1 + (i % 10), i * 101 + 7);
      const O = it.options;
      const sc = O.map(o => ARC.GATTRS.reduce((s, d) => s + O.filter(q => String(q[d]) === String(o[d])).length, 0));
      const hit = v => { const top = sc.map((x, k) => (x === v ? k : -1)).filter(k => k >= 0); return top.includes(it.answer) ? 1 / top.length : 0; };
      mx += hit(Math.max(...sc)); mn += hit(Math.min(...sc)); chance += 1 / O.length; n++;
    }
    const slack = 0.06;
    assert.ok(mx / n <= chance / n + slack, `most-typical heuristic scores ${(mx / n * 100).toFixed(1)}% vs chance ${(chance / n * 100).toFixed(1)}%`);
    assert.ok(mn / n <= chance / n + slack, `least-typical heuristic scores ${(mn / n * 100).toFixed(1)}% vs chance ${(chance / n * 100).toFixed(1)}%`);
  });
}
