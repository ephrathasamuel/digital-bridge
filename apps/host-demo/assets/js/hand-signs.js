/**
 * Teach your own signs: pure helpers (no camera, no DOM), so they run in any browser and in tests.
 *
 * A hand tracker (MediaPipe Hand Landmarker) gives 21 points per hand. We make them independent of where the hand is,
 * how far it is from the camera and which hand is used, then compare them with the examples a person taught.
 * Nothing here knows any sign language: every sign comes from the people who use it.
 *
 * Two kinds of sign:
 *   still     one hand shape held steady (examples are single frames)
 *   movement  a hand shape that moves (examples are short clips: the shape and the wrist path, frame by frame,
 *             compared with dynamic time warping so a faster or slower sign still matches)
 */

export const POINTS = 21;
export const FORMAT = 'digital-bridge-signs';
export const VERSION = 2;
/** Every movement clip is stretched or squeezed to this many steps. */
export const CLIP_LEN = 16;
const SHAPE = POINTS * 3;
const FRAME = SHAPE + 2;
const MAX_WORD = 40;
const MAX_SIGNS = 200;
const MAX_SAMPLES = 60;
const MAX_CLIPS = 12;
/** Depth from the tracker is noisier than x and y, so it counts for less. */
const Z_WEIGHT = 0.5;
/** In a movement sign the path matters as much as the shape: one palm length of travel weighs this much. */
const PATH_WEIGHT = 3;

/** @typedef {{x:number,y:number,z?:number}} Point */
/** @typedef {{ points: Point[], handedness?: string }} Frame */

function palmLength(points) {
  const wrist = points[0];
  const knuckle = points[9];
  return Math.hypot(knuckle.x - wrist.x, knuckle.y - wrist.y, (knuckle.z ?? 0) - (wrist.z ?? 0));
}

/**
 * 21 points -> 63 numbers. Moved so the wrist is at 0, scaled by the palm length (wrist to middle finger knuckle),
 * and mirrored for a left hand so one taught example works for either hand.
 * @param {Point[]} points
 * @param {string} [handedness] "Left" or "Right" as the tracker reports it
 * @returns {number[] | null}
 */
export function normalise(points, handedness) {
  if (!Array.isArray(points) || points.length !== POINTS) return null;
  const wrist = points[0];
  const palm = palmLength(points);
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

/** @typedef {{ word: string, samples: number[][], clips: number[][][] }} Sign */
/** @typedef {{ signs: Sign[] }} Model */

/** @returns {Model} */
export function createModel() {
  return { signs: [] };
}

function cleanWord(word) {
  return typeof word === 'string' ? word.trim().replace(/\s+/g, ' ').slice(0, MAX_WORD) : '';
}

function signFor(model, word) {
  const name = cleanWord(word);
  if (!name) return null;
  let sign = model.signs.find((s) => s.word.toLowerCase() === name.toLowerCase());
  if (!sign) {
    if (model.signs.length >= MAX_SIGNS) return null;
    sign = { word: name, samples: [], clips: [] };
    model.signs.push(sign);
  }
  return sign;
}

/** Add one example of a still sign. Returns false when the word or the example is not usable. */
export function addSample(model, word, vector) {
  if (!Array.isArray(vector) || vector.length !== SHAPE) return false;
  const sign = signFor(model, word);
  if (!sign) return false;
  if (sign.samples.length >= MAX_SAMPLES) sign.samples.shift(); // keep the newest examples
  sign.samples.push(vector);
  return true;
}

/** Add one example of a movement sign (a clip from makeClip). */
export function addClip(model, word, clip) {
  if (!isClip(clip)) return false;
  const sign = signFor(model, word);
  if (!sign) return false;
  if (sign.clips.length >= MAX_CLIPS) sign.clips.shift();
  sign.clips.push(clip);
  return true;
}

export function removeSign(model, word) {
  model.signs = model.signs.filter((s) => s.word.toLowerCase() !== cleanWord(word).toLowerCase());
}

/** The usual gap between an example and its closest neighbour of the same sign, times `times`. */
function gapLimit(groups, measure, times, floor, fallback) {
  const gaps = [];
  for (const items of groups) {
    for (let i = 0; i < items.length; i++) {
      let best = Infinity;
      for (let j = 0; j < items.length; j++) if (i !== j) best = Math.min(best, measure(items[i], items[j]));
      if (Number.isFinite(best)) gaps.push(best);
    }
  }
  if (!gaps.length) return fallback;
  gaps.sort((x, y) => x - y);
  return Math.max(floor, times * gaps[Math.floor(gaps.length / 2)]);
}

/** How far a still hand may be from the taught examples and still count (taken from the examples themselves). */
export function threshold(model) {
  return gapLimit(model.signs.map((s) => s.samples), distance, 3, 0.3, 1);
}

/** The same for movement clips. */
export function clipThreshold(model) {
  return gapLimit(model.signs.map((s) => s.clips), dtw, 2.5, 0.5, 2);
}

/**
 * The closest taught still sign: k nearest examples vote, and the hand must be near enough to count.
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

// ---- Movement signs ------------------------------------------------------------------------------------------------

function isClip(clip) {
  return Array.isArray(clip) && clip.length === CLIP_LEN &&
    clip.every((f) => Array.isArray(f) && f.length === FRAME && f.every((n) => typeof n === 'number' && Number.isFinite(n)));
}

/** How far the wrist travels across the frames, in palm lengths. */
export function travel(frames) {
  let sum = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].points[0];
    const b = frames[i].points[0];
    sum += Math.hypot(b.x - a.x, b.y - a.y) / palmLength(frames[i].points);
  }
  return sum;
}

/**
 * Camera frames of one movement -> a clip of CLIP_LEN steps. Each step is the hand shape plus where the wrist is,
 * measured from where the movement started in palm lengths (mirrored for a left hand).
 * @param {Frame[]} frames
 * @returns {number[][] | null}
 */
export function makeClip(frames) {
  if (!Array.isArray(frames) || frames.length < 4) return null;
  const start = frames[0].points?.[0];
  const palm = frames[0].points ? palmLength(frames[0].points) : NaN;
  if (!start || !Number.isFinite(palm) || palm < 1e-6) return null;
  const rows = [];
  for (const f of frames) {
    const shape = normalise(f.points, f.handedness);
    if (!shape) return null;
    const flip = f.handedness === 'Left' ? -1 : 1;
    const w = f.points[0];
    rows.push([...shape, (PATH_WEIGHT * flip * (w.x - start.x)) / palm, (PATH_WEIGHT * (w.y - start.y)) / palm]);
  }
  const clip = [];
  for (let i = 0; i < CLIP_LEN; i++) {
    const at = (i * (rows.length - 1)) / (CLIP_LEN - 1);
    const lo = Math.floor(at);
    const hi = Math.min(lo + 1, rows.length - 1);
    const mix = at - lo;
    clip.push(rows[lo].map((v, d) => v + (rows[hi][d] - v) * mix));
  }
  return clip;
}

/** Dynamic time warping: the cost of lining up two clips, allowing one to be faster or slower. Per step. */
export function dtw(a, b) {
  const n = a.length;
  const m = b.length;
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  cost[0][0] = 0;
  const band = Math.max(3, Math.abs(n - m) + 2);
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      cost[i][j] = distance(a[i - 1], b[j - 1]) + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1]);
    }
  }
  return cost[n][m] / (n + m);
}

/** The closest taught movement sign, or null when nothing is close enough. */
export function classifyClip(model, clip, { limit = clipThreshold(model) } = {}) {
  if (!isClip(clip)) return null;
  let best = null;
  for (const sign of model.signs) {
    for (const taught of sign.clips) {
      const d = dtw(taught, clip);
      if (!best || d < best.distance) best = { word: sign.word, distance: d };
    }
  }
  return best && best.distance <= limit ? best : null;
}

/**
 * Finds movements in the camera stream: a movement starts when the wrist moves fast enough, and ends when it has been
 * still for a few frames or the hand leaves. push() gives back the frames of a finished movement, else null.
 */
export function segmenter({ start = 0.08, stop = 0.04, quiet = 6, minFrames = 6, maxFrames = 90, minTravel = 0.8 } = {}) {
  let prev = null;
  let frames = [];
  let calm = 0;
  let lead = [];
  const finish = () => {
    const done = frames.slice(0, frames.length - calm);
    frames = [];
    calm = 0;
    return done.length >= minFrames && travel(done) >= minTravel ? done : null;
  };
  return {
    /** @param {Frame | null} frame */
    push(frame) {
      if (!frame || !Array.isArray(frame.points) || frame.points.length !== POINTS) {
        prev = null;
        lead = [];
        return frames.length ? finish() : null;
      }
      const speed = prev ? Math.hypot(frame.points[0].x - prev.points[0].x, frame.points[0].y - prev.points[0].y) / palmLength(frame.points) : 0;
      prev = frame;
      if (!frames.length) {
        lead = [...lead, frame].slice(-2); // keep the frames just before the movement so its start is not lost
        if (speed >= start) frames = [...lead];
        return null;
      }
      frames.push(frame);
      calm = speed < stop ? calm + 1 : 0;
      if (calm >= quiet || frames.length >= maxFrames) {
        lead = [frame];
        return finish();
      }
      return null;
    },
    get moving() {
      return frames.length > 0;
    },
  };
}

// ---- Files ---------------------------------------------------------------------------------------------------------

const round = (v) => v.map((n) => Math.round(n * 1e4) / 1e4);

export function toJSON(model) {
  return JSON.stringify({ format: FORMAT, version: VERSION, signs: model.signs.map((s) => ({
    word: s.word, samples: s.samples.map(round), clips: s.clips.map((c) => c.map(round)),
  })) });
}

/** Read a saved or shared file (version 1 or 2). Anything unexpected is dropped, never trusted. */
export function fromJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || data.format !== FORMAT || ![1, 2].includes(data.version) || !Array.isArray(data.signs)) return null;
  const model = createModel();
  for (const sign of data.signs.slice(0, MAX_SIGNS)) {
    if (!sign) continue;
    for (const v of (Array.isArray(sign.samples) ? sign.samples : []).slice(0, MAX_SAMPLES)) {
      if (Array.isArray(v) && v.length === SHAPE && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        addSample(model, sign.word, v);
      }
    }
    for (const c of (Array.isArray(sign.clips) ? sign.clips : []).slice(0, MAX_CLIPS)) addClip(model, sign.word, c);
  }
  return model;
}

// ---- Reading signs from the camera stream ---------------------------------------------------------------------------

/**
 * One reader per session: give it every camera frame (or null when no hand is seen). It returns a word when a taught
 * sign is finished (a movement, or a still shape held for `hold` frames), and says what it sees right now.
 * @param {Model} model
 * @returns {(seen: Frame | null) => { word: string | null, now: 'none' | 'moving' | 'unknown' | string }}
 */
export function reader(model, { hold = 8 } = {}) {
  const hasMoves = model.signs.some((s) => s.clips.length);
  const moves = segmenter();
  let push = steady(hold);
  return (seen) => {
    if (hasMoves) {
      const done = moves.push(seen);
      if (done) {
        const match = classifyClip(model, makeClip(done));
        push = steady(hold); // a still sign after a movement must be held again
        return { word: match ? match.word : null, now: match ? match.word : 'unknown' };
      }
      if (moves.moving) {
        push(null);
        return { word: null, now: 'moving' };
      }
    }
    const vector = seen ? normalise(seen.points, seen.handedness) : null;
    const match = classify(model, vector);
    return { word: push(match ? match.word : null), now: vector ? (match ? match.word : 'unknown') : 'none' };
  };
}
