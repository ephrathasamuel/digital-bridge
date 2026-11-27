---
title: Digital Bridge Voices
emoji: 🔊
colorFrom: blue
colorTo: yellow
sdk: docker
app_port: 7860
license: cc-by-nc-4.0
short_description: Open read aloud voices for Afaan Oromoo, Amharic, Tigrinya, Somali
---

# Digital Bridge voices

Meta's open [MMS](https://huggingface.co/facebook/mms-tts) text to speech voices behind one route, so the Digital
Bridge widgets can read Afaan Oromoo, Amharic, Tigrinya and Somali aloud on devices that have no voice for them.
The voices are converted to ONNX, so the server needs no PyTorch and fits a free 512 MB host.

* `POST /speak` with `{"text": "...", "lang": "om"}` returns `audio/wav`. Languages: `om`, `am`, `ti`, `so`, `en`.
* `GET /` shows which voices are offered and loaded.

## How the voices are made

`.github/workflows/voices.yml` (run by hand in the Actions tab) runs `export_onnx.py`: it converts each
`facebook/mms-tts-*` voice, checks `mms_text.py` against the transformers tokenizer and the ONNX output against
the original model, then attaches `mms-<lang>.onnx`, `mms-<lang>.json` and `SHA256SUMS` to the release `voices-v1`.
The `Dockerfile` downloads that release and checks the sums when it builds.

## Run it on Render (free)

1. New, then Web Service, then pick this repo. Language **Docker**, Root Directory `apps/voice-space`,
   instance type **Free**.
2. Environment: `SPEAK_TOKEN` = a long random code. Optional: `MAX_LOADED` (voices kept in memory, default 2,
   about 150 MB each) and `PRELOAD` (voice loaded at start, default `om`).
3. On the Digital Bridge API set `TTS_PROVIDER=custom`, `TTS_URL=https://<service>.onrender.com/speak` and
   `TTS_AUTH_HEADER=Bearer <the same code>`.

It also runs as a Hugging Face Docker Space or on any Docker host (port `PORT`, default 7860).
A free Render service sleeps after 15 minutes without requests; the first request after that takes up to a minute.

The MMS voices are licensed CC BY NC 4.0: non commercial use only. Text is never logged or stored.
