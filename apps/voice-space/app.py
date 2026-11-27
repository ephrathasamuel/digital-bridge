"""
Digital Bridge voices: Meta's open MMS text to speech voices, converted to ONNX (export_onnx.py), behind one small
HTTP route. Needs no PyTorch, so it fits a free 512 MB server (Render free, a Hugging Face Space, any Docker host).
The Digital Bridge API calls it with TTS_PROVIDER=custom.

POST /speak  {"text": "...", "lang": "om"}  ->  audio/wav
GET  /       health and the languages offered

Set SPEAK_TOKEN to require "Authorization: Bearer <SPEAK_TOKEN>" (put the same value in the API's
TTS_AUTH_HEADER as "Bearer <SPEAK_TOKEN>"), so only your API can use the server.
The MMS voices are CC BY NC 4.0: non commercial use only. Text is never logged or stored.
"""
import io
import json
import os
import threading
import time
import wave
from collections import OrderedDict

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from mms_text import MmsText, split

VOICES = os.environ.get("VOICES_DIR", os.path.join(os.path.dirname(__file__), "voices"))
LANGS = sorted(f[4:-5] for f in os.listdir(VOICES) if f.startswith("mms-") and f.endswith(".json")) if os.path.isdir(VOICES) else []
PRELOAD = [l for l in os.environ.get("PRELOAD", "om").split(",") if l in LANGS]
MAX_LOADED = int(os.environ.get("MAX_LOADED", "1"))  # each voice takes about 150 to 250 MB of memory
# Small free servers get a fraction of one core; one thread per core seen would fight over it and crawl.
THREADS = int(os.environ.get("THREADS", "1"))
TOKEN = os.environ.get("SPEAK_TOKEN", "")

app = FastAPI(title="Digital Bridge voices")
_voices: OrderedDict = OrderedDict()
_lock = threading.Lock()  # one load or one sentence at a time, so requests never pile up in memory


def load(lang: str):
    """Load a voice, keeping only the MAX_LOADED most recently used ones in memory. Call with _lock held."""
    if lang in _voices:
        _voices.move_to_end(lang)
        return _voices[lang]
    while len(_voices) >= MAX_LOADED:  # free the old voice before loading the new one
        _voices.popitem(last=False)
    with open(os.path.join(VOICES, f"mms-{lang}.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    options = ort.SessionOptions()
    options.enable_cpu_mem_arena = False  # lower memory between requests
    options.intra_op_num_threads = THREADS
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    # No second, rearranged copy of the weights and no memory planning: slower, but fits 512 MB.
    options.enable_mem_pattern = False
    options.add_session_config_entry("session.disable_prepacking", "1")
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    session = ort.InferenceSession(os.path.join(VOICES, f"mms-{lang}.onnx"), options, providers=["CPUExecutionProvider"])
    _voices[lang] = (MmsText(cfg, lang.split("-")[0]), session, cfg["sampling_rate"])
    print(f"loaded {lang}: memory peak {peak_mb()} MB", flush=True)
    return _voices[lang]


def peak_mb() -> int:
    try:
        import resource  # Linux only

        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024
    except Exception:  # noqa: BLE001 (memory report is optional)
        return -1


def load_locked(lang: str):
    with _lock:
        return load(lang)


@app.on_event("startup")
def warm_up() -> None:
    # Load the main voice in the background so the first request after a restart is faster.
    for lang in PRELOAD[:MAX_LOADED]:
        threading.Thread(target=load_locked, args=(lang,), daemon=True).start()


@app.get("/")
def health():
    return {"status": "ok" if LANGS else "no voices", "languages": LANGS, "loaded": list(_voices)}


class SpeakBody(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    lang: str = "om"


@app.post("/speak")
def speak(body: SpeakBody, authorization: str = Header(default="")):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    lang = body.lang.lower().split("-")[0].split("_")[0]
    if lang not in LANGS:
        raise HTTPException(status_code=404, detail="Language not offered")
    started = time.monotonic()
    pieces = []
    with _lock:
        text, session, rate = load(lang)
        pause = np.zeros(int(rate * 0.25), dtype=np.float32)
        for part in split(body.text):
            ids = text.ids(part)
            if len(ids) <= 1:
                continue
            pieces += [session.run(None, {"input_ids": np.array([ids], dtype=np.int64)})[0][0], pause]
    # Only the language, sizes and time are logged, never the text.
    print(f"speak {lang}: {len(body.text)} chars in {time.monotonic() - started:.1f}s, memory peak {peak_mb()} MB", flush=True)
    if not pieces:
        raise HTTPException(status_code=422, detail="Nothing to say")
    audio = (np.clip(np.concatenate(pieces), -1, 1) * 32767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(audio.tobytes())
    return Response(content=buffer.getvalue(), media_type="audio/wav", headers={"Cache-Control": "public, max-age=86400"})
