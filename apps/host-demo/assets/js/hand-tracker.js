// Loads Google MediaPipe Hand Landmarker (Apache 2.0) on demand and reads one hand from a playing video.
// Runs in the browser: camera pictures never leave the device. Used by the teach page and the widget sign panel.
export const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
export const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
/** Where taught signs are kept in this browser (the same key on the teach page and in the widget). */
export const SIGNS_STORE = 'db-taught-signs';

let loading = null;

/** One tracker per page, created the first time someone turns on sign reading. */
export function loadTracker() {
  loading ??= (async () => {
    const vision = await import(/* @vite-ignore */ `${MEDIAPIPE}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
    const options = (delegate) => ({ baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 1 });
    try {
      return await vision.HandLandmarker.createFromOptions(files, options('GPU'));
    } catch {
      return vision.HandLandmarker.createFromOptions(files, options('CPU'));
    }
  })();
  loading.catch(() => { loading = null; }); // offline: allow another try later
  return loading;
}

/** The hand in the current video frame as { points, handedness }, or null. */
export function detect(tracker, video) {
  const result = tracker.detectForVideo(video, performance.now());
  const points = result.landmarks?.[0];
  if (!points) return null;
  return { points, handedness: (result.handedness ?? result.handednesses)?.[0]?.[0]?.categoryName };
}
