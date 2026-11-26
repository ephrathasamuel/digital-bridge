// The sign reading code is plain JavaScript shared with the "Teach your own signs" page (apps/host-demo), so both
// read the same taught signs in the same way. The widget imports it from here.
export * from '../../../host-demo/assets/js/hand-signs.js';
export { detect, loadTracker, SIGNS_STORE, type HandTracker } from '../../../host-demo/assets/js/hand-tracker.js';
