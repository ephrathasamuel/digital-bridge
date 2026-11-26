// Teach your own signs: camera + MediaPipe Hand Landmarker (Apache 2.0) in the browser, matching in hand-signs.js.
// Camera pictures stay on the device. Taught signs live in this browser (localStorage) or in a file the person saves.
import { addClip, addSample, createModel, fromJSON, makeClip, normalise, reader, removeSign, segmenter, toJSON } from './hand-signs.js';
import { detect, loadTracker, SIGNS_STORE as STORE } from './hand-tracker.js';
const EXAMPLES = 30;
const MOVES = 3;
/** A movement example must start within this long after the count, or we ask again. */
const MOVE_WAIT_MS = 6000;

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
/** Teaching in progress: { word, kind: 'still'|'move', left, skip, counting, seg, since } */
let recording = null;
let readSign = reader(model);

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const kind = () => document.querySelector('input[name="kind"]:checked')?.value === 'move' ? 'move' : 'still';

function renderKind() {
  const move = kind() === 'move';
  $('record').textContent = move ? `Record ${MOVES} movement examples` : `Record ${EXAMPLES} examples`;
  $('record-hint').textContent = move
    ? `After a 3 second count, make the sign once, then hold your hand still. We ask for it ${MOVES} times. Make it a little differently each time (faster, slower, nearer).`
    : 'After a 3 second count, hold the sign and move your hand a little, nearer and further, so it learns the sign from different angles. Teach each sign at least twice.';
}

function renderSigns() {
  const list = $('signs');
  list.replaceChildren();
  $('empty').hidden = model.signs.length > 0;
  for (const sign of model.signs) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.innerHTML = '<strong></strong> <span class="muted"></span>';
    name.querySelector('strong').textContent = sign.word;
    const parts = [];
    if (sign.samples.length) parts.push(`${sign.samples.length} still examples`);
    if (sign.clips.length) parts.push(`${sign.clips.length} movement examples`);
    name.querySelector('.muted').textContent = parts.join(', ');
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
    const seen = detect(landmarker, video);
    draw(seen?.points ?? null);
    if (recording?.kind === 'move') learnMove(seen);
    else if (recording) learnStill(seen ? normalise(seen.points, seen.handedness) : null);
    else if (recognising) read(seen);
    else handLine.textContent = seen ? 'Hand seen' : 'No hand seen';
  }
  requestAnimationFrame(frame);
}

async function countdown(word, first, before = '') {
  recording.counting = true;
  for (let n = 3; n > 0; n--) {
    say(`${n === 3 && before ? `${before} ` : ''}${first ? 'Get ready to sign' : 'Again:'} ${word}: ${n}`);
    handLine.textContent = `Get ready: ${n}`;
    await wait(1000);
    if (!recording) return false;
  }
  recording.counting = false;
  recording.seg = segmenter();
  recording.since = performance.now();
  return true;
}

function finishTeaching(text) {
  recording = null;
  save();
  renderSigns();
  say(text);
  $('record').disabled = false;
}

function learnStill(vector) {
  if (recording.counting) return;
  if (!vector) {
    handLine.textContent = `Show your hand: ${EXAMPLES - recording.left} of ${EXAMPLES}`;
    return;
  }
  recording.skip = (recording.skip + 1) % 2; // every other frame, so the examples differ a little
  if (recording.skip) return;
  addSample(model, recording.word, vector);
  recording.left--;
  handLine.textContent = `Recording ${recording.word}: ${EXAMPLES - recording.left} of ${EXAMPLES}`;
  if (recording.left <= 0) finishTeaching(`Learned ${recording.word}. Teach it once more for better results, or teach the next sign.`);
}

function learnMove(seen) {
  if (recording.counting) return;
  const done = recording.seg.push(seen);
  const number = MOVES - recording.left + 1;
  handLine.textContent = recording.seg.moving ? `Movement ${number} of ${MOVES}: seen, now hold still` : `Make the sign: ${number} of ${MOVES}`;
  if (!done) {
    if (!recording.seg.moving && performance.now() - recording.since > MOVE_WAIT_MS) {
      const word = recording.word;
      finishTeaching(`No movement seen for ${word}. Move your hand more, or teach it as a still sign.`);
    }
    return;
  }
  const word = recording.word;
  if (!addClip(model, word, makeClip(done))) return;
  recording.left--;
  if (recording.left <= 0) {
    finishTeaching(`Learned ${word} with movement. Teach it once more for better results, or teach the next sign.`);
    return;
  }
  void countdown(word, false, `Got movement ${number} of ${MOVES}.`);
}

function addWord(word) {
  sentence.value = `${sentence.value.trim()} ${word}`.trim();
  say(`Added: ${word}`);
}

function read(seen) {
  const { word, now } = readSign(seen);
  guess.textContent = now === 'none' || now === 'moving' || now === 'unknown' ? '' : now;
  handLine.textContent = { none: 'No hand seen', moving: 'Moving…', unknown: 'Not a taught sign' }[now] ?? `Looks like: ${now}`;
  if (word) addWord(word);
}

function setRecognising(on) {
  recognising = on;
  readSign = reader(model); // built from the signs taught so far
  guess.textContent = '';
  $('recognise').textContent = on ? 'Stop recognising' : 'Start recognising';
  $('recognise').setAttribute('aria-pressed', String(on));
}

$('camera').addEventListener('click', () => (stream ? (stopCamera(), say('Camera off.')) : startCamera()));
for (const radio of document.querySelectorAll('input[name="kind"]')) radio.addEventListener('change', renderKind);

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
  const move = kind() === 'move';
  recording = { word, kind: move ? 'move' : 'still', left: move ? MOVES : EXAMPLES, skip: 0, counting: true, seg: null, since: 0 };
  if (await countdown(word, true)) say(move ? `Make the sign ${word}, then hold still.` : `Recording ${word}. Hold the sign.`);
  else $('record').disabled = false;
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
  for (const sign of loaded.signs) {
    for (const sample of sign.samples) addSample(model, sign.word, sample);
    for (const clip of sign.clips) addClip(model, sign.word, clip);
  }
  save();
  renderSigns();
  say(`Loaded ${loaded.signs.length} signs.`);
});

renderKind();
renderSigns();
