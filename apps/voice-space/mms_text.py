"""
Text to MMS voice token ids without transformers or torch, so the ONNX voice server stays small.
Follows the rules of transformers' VitsTokenizer; export_onnx.py checks both give the same ids for every voice.
"""
import re

SPLIT = re.compile(r"(?<=[.!?።፧])\s+|\n+")


def split(text: str) -> list[str]:
    # Short pieces sound more natural and keep memory low; empty pieces are dropped.
    return [p.strip() for p in SPLIT.split(text) if p.strip()]


def romanise(text: str) -> str:
    import uroman as ur  # imported only when a voice needs it

    global _uroman
    if _uroman is None:
        _uroman = ur.Uroman()
    return _uroman.romanize_string(text)


_uroman = None


class MmsText:
    """cfg is the voice's .json file written by export_onnx.py."""

    def __init__(self, cfg: dict, lang: str | None = None):
        # lang (om, am, ti, so) turns digits into number words first; the voices skip digits.
        self.lang = lang
        self.vocab: dict = cfg["vocab"]
        self.words = sorted((w for w in self.vocab if len(w) > 1), key=len, reverse=True)
        self.normalize = cfg.get("normalize", True)
        self.add_blank = cfg.get("add_blank", True)
        self.is_uroman = cfg.get("is_uroman", False)

    def _normalize(self, text: str) -> str:
        # Keep anything the vocabulary has as is (also multi letter entries), lower case the rest.
        out, i = [], 0
        while i < len(text):
            word = next((w for w in self.words if text.startswith(w, i)), None)
            if word is None and text[i] in self.vocab:
                word = text[i]
            if word:
                out.append(word)
                i += len(word)
            else:
                out.append(text[i].lower())
                i += 1
        return "".join(out)

    def ids(self, text: str) -> list[int]:
        if self.lang:
            from numbers_words import spell_numbers

            text = spell_numbers(text, self.lang)
        if self.is_uroman:
            text = romanise(text)
        if self.normalize:
            text = self._normalize(text)
        text = "".join(c for c in text if c in self.vocab).strip()
        ids = [self.vocab[c] for c in text]
        if not self.add_blank:
            return ids
        out = [0] * (len(ids) * 2 + 1)
        out[1::2] = ids
        return out


# Read aloud clips (make_clips.py and apps/web-components/src/tts/clipVoice.ts): text is cut into pieces at
# punctuation, and each piece's clip is named after its token ids, so case and punctuation never matter.
PIECE_SPLIT = re.compile(r"[,:;.!?،፡-፨\n]+")


def pieces(text: str) -> list[str]:
    return [p.strip() for p in PIECE_SPLIT.split(text) if p.strip()]


def clip_key(ids: list[int]) -> str:
    """FNV-1a 32 bit of the ids joined by commas, as 8 hex digits."""
    h = 0x811C9DC5
    for byte in ",".join(map(str, ids)).encode():
        h = ((h ^ byte) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"
