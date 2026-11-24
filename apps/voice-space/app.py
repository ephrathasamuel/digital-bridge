"""
Digital Bridge voices: Meta's open MMS text to speech models behind one small HTTP route, for a free
Hugging Face Space (or any server). The Digital Bridge API calls it with TTS_PROVIDER=custom.

POST /speak  {"text": "...", "lang": "om"}  ->  audio/wav
GET  /       health and the languages offered

Set the Space secret SPEAK_TOKEN to require "Authorization: Bearer <SPEAK_TOKEN>" (put the same value in the API's
TTS_AUTH_HEADER as "Bearer <SPEAK_TOKEN>"), so only your API can use your free hardware.
The MMS models are CC BY NC 4.0: non commercial use only. Text is never logged or stored.
"""
import io
import os
import re
import threading

import numpy as np
import torch
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from scipy.io import wavfile
from transformers import AutoTokenizer, VitsModel

# BCP 47 code from the widgets -> MMS model code.
LANGS = {"om": "orm", "am": "amh", "ti": "tir", "so": "som", "en": "eng"}
PRELOAD = os.environ.get("PRELOAD", "om").split(",")
TOKEN = os.environ.get("SPEAK_TOKEN", "")

torch.set_num_threads(max(1, os.cpu_count() or 1))
app = FastAPI(title="Digital Bridge voices")
_models: dict = {}
_lock = threading.Lock()


def load(lang: str):
    """Load a voice once (about 150 MB each), then keep it in memory."""
    with _lock:
        if lang not in _models:
            name = f"facebook/mms-tts-{LANGS[lang]}"
            _models[lang] = (AutoTokenizer.from_pretrained(name), VitsModel.from_pretrained(name).eval())
        return _models[lang]


def romanise(text: str, tokenizer) -> str:
    # Some MMS voices were trained on romanised text (uroman); the tokenizer says which.
    if not getattr(tokenizer, "is_uroman", False):
        return text
    import uroman as ur  # imported only when needed

    return ur.Uroman().romanize_string(text)


def split(text: str) -> list[str]:
    # Short pieces sound more natural and keep memory low; empty pieces are dropped.
    parts = re.split(r"(?<=[.!?።፧])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]


class SpeakBody(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    lang: str = "om"


@app.on_event("startup")
def warm_up() -> None:
    # Load the main voice in the background so the first request after a restart is faster.
    for lang in PRELOAD:
        if lang in LANGS:
            threading.Thread(target=load, args=(lang,), daemon=True).start()


@app.get("/")
def health():
    return {"status": "ok", "languages": sorted(LANGS), "loaded": sorted(_models)}


@app.post("/speak")
def speak(body: SpeakBody, authorization: str = Header(default="")):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    lang = body.lang.lower().split("-")[0].split("_")[0]
    if lang not in LANGS:
        raise HTTPException(status_code=404, detail="Language not offered")
    tokenizer, model = load(lang)
    rate = model.config.sampling_rate
    pause = np.zeros(int(rate * 0.25), dtype=np.float32)
    pieces = []
    for part in split(body.text):
        inputs = tokenizer(romanise(part, tokenizer), return_tensors="pt")
        if inputs["input_ids"].shape[-1] == 0:
            continue
        with torch.no_grad():
            wave = model(**inputs).waveform[0].cpu().numpy()
        pieces += [wave, pause]
    if not pieces:
        raise HTTPException(status_code=422, detail="Nothing to say")
    audio = np.concatenate(pieces)
    buffer = io.BytesIO()
    wavfile.write(buffer, rate, (np.clip(audio, -1, 1) * 32767).astype(np.int16))
    return Response(content=buffer.getvalue(), media_type="audio/wav", headers={"Cache-Control": "public, max-age=86400"})
