import { describe, expect, it } from 'vitest';
import {
  addClip, addSample, classify, classifyClip, createModel, fromJSON, makeClip, normalise, removeSign, segmenter, steady, toJSON,
  type Frame, type Point,
} from '../../../host-demo/assets/js/hand-signs.js';

/** A made up hand: `bend` moves the finger tips, so different values are different hand shapes. */
function hand(bend: number, { dx = 0, dy = 0, scale = 1, mirror = false } = {}): Point[] {
  return Array.from({ length: 21 }, (_, i) => {
    const finger = Math.floor((i - 1) / 4);
    const joint = i === 0 ? 0 : ((i - 1) % 4) + 1;
    const x = i === 0 ? 0 : (finger - 2) * 0.05 + (joint === 4 ? bend * 0.04 : 0);
    const y = i === 0 ? 0 : -0.06 * joint;
    return { x: dx + scale * (mirror ? -x : x), y: dy + scale * y, z: 0 };
  });
}

function taught(): ReturnType<typeof createModel> {
  const model = createModel();
  for (let n = 0; n < 6; n++) {
    addSample(model, 'water', normalise(hand(0 + n * 0.02))!);
    addSample(model, 'help', normalise(hand(2 + n * 0.02))!);
  }
  return model;
}

describe('hand signs', () => {
  it('ignores where the hand is, how big it looks and which hand is used', () => {
    const a = normalise(hand(1))!;
    expect(normalise(hand(1, { dx: 0.3, dy: 0.2, scale: 1.8 }))!.map((n) => +n.toFixed(6))).toEqual(a.map((n) => +n.toFixed(6)));
    expect(normalise(hand(1, { mirror: true }), 'Left')!.map((n) => +n.toFixed(6))).toEqual(a.map((n) => +n.toFixed(6)));
  });

  it('rejects broken tracker output', () => {
    expect(normalise(hand(1).slice(0, 20))).toBeNull();
    expect(normalise(Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 })))).toBeNull();
  });

  it('recognises taught signs and says nothing for an unknown hand shape', () => {
    const model = taught();
    expect(classify(model, normalise(hand(0.05, { dx: 0.2 })))?.word).toBe('water');
    expect(classify(model, normalise(hand(2.05, { scale: 0.7 })))?.word).toBe('help');
    expect(classify(model, normalise(hand(6)))).toBeNull();
    expect(classify(createModel(), normalise(hand(0)))).toBeNull();
  });

  it('only gives a word once it is held steady, and once per sign', () => {
    const push = steady(3);
    expect(['water', 'water', 'water', 'water'].map(push)).toEqual([null, null, 'water', null]);
    expect([null, 'water', 'water', 'water'].map(push)).toEqual([null, null, null, 'water']);
  });

  it('keeps words tidy, removes signs and round trips through a shared file', () => {
    const model = taught();
    expect(addSample(model, '   ', normalise(hand(0))!)).toBe(false);
    addSample(model, '  Water ', normalise(hand(0))!);
    expect(model.signs.map((s) => s.word)).toEqual(['water', 'help']);
    const copy = fromJSON(toJSON(model))!;
    expect(copy.signs.map((s) => [s.word, s.samples.length])).toEqual([['water', 7], ['help', 6]]);
    removeSign(copy, 'HELP');
    expect(copy.signs.map((s) => s.word)).toEqual(['water']);
  });

  it('drops anything unexpected in an imported file', () => {
    expect(fromJSON('not json')).toBeNull();
    expect(fromJSON(JSON.stringify({ format: 'other', version: 1, signs: [] }))).toBeNull();
    const bad = fromJSON(JSON.stringify({ format: 'digital-bridge-signs', version: 1, signs: [
      { word: 'ok', samples: [Array(63).fill(0.1), Array(5).fill(0), Array(63).fill('x')] },
      { word: '', samples: [Array(63).fill(0)] },
      null,
    ] }))!;
    expect(bad.signs.map((s) => [s.word, s.samples.length])).toEqual([['ok', 1]]);
  });
});

/** A hand that keeps shape `bend` while its wrist follows `path` (t from 0 to 1 -> offset). */
function moving(bend: number, steps: number, path: (t: number) => [number, number]): Frame[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const [dx, dy] = path(t);
    return { points: hand(bend, { dx: dx + 0.002 * Math.sin(i * 7), dy }) };
  });
}
const right = (t: number): [number, number] => [0.3 * t, 0];
const down = (t: number): [number, number] => [0, 0.3 * t];
const circle = (t: number): [number, number] => [0.1 * Math.cos(2 * Math.PI * t) - 0.1, 0.1 * Math.sin(2 * Math.PI * t)];

function taughtMoves(): ReturnType<typeof createModel> {
  const model = createModel();
  for (const steps of [16, 20, 24]) {
    addClip(model, 'go', makeClip(moving(0, steps, right)));
    addClip(model, 'round', makeClip(moving(0, steps, circle)));
    addClip(model, 'stop', makeClip(moving(2, steps, right)));
  }
  return model;
}

describe('signs with movement', () => {
  it('recognises the path and the hand shape, at any speed', () => {
    const model = taughtMoves();
    expect(classifyClip(model, makeClip(moving(0, 40, right)))?.word).toBe('go');
    expect(classifyClip(model, makeClip(moving(0, 12, circle)))?.word).toBe('round');
    expect(classifyClip(model, makeClip(moving(2, 30, right)))?.word).toBe('stop');
    expect(classifyClip(model, makeClip(moving(0, 20, down)))).toBeNull();
  });

  it('finds one movement between still moments, and ignores a shaky hand', () => {
    const seg = segmenter();
    const still = (n: number, dx: number) => Array.from({ length: n }, () => ({ points: hand(0, { dx }) }));
    const frames = [...still(10, 0), ...moving(0, 20, right), ...still(10, 0.3)];
    const found = frames.map((f) => seg.push(f)).filter(Boolean);
    expect(found).toHaveLength(1);
    expect(found[0]!.length).toBeGreaterThanOrEqual(18);
    expect(classifyClip(taughtMoves(), makeClip(found[0]!))?.word).toBe('go');
    const shaky = segmenter();
    const jitter = Array.from({ length: 30 }, (_, i) => ({ points: hand(0, { dx: 0.004 * (i % 2) }) }));
    expect(jitter.map((f) => shaky.push(f)).filter(Boolean)).toHaveLength(0);
  });

  it('a movement that ends when the hand leaves still counts', () => {
    const seg = segmenter();
    for (const f of moving(0, 20, right)) seg.push(f);
    expect(seg.moving).toBe(true);
    expect(seg.push(null)?.length).toBeGreaterThanOrEqual(18);
  });

  it('keeps movement examples in shared files, and still reads version 1 files', () => {
    const model = taughtMoves();
    addSample(model, 'water', normalise(hand(0))!);
    const copy = fromJSON(toJSON(model))!;
    expect(copy.signs.map((s) => [s.word, s.samples.length, s.clips.length])).toEqual([
      ['go', 0, 3], ['round', 0, 3], ['stop', 0, 3], ['water', 1, 0],
    ]);
    expect(classifyClip(copy, makeClip(moving(0, 25, circle)))?.word).toBe('round');
    const v1 = fromJSON(JSON.stringify({ format: 'digital-bridge-signs', version: 1, signs: [{ word: 'old', samples: [Array(63).fill(0)] }] }))!;
    expect(v1.signs[0]).toEqual({ word: 'old', samples: [Array(63).fill(0)], clips: [] });
    expect(addClip(model, 'bad', [[1, 2, 3]])).toBe(false);
  });
});
