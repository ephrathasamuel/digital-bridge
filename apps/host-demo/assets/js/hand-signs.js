/**
 * Teach your own signs: pure helpers (no camera, no DOM), so they run in any browser and in tests.
 *
 * A hand tracker (MediaPipe Hand Landmarker) gives 21 points per hand. We make them independent of where the hand is,
 * how far it is from the camera and which hand is used, then compare them with the examples a person taught.
 * Nothing here knows any sign language: every sign comes from the people who use it. Version 1 matches still hand
 * shapes; signs with movement come later.
 */

export const POINTS = 21;
export const FORMAT = 'digital-bridge-signs';
export const VERSION = 1;
const MAX_WORD = 40;
const MAX_SIGNS = 200;
const MAX_SAMPLES = 60;
/** Depth from the tracker is noisier than x and y, so it counts for less. */
const Z_WEIGHT = 0.5;

/**
 * 21 points -> 63 numbers. Moved so the wrist is at 0, scaled by the palm length (wrist to middle finger knuckle),
 * and mirrored for a left hand so one taught example works for either hand.
 * @param {{x:number,y:number,z?:number}[]} points
 * @param {string} [handedness] "Left" or "Right" as the tracker reports it
 * @returns {number[] | null}
 */
export function normalise(points, handedness) {
  if (!Array.isArray(points) || points.length !== POINTS) return null;
  const wrist = points[0];
  const knuckle = points[9];
  const palm = Math.hypot(knuckle.x - wrist.x, knuckle.y - wrist.y, (knuckle.z ?? 0) - (wrist.z ?? 0));
  if (!Number.isFinite(palm) || palm < 1e-6) return null;
  const flip = handedness === 'Left' ? -1 : 1;
  const out = [];
  for (const p of points) {
    out.push((flip * (p.x - wrist.x)) / palm, (p.y - wrist.y) / palm, (Z_WEIGHT * ((p.z ?? 0) - (wrist.z ?? 0))) / palm);
  }
  return out.every(Number.isFinite) ? out : null;
}

/** @param {number[]} a @param {number[]} b */
export function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** @typedef {{ word: string, samples: number[][] }} Sign */
/** @typedef {{ signs: Sign[] }} Model */

/** @returns {Model} */
export function createModel() {
  return { signs: [] };
}

function cleanWord(word) {
  return typeof word === 'string' ? word.trim().replace(/\s+/g, ' ').slice(0, MAX_WORD) : '';
}

/** Add one example of a sign. Returns false when the word or the example is not usable. */
export function addSample(model, word, vector) {
  const name = cleanWord(word);
  if (!name || !Array.isArray(vector) || vector.length !== POINTS * 3) return false;
  let sign = model.signs.find((s) => s.word.toLowerCase() === name.toLowerCase());
  if (!sign) {
    if (model.signs.length >= MAX_SIGNS) return false;
    sign = { word: name, samples: [] };
    model.signs.push(sign);
  }
  if (sign.samples.length >= MAX_SAMPLES) sign.samples.shift(); // keep the newest examples
  sign.samples.push(vector);
  return true;
}

export function removeSign(model, word) {
  model.signs = model.signs.filter((s) => s.word.toLowerCase() !== cleanWord(word).toLowerCase());
}

/**
 * How far a new hand may be from the taught examples and still count. Taken from the examples themselves: three
 * times the usual gap between an example and its closest neighbour of the same sign.
 */
export function threshold(model) {
  const gaps = [];
  for (const sign of model.signs) {
    for (let i = 0; i < sign.samples.length; i++) {
      let best = Infinity;
      for (let j = 0; j < sign.samples.length; j++) {
        if (i !== j) best = Math.min(best, distance(sign.samples[i], sign.samples[j]));
      }
      if (Number.isFinite(best)) gaps.push(best);
    }
  }
  if (!gaps.length) return 1;
  gaps.sort((x, y) => x - y);
  return Math.max(0.3, 3 * gaps[Math.floor(gaps.length / 2)]);
}

/**
 * The closest taught sign: k nearest examples vote, and the hand must be near enough to count.
 * @returns {{ word: string, distance: number, votes: number } | null}
 */
export function classify(model, vector, { k = 5, limit = threshold(model) } = {}) {
  if (!vector) return null;
  const near = [];
  for (const sign of model.signs) for (const sample of sign.samples) near.push({ word: sign.word, d: distance(sample, vector) });
  if (!near.length) return null;
  near.sort((x, y) => x.d - y.d);
  if (near[0].d > limit) return null;
  const top = near.slice(0, k).filter((n) => n.d <= limit);
  const votes = new Map();
  for (const n of top) votes.set(n.word, (votes.get(n.word) ?? 0) + 1);
  const [word, count] = [...votes.entries()].sort((x, y) => y[1] - x[1])[0];
  if (count <= top.length / 2) return null; // no clear winner
  return { word, distance: Math.min(...top.filter((n) => n.word === word).map((n) => n.d)), votes: count };
}

/**
 * A word only counts when it is seen in several frames in a row, and only once until the hand changes or leaves.
 * @param {number} frames
 */
export function steady(frames = 8) {
  let last = null;
  let count = 0;
  let sent = null;
  return (word) => {
    if (word !== last) {
      last = word;
      count = 0;
      if (word === null) sent = null;
    }
    count++;
    if (word !== null && count >= frames && word !== sent) {
      sent = word;
      return word;
    }
    return null;
  };
}

export function toJSON(model) {
  return JSON.stringify({ format: FORMAT, version: VERSION, signs: model.signs.map((s) => ({
    word: s.word, samples: s.samples.map((v) => v.map((n) => Math.round(n * 1e4) / 1e4)),
  })) });
}

/** Read a saved or shared file. Anything unexpected is dropped, never trusted. */
export function fromJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || data.format !== FORMAT || data.version !== VERSION || !Array.isArray(data.signs)) return null;
  const model = createModel();
  for (const sign of data.signs.slice(0, MAX_SIGNS)) {
    if (!sign || !Array.isArray(sign.samples)) continue;
    for (const v of sign.samples.slice(0, MAX_SAMPLES)) {
      if (Array.isArray(v) && v.length === POINTS * 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        addSample(model, sign.word, v);
      }
    }
  }
  return model;
}
