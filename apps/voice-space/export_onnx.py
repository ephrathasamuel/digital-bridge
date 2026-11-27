"""
Convert Meta's MMS voices to ONNX so the voice server runs without PyTorch (fits a 512 MB free server).
Runs in GitHub Actions (.github/workflows/voices.yml); writes mms-<lang>.onnx and mms-<lang>.json per voice.

    python export_onnx.py <out_dir>

For each voice it checks that mms_text.py gives the same ids as transformers, and that the ONNX file
speaks short and long text about as long as the original model does.
"""
import json
import os
import sys

import numpy as np
import onnxruntime as ort
import torch
from transformers import AutoTokenizer, VitsModel

from mms_text import MmsText, romanise

RUNS = 7
LANGS = {"om": "orm", "am": "amh", "ti": "tir", "so": "som", "en": "eng"}
SAMPLES = {
    "om": ["Akkam.", "Akkam jirtu? Maaloo unka kana guutaa, booda Itti fufi tuqaa. Gaaffii yoo qabaattan nu gaafadhaa."],
    "am": ["ሰላም።", "ሰላም፣ እንዴት ናችሁ? እባክዎ ይህን ቅጽ ይሙሉ፣ ከዚያ ቀጥል የሚለውን ይጫኑ። ጥያቄ ካለዎት ይጠይቁን።"],
    "ti": ["ሰላም።", "ሰላም፣ ከመይ ኣለኹም? በጃኹም እዚ ቅጥዒ ምልኡ፣ ድሕሪኡ ቀጽል ጠውቑ። ሕቶ እንተሃልዩኩም ሕተቱና።"],
    "so": ["Salaan.", "Soo dhawoow! Fadlan buuxi foomkan, kadibna riix Sii wad. Haddii aad su'aal qabto, na weydii."],
    "en": ["Hello.", "Welcome! Please fill in this form, then press Next. If you have a question, ask us."],
}


def fail(message: str) -> None:
    # "::error::" shows the message as a GitHub annotation, readable without signing in.
    print(f"::error::{message}", flush=True)
    sys.exit(1)


class Wave(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids):
        return self.model(input_ids=input_ids).waveform


def export(lang: str, name: str, out: str) -> None:
    base = lang.split("-")[0]  # am-natural uses the am samples
    tok = AutoTokenizer.from_pretrained(name)
    model = VitsModel.from_pretrained(name).eval()
    cfg = {
        "model": name,
        "license": "CC BY-NC 4.0",
        "sampling_rate": model.config.sampling_rate,
        "is_uroman": bool(getattr(tok, "is_uroman", False)),
        "normalize": bool(getattr(tok, "normalize", True)),
        "add_blank": bool(getattr(tok, "add_blank", True)),
        "vocab": dict(tok.encoder),
    }
    text = MmsText(cfg)

    # 1. Our tokenizer must keep the same letters as transformers (also with capitals and odd characters).
    # The blanks are added like Meta's original MMS code (one between every letter): transformers drops one
    # when a letter shares id 0 with the blank (Somali "u" in "buuxi"), so it is not the reference for that part.
    tok.add_blank = False
    for sample in SAMPLES[base] + [SAMPLES[base][0].upper() + " 123 ?!", "buuxi uu aa"]:
        letters = tok(romanise(sample) if cfg["is_uroman"] else sample).input_ids
        theirs = [0] * (len(letters) * 2 + 1) if cfg["add_blank"] else letters
        if cfg["add_blank"]:
            theirs[1::2] = letters
        ours = text.ids(sample)
        if theirs != ours:
            fail(f"{lang}: token ids differ for {sample!r} theirs {theirs} ours {ours}")

    path = os.path.join(out, f"mms-{lang}.onnx")
    example = torch.tensor([text.ids(SAMPLES[base][1])])
    with torch.no_grad():
        torch.onnx.export(
            Wave(model), (example,), path, input_names=["input_ids"], output_names=["waveform"],
            dynamic_axes={"input_ids": {0: "batch", 1: "tokens"}, "waveform": {0: "batch", 1: "samples"}},
            opset_version=17,
        )

    # 2. ONNX must follow the text length (not the example's), and match the original. The voice picks its speed
    # with some randomness on every run, so compare the middle value of several runs, not one run.
    session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    lengths = []
    for sample in SAMPLES[base]:
        ids = torch.tensor([text.ids(sample)])
        with torch.no_grad():
            want = np.median([model(input_ids=ids).waveform.shape[-1] for _ in range(RUNS)])
        waves = [session.run(None, {"input_ids": ids.numpy()})[0] for _ in range(RUNS)]
        got = np.median([w.shape[-1] for w in waves])
        if not all(np.isfinite(w).all() for w in waves) or not 0.8 < got / want < 1.25:
            fail(f"{lang}: ONNX gave {got:.0f} samples (middle of {RUNS}), original {want:.0f}, for {sample!r}")
        lengths.append(int(got))
    # A single letter must work too (the attention padding was traced with a long example).
    for word in ("a", SAMPLES[base][0][:2]):
        ids = text.ids(word)
        try:
            ok = len(ids) <= 1 or np.isfinite(session.run(None, {"input_ids": np.array([ids])})[0]).all()
        except Exception as error:  # noqa: BLE001 (report any runtime error as a failed check)
            ok = False
            print(error, flush=True)
        if not ok:
            fail(f"{lang}: ONNX failed on the very short text {word!r}")
    if lengths[1] < lengths[0] * 2:
        fail(f"{lang}: long text is not longer than short text ({lengths}); shapes were frozen in export")

    with open(os.path.join(out, f"mms-{lang}.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False)
    print(f"{lang}: ok, {os.path.getsize(path) / 1e6:.0f} MB, samples {lengths}", flush=True)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "voices"
    os.makedirs(out, exist_ok=True)
    # Each entry is a language code (Meta's voice) or name=model for another MMS based voice,
    # e.g. am-natural=natidotnet/mms-tts-amharic-finetuned.
    for entry in (sys.argv[2].split(",") if len(sys.argv) > 2 else LANGS):
        lang, _, model = entry.partition("=")
        export(lang, model or f"facebook/mms-tts-{LANGS[lang]}", out)
