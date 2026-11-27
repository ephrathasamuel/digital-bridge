"""
Make read aloud clips for every fixed string of the language packs, piece by piece (see mms_text.pieces), with the
ONNX voices. Runs in GitHub Actions (.github/workflows/voice-clips.yml) on a fast machine, so phones only play
small MP3 files. Writes <out>/<lang>/<key>.mp3 and <out>/<lang>/index.json (the list of keys).

    python make_clips.py <voices_dir> <out_dir> om,am,ti,so
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
import onnxruntime as ort

from mms_text import MmsText, clip_key, pieces

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
PLACEHOLDER = re.compile(r"\{[a-zA-Z_]+\}")
PACK_LINE = re.compile(r'^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"', re.M)


def strings(lang: str) -> list[str]:
    if lang == "am":
        with open(os.path.join(ROOT, "apps/web-components/src/i18n/am.json"), encoding="utf-8") as f:
            return list(json.load(f).values())
    with open(os.path.join(ROOT, f"apps/api/src/translate/packs/{lang}.ts"), encoding="utf-8") as f:
        return [json.loads(f'"{value}"') for _, value in PACK_LINE.findall(f.read())]


def mp3(wave: np.ndarray, rate: int, path: str) -> None:
    pcm = (np.clip(wave, -1, 1) * 32767).astype("<i2").tobytes()
    # Constant bit rate, no Xing or ID3 header: the widget joins clips byte by byte into one sound.
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", "32k", "-write_xing", "0", "-id3v2_version", "0", path],
        input=pcm, check=True,
    )


def make(lang: str, voices: str, out: str) -> None:
    with open(os.path.join(voices, f"mms-{lang}.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    text = MmsText(cfg)
    session = ort.InferenceSession(os.path.join(voices, f"mms-{lang}.onnx"), providers=["CPUExecutionProvider"])
    rate = cfg["sampling_rate"]
    gap = np.zeros(int(rate * 0.12), dtype=np.float32)
    todo: dict[str, list[int]] = {}
    for s in strings(lang):
        for piece in pieces(PLACEHOLDER.sub(",", s)):
            ids = text.ids(piece)
            if len(ids) > 1:
                todo.setdefault(clip_key(ids), ids)
    folder = os.path.join(out, lang)
    os.makedirs(folder, exist_ok=True)
    for i, (key, ids) in enumerate(todo.items()):
        wave = session.run(None, {"input_ids": np.array([ids], dtype=np.int64)})[0][0]
        mp3(np.concatenate([wave, gap]), rate, os.path.join(folder, f"{key}.mp3"))
        if i % 200 == 0:
            print(f"{lang}: {i}/{len(todo)}", flush=True)
    with open(os.path.join(folder, "index.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(todo), f, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(folder, n)) for n in os.listdir(folder)) / 1e6
    print(f"::notice::{lang}: {len(todo)} clips, {size:.1f} MB", flush=True)


if __name__ == "__main__":
    voices, out = sys.argv[1], sys.argv[2]
    for lang in sys.argv[3].split(","):
        make(lang, voices, out)
