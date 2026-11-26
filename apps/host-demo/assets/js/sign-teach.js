// Teach your own signs: camera + MediaPipe Hand Landmarker (Apache 2.0) in the browser, matching in hand-signs.js.
// Camera pictures stay on the device. Taught signs live in this browser (localStorage) or in a file the person saves.
import { addSample, classify, createModel, fromJSON, normalise, removeSign, steady, toJSON } from './hand-signs.js';

const MEDIAPIPE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const STORE = 'db-taught-signs';
const EXAMPLES = 30;

const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const handLine = $('hand');
const status = $('status');
const sentence = $('sentence');
const guess = $('guess');

let model = load();
let landmarker = null;
let stream = null;
let lastTime = -1;
let recognising = false;
let recording = null; // { word, left, skip }
let push = steady(8);

function load() {
  try {
    return fromJSON(localStorage.getItem(STORE) ?? '') ?? createModel();
  } catch {
    return createModel();
  }
}

function save() {
  try {
    localStorage.setItem(STORE, toJSON(model));
  } catch {
    status.textContent = 'Could not save on this device (storage is full or blocked). Use Save to a file.';
  }
}

function say(text) {
  status.textContent = text;
}

function renderSigns() {
  const list = $('signs');
  list.replaceChildren();
  $('empty').hidden = model.signs.length > 0;
  for (const sign of model.signs) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.innerHTML = `<strong></strong> <span class="muted"></span>`;
    name.querySelector('strong').textContent = sign.word;
    name.querySelector('.muted').textContent = `${sign.samples.length} examples`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete the sign ${sign.word}`);
    remove.addEventListener('click', () => {
      removeSign(model, sign.word);
      save();
      renderSigns();
      say(`Deleted the sign ${sign.word}.`);
      $('word').focus();
    });
    item.append(name, remove);
    list.append(item);
  }
}

async function loadTracker() {
  const vision = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  const options = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 1 });
  try {
    return await vision.HandLandmarker.createFromOptions(files, options('GPU'));
  } catch {
    return vision.HandLandmarker.createFromOptions(files, options('CPU'));
  }
}

async function startCamera() {
  if (stream) return true;
  if (!navigator.mediaDevices?.getUserMedia) {
    say('This browser cannot use a camera.');
    return false;
  }
  try {
    say('Turning on the camera…');
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch {
    say('The camera is blocked or not available. Allow the camera in your browser settings and try again.');
    return false;
  }
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  if (!landmarker) {
    say('Loading the hand tracker. The first time takes a few seconds…');
    try {
      landmarker = await loadTracker();
    } catch {
      stopCamera();
      say('The hand tracker could not load. Check your internet connection and try again.');
      return false;
    }
  }
  $('camera').textContent = 'Turn off the camera';
  $('camera').setAttribute('aria-pressed', 'true');
  say('Camera on. Show one hand inside the picture.');
  requestAnimationFrame(frame);
  return true;
}

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  recording = null;
  $('record').disabled = false;
  setRecognising(false);
  overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
  handLine.textContent = 'Camera off';
  $('camera').textContent = 'Turn on the camera';
  $('camera').setAttribute('aria-pressed', 'false');
}

function draw(points) {
  const ctx = overlay.getContext('2d');
  overlay.width = video.videoWidth || 640;
  overlay.height = video.videoHeight || 480;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!points) return;
  ctx.fillStyle = '#FFD43B';
  ctx.strokeStyle = '#0B3C8C';
  ctx.lineWidth = 3;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x * overlay.width, p.y * overlay.height, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function frame() {
  if (!stream || !landmarker) return;
  if (video.readyState >= 2 && video.currentTime !== lastTime) {
    lastTime = video.currentTime;
    const result = landmarker.detectForVideo(video, performance.now());
    const points = result.landmarks?.[0] ?? null;
    const side = (result.handedness ?? result.handednesses)?.[0]?.[0]?.categoryName;
    const vector = points ? normalise(points, side) : null;
    draw(points);
    if (recording) learn(vector);
    else if (recognising) read(vector);
    else handLine.textContent = vector ? 'Hand seen' : 'No hand seen';
  }
  requestAnimationFrame(frame);
}

function learn(vector) {
  if (recording.countdown > 0) return;
  if (!vector) {
    handLine.textContent = `Show your hand: ${EXAMPLES - recording.left} of ${EXAMPLES}`;
    return;
  }
  recording.skip = (recording.skip + 1) % 2; // every other frame, so the examples differ a little
  if (recording.skip) return;
  addSample(model, recording.word, vector);
  recording.left--;
  handLine.textContent = `Recording ${recording.word}: ${EXAMPLES - recording.left} of ${EXAMPLES}`;
  if (recording.left <= 0) {
    const word = recording.word;
    recording = null;
    save();
    renderSigns();
    say(`Learned ${word}. Teach it once more for better results, or teach the next sign.`);
    $('record').disabled = false;
  }
}

function read(vector) {
  const match = classify(model, vector);
  guess.textContent = match ? match.word : '';
  handLine.textContent = vector ? (match ? `Looks like: ${match.word}` : 'Not a taught sign') : 'No hand seen';
  const word = push(match ? match.word : null);
  if (word) {
    sentence.value = `${sentence.value.trim()} ${word}`.trim();
    say(`Added: ${word}`);
  }
}

function setRecognising(on) {
  recognising = on;
  push = steady(8);
  guess.textContent = '';
  $('recognise').textContent = on ? 'Stop recognising' : 'Start recognising';
  $('recognise').setAttribute('aria-pressed', String(on));
}

$('camera').addEventListener('click', () => (stream ? (stopCamera(), say('Camera off.')) : startCamera()));

$('record').addEventListener('click', async () => {
  const word = $('word').value.trim();
  if (!word) {
    say('Write the word for this sign first.');
    $('word').focus();
    return;
  }
  if (!(await startCamera())) return;
  setRecognising(false);
  $('record').disabled = true;
  recording = { word, left: EXAMPLES, skip: 0, countdown: 3 };
  for (let n = 3; n > 0; n--) {
    say(`Get ready to sign ${word}: ${n}`);
    handLine.textContent = `Get ready: ${n}`;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!recording) break;
  }
  if (recording) {
    recording.countdown = 0;
    say(`Recording ${word}. Hold the sign.`);
  } else {
    $('record').disabled = false;
  }
});

$('recognise').addEventListener('click', async () => {
  if (recognising) return setRecognising(false);
  if (!model.signs.length) {
    say('Teach at least one sign first.');
    $('word').focus();
    return;
  }
  if (!(await startCamera())) return;
  setRecognising(true);
  say('Recognising. Sign one word at a time.');
});

$('speak').addEventListener('click', () => {
  const text = sentence.value.trim();
  if (!text) return say('There are no words yet.');
  if (!('speechSynthesis' in window)) return say('Read aloud is not available in this browser.');
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sentence.value.trim());
    say('Copied.');
  } catch {
    sentence.select();
    say('Copy did not work here. The words are selected: press Ctrl+C.');
  }
});

$('undo').addEventListener('click', () => {
  sentence.value = sentence.value.trim().split(/\s+/).slice(0, -1).join(' ');
  say('Removed the last word.');
});

$('clear').addEventListener('click', () => {
  sentence.value = '';
  say('Cleared.');
});

$('export').addEventListener('click', () => {
  if (!model.signs.length) return say('There are no signs to save yet.');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([toJSON(model)], { type: 'application/json' }));
  link.download = 'my-signs.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  say('Saved my-signs.json. Share it so others can use your signs.');
});

$('import').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5_000_000) return say('That file is too big for a signs file.');
  const loaded = fromJSON(await file.text());
  if (!loaded) return say('That is not a Digital Bridge signs file.');
  for (const sign of loaded.signs) for (const sample of sign.samples) addSample(model, sign.word, sample);
  save();
  renderSigns();
  say(`Loaded ${loaded.signs.length} signs.`);
});

renderSigns();
