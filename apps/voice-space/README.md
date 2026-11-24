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

* `POST /speak` with `{"text": "...", "lang": "om"}` returns `audio/wav`. Languages: `om`, `am`, `ti`, `so`, `en`.
* `GET /` shows which voices are loaded.

## Run it on a free Hugging Face Space

1. Create a new Space, choose **Docker** (blank) and the free **CPU basic** hardware.
2. Upload `app.py`, `requirements.txt`, `Dockerfile` and this `README.md`.
3. In the Space **Settings**, add the secret `SPEAK_TOKEN` (a long random code).
4. On the Digital Bridge API set `TTS_PROVIDER=custom`, `TTS_URL=https://<user>-<space>.hf.space/speak` and
   `TTS_AUTH_HEADER=Bearer <the same code>`.

A free Space sleeps after 48 hours without visitors; the first request after that takes about 30 seconds while it
starts. Each new sentence then takes about 1 to 3 seconds.

The MMS models are licensed CC BY NC 4.0: non commercial use only. Text is never logged or stored.
