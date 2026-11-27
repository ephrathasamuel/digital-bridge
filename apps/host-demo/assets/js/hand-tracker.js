// Loads Google MediaPipe Hand Landmarker (Apache 2.0) on demand and reads one hand from a playing video.
// Runs in the browser: camera pictures never leave the device. Used by the teach page and the widget sign panel.
export const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
export const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
/** Where taught signs are kept in this browser (the same key on the teach page and in the widget). */
export const SIGNS_STORE = 'db-taught-signs';

let loading = null;
/** A processor (CPU) tracker that replaces the graphics chip one after it failed while reading frames. */
let replacement = null;
let switching = false;
let status = 'not loaded';

/** What the tracker is doing, shown on the teach page so a phone that finds no hand says why. */
export function trackerStatus() {
  return status;
}

// Phones: the graphics chip (GPU) path often starts fine but then finds no hand or fails on every frame,
// so phones use the processor, which is slower but works everywhere.
const isPhone = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

async function create(delegate) {
  const vision = await import(/* @vite-ignore */ `${MEDIAPIPE}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  return vision.HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
  });
}

/** One tracker per page, created the first time someone turns on sign reading. */
export function loadTracker() {
  loading ??= (async () => {
    if (!isPhone()) {
      try {
        const gpu = await create('GPU');
        status = 'graphics chip';
        return gpu;
      } catch {
        // no usable graphics chip: use the processor below
      }
    }
    const cpu = await create('CPU');
    status = 'processor';
    return cpu;
  })();
  loading.catch(() => { loading = null; }); // offline: allow another try later
  return loading;
}

/**
 * The hand in the current video frame as { points, handedness }, or null. Never throws: when the tracker fails on a
 * frame it switches to a processor tracker in the background, so the caller's camera loop keeps running.
 */
export function detect(tracker, video) {
  try {
    const result = (replacement ?? tracker).detectForVideo(video, performance.now());
    const points = result.landmarks?.[0];
    if (!points) return null;
    return { points, handedness: (result.handedness ?? result.handednesses)?.[0]?.[0]?.categoryName };
  } catch (error) {
    status = `error: ${error?.message ?? error}`.slice(0, 120);
    if (!switching && !replacement) {
      switching = true;
      create('CPU')
        .then((cpu) => { replacement = cpu; status = 'processor (after an error)'; })
        .catch(() => undefined)
        .finally(() => { switching = false; });
    }
    return null;
  }
}
